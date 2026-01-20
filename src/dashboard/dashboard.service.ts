import { Injectable, NotFoundException } from '@nestjs/common';
import { DashboardRepository } from './dashboard.repository';
import { EventsService } from '../events/events.service';
import {
  DashboardTotals,
  TimeSeriesResponse,
  TopProductsResponse,
  SaleCreatedEvent,
  SaleCreatedPayload,
  ConsumptionUpdatedPayload,
} from './interfaces/dashboard-events.interface';

@Injectable()
export class DashboardService {
  constructor(
    private readonly repository: DashboardRepository,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Get dashboard totals for an event
   */
  async getTotals(
    eventId: number,
    barId: number | null = null,
    from: Date | null = null,
    to: Date | null = null,
  ): Promise<DashboardTotals> {
    // Validate event exists
    await this.eventsService.findById(eventId);

    // If barId provided, validate it belongs to the event
    if (barId !== null) {
      const bar = await this.repository.getBarWithEvent(barId);
      if (!bar || bar.event.id !== eventId) {
        throw new NotFoundException(`Bar with ID ${barId} not found in event ${eventId}`);
      }
    }

    const [salesTotals, consumptionByDrink, totalConsumption] = await Promise.all([
      this.repository.getSalesTotals(eventId, barId, from, to),
      this.repository.getConsumptionByDrink(eventId, barId, from, to),
      this.repository.getTotalConsumption(eventId, barId, from, to),
    ]);

    return {
      sales: {
        totalAmount: salesTotals.totalAmount,
        totalUnits: salesTotals.totalUnits,
        orderCount: salesTotals.orderCount,
      },
      consumption: {
        totalMl: totalConsumption,
        byDrink: consumptionByDrink,
      },
    };
  }

  /**
   * Get time-series data for charts
   */
  async getTimeSeries(
    eventId: number,
    barId: number | null = null,
    bucket: string = '5m',
    from: Date | null = null,
    to: Date | null = null,
    cocktailId: number | null = null,
  ): Promise<TimeSeriesResponse> {
    // Validate event and get start time
    const event = await this.eventsService.findById(eventId);

    // Default time range: event start to now
    const effectiveFrom = from ?? new Date(event.startedAt);
    const effectiveTo = to ?? new Date();

    // If barId provided, validate it belongs to the event
    if (barId !== null) {
      const bar = await this.repository.getBarWithEvent(barId);
      if (!bar || bar.event.id !== eventId) {
        throw new NotFoundException(`Bar with ID ${barId} not found in event ${eventId}`);
      }
    }

    const series = await this.repository.getTimeSeriesSales(
      eventId,
      barId,
      bucket,
      effectiveFrom,
      effectiveTo,
      cocktailId,
    );

    return {
      bucketSize: bucket,
      series,
    };
  }

  /**
   * Get top products by units sold
   */
  async getTopProducts(
    eventId: number,
    barId: number | null = null,
    limit: number = 10,
    from: Date | null = null,
    to: Date | null = null,
  ): Promise<TopProductsResponse> {
    // Validate event exists
    await this.eventsService.findById(eventId);

    // If barId provided, validate it belongs to the event
    if (barId !== null) {
      const bar = await this.repository.getBarWithEvent(barId);
      if (!bar || bar.event.id !== eventId) {
        throw new NotFoundException(`Bar with ID ${barId} not found in event ${eventId}`);
      }
    }

    const products = await this.repository.getTopProducts(eventId, barId, limit, from, to);

    return { products };
  }

  /**
   * Build sale:created payload for WebSocket broadcast
   */
  async buildSaleCreatedPayload(data: SaleCreatedEvent): Promise<SaleCreatedPayload> {
    const cocktail = await this.repository.getCocktailWithPrice(
      data.sale.cocktailId,
      data.eventId,
    );

    return {
      type: 'sale:created',
      eventId: data.eventId,
      barId: data.barId,
      data: {
        saleId: data.sale.id,
        cocktailId: data.sale.cocktailId,
        cocktailName: cocktail?.name ?? 'Unknown',
        quantity: data.sale.quantity,
        totalAmount: (cocktail?.resolvedPrice ?? 0) * data.sale.quantity,
        createdAt: data.sale.createdAt,
      },
    };
  }

  /**
   * Build consumption:updated payload for WebSocket broadcast
   */
  async buildConsumptionPayload(data: SaleCreatedEvent): Promise<ConsumptionUpdatedPayload> {
    const depletionsWithNames = await Promise.all(
      data.depletions.map(async (d) => {
        const drink = await this.repository.getDrinkById(d.drinkId);
        return {
          drinkId: d.drinkId,
          drinkName: drink?.name ?? 'Unknown',
          supplierId: d.supplierId,
          quantityDeducted: d.quantityToDeduct,
        };
      }),
    );

    return {
      type: 'consumption:updated',
      eventId: data.eventId,
      barId: data.barId,
      data: {
        saleId: data.sale.id,
        depletions: depletionsWithNames,
      },
    };
  }

  /**
   * Get event ID for a bar
   */
  async getEventIdForBar(barId: number): Promise<number | null> {
    const bar = await this.repository.getBarWithEvent(barId);
    return bar?.event.id ?? null;
  }

  /**
   * Validate user has access to event
   */
  async validateEventAccess(eventId: number, userId: number): Promise<boolean> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    // For now, owner has access. Can extend to include managers/cashiers
    return event.owner.id === userId;
  }
}
