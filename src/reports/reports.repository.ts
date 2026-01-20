import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventReport, Event, Prisma } from '@prisma/client';
import {
  RemainingStockEntry,
  ConsumptionEntry,
  ConsumptionBySupplier,
  TopProductEntry,
  PeakHourEntry,
  TimeSeriesEntry,
  EligibleEventForComparison,
} from './interfaces/report.interface';

interface TopProductResult {
  cocktail_id: number;
  name: string;
  units: bigint;
  amount: bigint;
}

interface TimeSeriesResult {
  timestamp: Date;
  units: bigint;
  amount: bigint;
  order_count: bigint;
}

interface RemainingStockResult {
  bar_id: number;
  bar_name: string;
  drink_id: number;
  drink_name: string;
  supplier_id: number;
  supplier_name: string;
  quantity: number;
  unit_cost: number;
  ownership_mode: string;
}

interface ConsumptionResult {
  drink_id: number;
  drink_name: string;
  supplier_id: number;
  supplier_name: string;
  total_ml: bigint;
  unit_cost: number | null;
  ownership_mode: string | null;
}

interface SalesTotalsResult {
  total_amount: bigint;
  total_units: bigint;
  order_count: bigint;
}

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create or update a report for an event
   */
  async upsertReport(
    eventId: number,
    data: Omit<Prisma.EventReportUncheckedCreateInput, 'eventId'>,
  ): Promise<EventReport> {
    return this.prisma.eventReport.upsert({
      where: { eventId },
      create: { eventId, ...data },
      update: data,
    });
  }

  /**
   * Find report by event ID
   */
  async findByEventId(eventId: number): Promise<EventReport | null> {
    return this.prisma.eventReport.findUnique({
      where: { eventId },
      include: { event: { include: { owner: true } } },
    });
  }

  /**
   * Find all reports for events owned by a user
   */
  async findByOwnerId(ownerId: number): Promise<EventReport[]> {
    return this.prisma.eventReport.findMany({
      where: { event: { ownerId } },
      include: { event: { select: { id: true, name: true, startedAt: true, finishedAt: true } } },
      orderBy: { generatedAt: 'desc' },
    });
  }

  /**
   * Get event with owner
   */
  async getEventWithOwner(eventId: number) {
    return this.prisma.event.findUnique({
      where: { id: eventId },
      include: { owner: true, bars: true },
    });
  }

  /**
   * Get sales totals for an event
   */
  async getSalesTotals(eventId: number): Promise<{
    totalRevenue: number;
    totalUnits: number;
    orderCount: number;
  }> {
    const result = await this.prisma.$queryRaw<SalesTotalsResult[]>`
      SELECT
        COALESCE(SUM(s.quantity * COALESCE(ep.price, c.price)), 0) as total_amount,
        COALESCE(SUM(s.quantity), 0) as total_units,
        COUNT(s.id) as order_count
      FROM sale s
      JOIN "Bar" b ON s.bar_id = b.id
      JOIN "Cocktail" c ON s.cocktail_id = c.id
      LEFT JOIN event_price ep ON ep.event_id = ${eventId} AND ep.cocktail_id = c.id
      WHERE b."eventId" = ${eventId}
    `;

    const row = result[0] || { total_amount: 0n, total_units: 0n, order_count: 0n };
    return {
      totalRevenue: Number(row.total_amount),
      totalUnits: Number(row.total_units),
      orderCount: Number(row.order_count),
    };
  }

  /**
   * Get top products by units sold
   */
  async getTopProducts(eventId: number, limit: number = 10): Promise<TopProductEntry[]> {
    const result = await this.prisma.$queryRaw<TopProductResult[]>`
      SELECT
        c.id as cocktail_id,
        c.name,
        SUM(s.quantity) as units,
        SUM(s.quantity * COALESCE(ep.price, c.price)) as amount
      FROM sale s
      JOIN "Bar" b ON s.bar_id = b.id
      JOIN "Cocktail" c ON s.cocktail_id = c.id
      LEFT JOIN event_price ep ON ep.event_id = ${eventId} AND ep.cocktail_id = c.id
      WHERE b."eventId" = ${eventId}
      GROUP BY c.id, c.name
      ORDER BY units DESC
      LIMIT ${limit}
    `;

    // Calculate total units for share percent
    const totalUnits = result.reduce((sum, r) => sum + Number(r.units), 0);

    return result.map((row) => ({
      cocktailId: row.cocktail_id,
      name: row.name,
      unitsSold: Number(row.units),
      revenue: Number(row.amount),
      sharePercent: totalUnits > 0 ? Math.round((Number(row.units) / totalUnits) * 10000) / 100 : 0,
    }));
  }

  /**
   * Get time-series sales data bucketed by hour
   */
  async getTimeSeriesByHour(eventId: number): Promise<TimeSeriesEntry[]> {
    const result = await this.prisma.$queryRaw<TimeSeriesResult[]>`
      SELECT
        date_trunc('hour', s.created_at) as timestamp,
        SUM(s.quantity) as units,
        SUM(s.quantity * COALESCE(ep.price, c.price)) as amount,
        COUNT(s.id) as order_count
      FROM sale s
      JOIN "Bar" b ON s.bar_id = b.id
      JOIN "Cocktail" c ON s.cocktail_id = c.id
      LEFT JOIN event_price ep ON ep.event_id = ${eventId} AND ep.cocktail_id = c.id
      WHERE b."eventId" = ${eventId}
      GROUP BY date_trunc('hour', s.created_at)
      ORDER BY timestamp ASC
    `;

    return result.map((row) => ({
      timestamp: row.timestamp,
      units: Number(row.units),
      amount: Number(row.amount),
    }));
  }

  /**
   * Get peak hours (hours with highest activity)
   */
  async getPeakHours(eventId: number, limit: number = 5): Promise<PeakHourEntry[]> {
    const result = await this.prisma.$queryRaw<TimeSeriesResult[]>`
      SELECT
        date_trunc('hour', s.created_at) as timestamp,
        SUM(s.quantity) as units,
        SUM(s.quantity * COALESCE(ep.price, c.price)) as amount,
        COUNT(s.id) as order_count
      FROM sale s
      JOIN "Bar" b ON s.bar_id = b.id
      JOIN "Cocktail" c ON s.cocktail_id = c.id
      LEFT JOIN event_price ep ON ep.event_id = ${eventId} AND ep.cocktail_id = c.id
      WHERE b."eventId" = ${eventId}
      GROUP BY date_trunc('hour', s.created_at)
      ORDER BY units DESC
      LIMIT ${limit}
    `;

    return result.map((row) => ({
      hour: row.timestamp.toISOString(),
      units: Number(row.units),
      revenue: Number(row.amount),
      orderCount: Number(row.order_count),
    }));
  }

  /**
   * Get remaining stock with valuation for all bars in an event
   */
  async getRemainingStock(eventId: number): Promise<RemainingStockEntry[]> {
    const result = await this.prisma.$queryRaw<RemainingStockResult[]>`
      SELECT
        s.bar_id,
        b.name as bar_name,
        s.drink_id,
        d.name as drink_name,
        s.supplier_id,
        sup.name as supplier_name,
        s.quantity,
        s.unit_cost,
        s.ownership_mode
      FROM "Stock" s
      JOIN "Bar" b ON s.bar_id = b.id
      JOIN "Drink" d ON s.drink_id = d.id
      JOIN supplier sup ON s.supplier_id = sup.id
      WHERE b."eventId" = ${eventId}
        AND s.quantity > 0
      ORDER BY b.name, d.name, sup.name
    `;

    return result.map((row) => ({
      barId: row.bar_id,
      barName: row.bar_name,
      drinkId: row.drink_id,
      drinkName: row.drink_name,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      quantity: row.quantity,
      unitCost: row.unit_cost,
      totalValue: row.quantity * row.unit_cost,
      ownershipMode: row.ownership_mode as 'purchased' | 'consignment',
    }));
  }

  /**
   * Get consumption with cost breakdown by drink and supplier
   * Uses inventory movements joined with stock to get unit cost
   */
  async getConsumptionWithCost(eventId: number): Promise<ConsumptionEntry[]> {
    const result = await this.prisma.$queryRaw<ConsumptionResult[]>`
      SELECT
        im.drink_id,
        d.name as drink_name,
        im.supplier_id,
        sup.name as supplier_name,
        ABS(SUM(im.quantity)) as total_ml,
        s.unit_cost,
        s.ownership_mode
      FROM inventory_movement im
      JOIN "Bar" b ON im.bar_id = b.id
      JOIN "Drink" d ON im.drink_id = d.id
      JOIN supplier sup ON im.supplier_id = sup.id
      LEFT JOIN "Stock" s ON s.bar_id = im.bar_id
        AND s.drink_id = im.drink_id
        AND s.supplier_id = im.supplier_id
      WHERE b."eventId" = ${eventId}
        AND im.type = 'sale'
      GROUP BY im.drink_id, d.name, im.supplier_id, sup.name, s.unit_cost, s.ownership_mode
      ORDER BY d.name, sup.name
    `;

    // Group by drink
    const drinkMap = new Map<number, ConsumptionEntry>();

    for (const row of result) {
      const drinkId = row.drink_id;
      const unitCost = row.unit_cost ?? 0;
      const totalMl = Number(row.total_ml);
      const cost = totalMl * unitCost;

      const supplierEntry: ConsumptionBySupplier = {
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        quantity: totalMl,
        unitCost,
        cost,
        ownershipMode: (row.ownership_mode as 'purchased' | 'consignment') ?? 'purchased',
      };

      if (drinkMap.has(drinkId)) {
        const entry = drinkMap.get(drinkId)!;
        entry.totalMl += totalMl;
        entry.totalCost += cost;
        entry.bySupplier.push(supplierEntry);
      } else {
        drinkMap.set(drinkId, {
          drinkId,
          drinkName: row.drink_name,
          totalMl,
          totalCost: cost,
          bySupplier: [supplierEntry],
        });
      }
    }

    return Array.from(drinkMap.values());
  }

  // ============= COMPARISON METHODS =============

  /**
   * Find events eligible for comparison (finished events with generated reports)
   */
  async findEligibleEventsForComparison(
    ownerId: number,
  ): Promise<EligibleEventForComparison[]> {
    const events = await this.prisma.event.findMany({
      where: {
        ownerId,
        finishedAt: { not: null },
      },
      include: {
        report: { select: { id: true } },
      },
      orderBy: { finishedAt: 'desc' },
    });

    return events.map((event) => {
      const startedAt = new Date(event.startedAt);
      const finishedAt = new Date(event.finishedAt!);
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const durationHours = Math.round((durationMs / 3600000) * 100) / 100;

      return {
        eventId: event.id,
        eventName: event.name,
        startedAt,
        finishedAt,
        durationHours,
        hasReport: event.report !== null,
      };
    });
  }

  /**
   * Get multiple reports by event IDs with event data
   */
  async findReportsByEventIds(
    eventIds: number[],
  ): Promise<(EventReport & { event: Event })[]> {
    return this.prisma.eventReport.findMany({
      where: { eventId: { in: eventIds } },
      include: { event: true },
    });
  }

  /**
   * Validate that all events belong to the owner
   */
  async validateEventsOwnership(
    eventIds: number[],
    ownerId: number,
  ): Promise<boolean> {
    const count = await this.prisma.event.count({
      where: {
        id: { in: eventIds },
        ownerId,
      },
    });
    return count === eventIds.length;
  }

  /**
   * Get events by IDs with owner info
   */
  async getEventsByIds(eventIds: number[]) {
    return this.prisma.event.findMany({
      where: { id: { in: eventIds } },
      include: { owner: true },
    });
  }
}
