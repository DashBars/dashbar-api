import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ReportsRepository } from './reports.repository';
import { EventsService } from '../events/events.service';
import { NotOwnerException } from '../common/exceptions';
import { EventReport, Event } from '@prisma/client';
import {
  ReportData,
  RemainingStockSummary,
  EligibleEventForComparison,
  EventComparisonReport,
  EventComparisonRow,
  CrossEventProduct,
  CrossEventProductByEvent,
  PeakTimePattern,
  ComparisonInsight,
  TopProductEntry,
  PeakHourEntry,
  TimeSeriesEntry,
  EventTimeSeries,
} from './interfaces/report.interface';

@Injectable()
export class ReportsService {
  constructor(
    private readonly repository: ReportsRepository,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Generate a report for an event
   * Only the event owner can generate reports
   * Report can be regenerated (upsert behavior)
   */
  async generateReport(eventId: number, userId: number): Promise<EventReport> {
    // 1. Validate event exists and user is owner
    const event = await this.repository.getEventWithOwner(eventId);
    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    if (event.ownerId !== userId) {
      throw new NotOwnerException();
    }

    // 2. Check if event has finished (warning if not, but still allow generation)
    const warnings: string[] = [];
    if (!event.finishedAt) {
      warnings.push('Event has not finished yet. Report may be incomplete.');
    }

    // 3. Aggregate sales data
    const salesTotals = await this.repository.getSalesTotals(eventId);
    const topProducts = await this.repository.getTopProducts(eventId, 10);
    const timeSeries = await this.repository.getTimeSeriesByHour(eventId);
    const peakHours = await this.repository.getPeakHours(eventId, 5);

    // 4. Get remaining stock with valuation
    const remainingStockItems = await this.repository.getRemainingStock(eventId);
    const remainingStock: RemainingStockSummary = {
      totalValue: remainingStockItems.reduce((sum, item) => sum + item.totalValue, 0),
      purchasedValue: remainingStockItems
        .filter((item) => item.ownershipMode === 'purchased')
        .reduce((sum, item) => sum + item.totalValue, 0),
      consignmentValue: remainingStockItems
        .filter((item) => item.ownershipMode === 'consignment')
        .reduce((sum, item) => sum + item.totalValue, 0),
      items: remainingStockItems,
    };

    // 5. Get consumption with cost (COGS)
    const consumptionByDrink = await this.repository.getConsumptionWithCost(eventId);
    const totalCOGS = consumptionByDrink.reduce((sum, item) => sum + item.totalCost, 0);

    // Check for missing cost data
    const missingCostItems = consumptionByDrink.filter(
      (item) => item.bySupplier.some((s) => s.unitCost === 0),
    );
    if (missingCostItems.length > 0) {
      warnings.push(
        `Missing unit cost for ${missingCostItems.length} drink(s): ${missingCostItems.map((i) => i.drinkName).join(', ')}. COGS may be underestimated.`,
      );
    }

    // 6. Calculate financial metrics
    const grossProfit = salesTotals.totalRevenue - totalCOGS;

    // 7. Persist report
    const report = await this.repository.upsertReport(eventId, {
      totalRevenue: salesTotals.totalRevenue,
      totalCOGS: totalCOGS,
      grossProfit,
      totalUnitsSold: salesTotals.totalUnits,
      totalOrderCount: salesTotals.orderCount,
      topProducts: topProducts as any,
      peakHours: peakHours as any,
      timeSeries: timeSeries as any,
      remainingStock: remainingStock as any,
      consumptionByDrink: consumptionByDrink as any,
      warnings,
    });

    return report;
  }

  /**
   * Get a report for an event
   * Only the event owner can view reports
   */
  async findByEvent(eventId: number, userId: number): Promise<ReportData> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const report = await this.repository.findByEventId(eventId);
    if (!report) {
      throw new NotFoundException(`Report for event ${eventId} not found. Generate it first.`);
    }

    // Transform to ReportData
    const marginPercent =
      report.totalRevenue > 0
        ? Math.round((report.grossProfit / report.totalRevenue) * 10000) / 100
        : 0;

    return {
      summary: {
        totalRevenue: report.totalRevenue,
        totalCOGS: report.totalCOGS,
        grossProfit: report.grossProfit,
        marginPercent,
        totalUnitsSold: report.totalUnitsSold,
        totalOrderCount: report.totalOrderCount,
      },
      topProducts: report.topProducts as any,
      peakHours: report.peakHours as any,
      timeSeries: report.timeSeries as any,
      remainingStock: report.remainingStock as any,
      consumptionByDrink: report.consumptionByDrink as any,
      warnings: report.warnings,
    };
  }

  /**
   * Get the raw report entity for an event
   */
  async findReportEntity(eventId: number, userId: number): Promise<EventReport> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const report = await this.repository.findByEventId(eventId);
    if (!report) {
      throw new NotFoundException(`Report for event ${eventId} not found. Generate it first.`);
    }

    return report;
  }

  /**
   * List all reports for the authenticated user's events
   */
  async findAllByOwner(userId: number): Promise<EventReport[]> {
    return this.repository.findByOwnerId(userId);
  }

  /**
   * Check if a report exists for an event
   */
  async hasReport(eventId: number): Promise<boolean> {
    const report = await this.repository.findByEventId(eventId);
    return report !== null;
  }

  // ============= COMPARISON METHODS =============

  /**
   * List events eligible for comparison
   */
  async findEligibleForComparison(
    userId: number,
  ): Promise<EligibleEventForComparison[]> {
    return this.repository.findEligibleEventsForComparison(userId);
  }

  /**
   * Generate comparison report for multiple events
   */
  async generateComparison(
    eventIds: number[],
    userId: number,
  ): Promise<EventComparisonReport> {
    // 1. Validate ownership of all events
    const allOwned = await this.repository.validateEventsOwnership(eventIds, userId);
    if (!allOwned) {
      throw new NotOwnerException();
    }

    // 2. Load reports with event data
    const reports = await this.repository.findReportsByEventIds(eventIds);

    // Check all events have reports
    const missingReports = eventIds.filter(
      (id) => !reports.find((r) => r.eventId === id),
    );
    if (missingReports.length > 0) {
      throw new BadRequestException(
        `Missing reports for events: ${missingReports.join(', ')}. Generate reports first.`,
      );
    }

    // 3. Build comparison rows with normalized metrics
    const eventComparison = this.buildEventComparisonRows(reports);

    // 4. Analyze cross-event products
    const crossEventProducts = this.analyzeCrossEventProducts(reports);

    // 5. Analyze peak time patterns
    const peakTimePatterns = this.analyzePeakTimePatterns(reports);

    // 6. Build time series by event
    const timeSeriesByEvent = this.buildTimeSeriesByEvent(reports);

    // 7. Generate insights
    const insights = this.generateInsights(
      eventComparison,
      crossEventProducts,
      peakTimePatterns,
    );

    return {
      generatedAt: new Date(),
      eventIds,
      eventComparison,
      crossEventProducts,
      peakTimePatterns,
      timeSeriesByEvent,
      insights,
    };
  }

  /**
   * Build comparison rows for each event with normalized metrics
   */
  private buildEventComparisonRows(
    reports: (EventReport & { event: Event })[],
  ): EventComparisonRow[] {
    return reports.map((report) => {
      const event = report.event;
      if (!event.startedAt) {
        throw new Error(`Event ${event.id} has not started yet`);
      }
      const startedAt = new Date(event.startedAt);
      const finishedAt = event.finishedAt ? new Date(event.finishedAt) : startedAt;
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const durationHours = Math.max(durationMs / 3600000, 1); // Min 1 hour to avoid division by zero

      const marginPercent =
        report.totalRevenue > 0
          ? Math.round((report.grossProfit / report.totalRevenue) * 10000) / 100
          : 0;

      return {
        eventId: event.id,
        eventName: event.name,
        startedAt,
        finishedAt,
        durationHours: Math.round(durationHours * 100) / 100,
        // Totals
        totalRevenue: report.totalRevenue,
        totalCOGS: report.totalCOGS,
        grossProfit: report.grossProfit,
        marginPercent,
        totalUnitsSold: report.totalUnitsSold,
        totalOrderCount: report.totalOrderCount,
        // Normalized per hour
        revenuePerHour: Math.round(report.totalRevenue / durationHours),
        cogsPerHour: Math.round(report.totalCOGS / durationHours),
        unitsPerHour: Math.round((report.totalUnitsSold / durationHours) * 100) / 100,
        ordersPerHour: Math.round((report.totalOrderCount / durationHours) * 100) / 100,
      };
    });
  }

  /**
   * Analyze products appearing across multiple events
   */
  private analyzeCrossEventProducts(
    reports: (EventReport & { event: Event })[],
  ): CrossEventProduct[] {
    const productMap = new Map<number, CrossEventProduct>();

    for (const report of reports) {
      const topProducts = report.topProducts as unknown as TopProductEntry[];
      const event = report.event;

      topProducts.forEach((product, index) => {
        const existing = productMap.get(product.cocktailId);
        const eventEntry: CrossEventProductByEvent = {
          eventId: event.id,
          eventName: event.name,
          unitsSold: product.unitsSold,
          revenue: product.revenue,
          sharePercent: product.sharePercent,
          rank: index + 1,
        };

        if (existing) {
          existing.eventsAppeared++;
          existing.totalUnitsAcrossEvents += product.unitsSold;
          existing.totalRevenueAcrossEvents += product.revenue;
          existing.byEvent.push(eventEntry);
        } else {
          productMap.set(product.cocktailId, {
            cocktailId: product.cocktailId,
            name: product.name,
            eventsAppeared: 1,
            totalUnitsAcrossEvents: product.unitsSold,
            totalRevenueAcrossEvents: product.revenue,
            avgSharePercent: 0, // Will calculate after
            byEvent: [eventEntry],
          });
        }
      });
    }

    // Calculate average share percent and sort by appearances
    const products = Array.from(productMap.values());
    for (const product of products) {
      const totalShare = product.byEvent.reduce((sum, e) => sum + e.sharePercent, 0);
      product.avgSharePercent = Math.round((totalShare / product.byEvent.length) * 100) / 100;
    }

    // Sort by events appeared, then by total units
    return products.sort((a, b) => {
      if (b.eventsAppeared !== a.eventsAppeared) {
        return b.eventsAppeared - a.eventsAppeared;
      }
      return b.totalUnitsAcrossEvents - a.totalUnitsAcrossEvents;
    });
  }

  /**
   * Analyze peak time patterns across events
   */
  private analyzePeakTimePatterns(
    reports: (EventReport & { event: Event })[],
  ): PeakTimePattern[] {
    const hourMap = new Map<number, PeakTimePattern>();

    for (const report of reports) {
      const peakHours = report.peakHours as unknown as PeakHourEntry[];
      const event = report.event;

      // Only consider the top peak hour for pattern detection
      if (peakHours.length > 0) {
        const topPeak = peakHours[0];
        const peakDate = new Date(topPeak.hour);
        const hourOfDay = peakDate.getUTCHours();

        const existing = hourMap.get(hourOfDay);
        const eventDetail = {
          eventId: event.id,
          eventName: event.name,
          units: topPeak.units,
          revenue: topPeak.revenue,
        };

        if (existing) {
          existing.eventsWithPeak++;
          existing.eventDetails.push(eventDetail);
        } else {
          hourMap.set(hourOfDay, {
            hourOfDay,
            eventsWithPeak: 1,
            eventDetails: [eventDetail],
          });
        }
      }
    }

    // Sort by number of events with peak at that hour
    return Array.from(hourMap.values()).sort(
      (a, b) => b.eventsWithPeak - a.eventsWithPeak,
    );
  }

  /**
   * Build time series data for each event
   */
  private buildTimeSeriesByEvent(
    reports: (EventReport & { event: Event })[],
  ): EventTimeSeries[] {
    return reports.map((report) => ({
      eventId: report.event.id,
      eventName: report.event.name,
      series: report.timeSeries as unknown as TimeSeriesEntry[],
    }));
  }

  /**
   * Generate automatic insights from comparison data
   */
  private generateInsights(
    eventComparison: EventComparisonRow[],
    crossEventProducts: CrossEventProduct[],
    peakTimePatterns: PeakTimePattern[],
  ): ComparisonInsight[] {
    const insights: ComparisonInsight[] = [];
    const totalEvents = eventComparison.length;
    const threshold = Math.ceil(totalEvents / 2); // 50%+

    // 1. Consistent top products (appear in top 5 of >= 50% events)
    for (const product of crossEventProducts) {
      const inTop5 = product.byEvent.filter((e) => e.rank <= 5).length;
      if (inTop5 >= threshold) {
        insights.push({
          type: 'consistent_top_product',
          message: `${product.name} is a consistent top seller, appearing in top 5 of ${inTop5} of ${totalEvents} events`,
          data: {
            cocktailId: product.cocktailId,
            name: product.name,
            eventsInTop5: inTop5,
            totalEvents,
            avgSharePercent: product.avgSharePercent,
          },
        });
      }
    }

    // 2. Peak time patterns (same hour in >= 50% events)
    for (const pattern of peakTimePatterns) {
      if (pattern.eventsWithPeak >= threshold) {
        const hourStr = pattern.hourOfDay.toString().padStart(2, '0');
        insights.push({
          type: 'peak_time_pattern',
          message: `Peak activity consistently occurs around ${hourStr}:00 across ${pattern.eventsWithPeak} of ${totalEvents} events`,
          data: {
            hourOfDay: pattern.hourOfDay,
            eventsWithPeak: pattern.eventsWithPeak,
            totalEvents,
          },
        });
      }
    }

    // 3. Margin outliers (> 20% different from average)
    if (eventComparison.length >= 2) {
      const avgMargin =
        eventComparison.reduce((sum, e) => sum + e.marginPercent, 0) /
        eventComparison.length;

      for (const event of eventComparison) {
        const diff = Math.abs(event.marginPercent - avgMargin);
        if (diff > 20) {
          const direction = event.marginPercent > avgMargin ? 'high' : 'low';
          insights.push({
            type: 'margin_outlier',
            message: `${event.eventName} had unusually ${direction} margin (${event.marginPercent}% vs avg ${Math.round(avgMargin)}%)`,
            data: {
              eventId: event.eventId,
              eventName: event.eventName,
              marginPercent: event.marginPercent,
              avgMargin: Math.round(avgMargin * 100) / 100,
              difference: Math.round(diff * 100) / 100,
            },
          });
        }
      }

      // 4. Volume outliers (units/hour > 2x or < 0.5x average)
      const avgUnitsPerHour =
        eventComparison.reduce((sum, e) => sum + e.unitsPerHour, 0) /
        eventComparison.length;

      for (const event of eventComparison) {
        const ratio = event.unitsPerHour / avgUnitsPerHour;
        if (ratio > 2) {
          insights.push({
            type: 'volume_outlier',
            message: `${event.eventName} had exceptionally high volume (${event.unitsPerHour} units/hr vs avg ${Math.round(avgUnitsPerHour)})`,
            data: {
              eventId: event.eventId,
              eventName: event.eventName,
              unitsPerHour: event.unitsPerHour,
              avgUnitsPerHour: Math.round(avgUnitsPerHour * 100) / 100,
              ratio: Math.round(ratio * 100) / 100,
            },
          });
        } else if (ratio < 0.5) {
          insights.push({
            type: 'volume_outlier',
            message: `${event.eventName} had unusually low volume (${event.unitsPerHour} units/hr vs avg ${Math.round(avgUnitsPerHour)})`,
            data: {
              eventId: event.eventId,
              eventName: event.eventName,
              unitsPerHour: event.unitsPerHour,
              avgUnitsPerHour: Math.round(avgUnitsPerHour * 100) / 100,
              ratio: Math.round(ratio * 100) / 100,
            },
          });
        }
      }
    }

    return insights;
  }
}
