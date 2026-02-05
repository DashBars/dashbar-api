import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

interface SalesTotalsResult {
  total_amount: bigint;
  total_units: bigint;
  order_count: bigint;
}

interface ConsumptionByDrinkResult {
  drink_id: number;
  name: string;
  total_ml: bigint;
}

interface TimeSeriesResult {
  timestamp: Date;
  units: bigint;
  amount: bigint;
}

interface TopProductResult {
  cocktail_id: number;
  name: string;
  units: bigint;
  amount: bigint;
}

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Convert bucket string to PostgreSQL interval
   */
  private bucketToInterval(bucket: string): string {
    const mapping: Record<string, string> = {
      '1m': 'minute',
      '5m': '5 minutes',
      '15m': '15 minutes',
      '1h': 'hour',
    };
    return mapping[bucket] || '5 minutes';
  }

  /**
   * Get sales totals for an event or bar
   */
  async getSalesTotals(
    eventId: number,
    barId: number | null,
    from: Date | null,
    to: Date | null,
  ): Promise<{ totalAmount: number; totalUnits: number; orderCount: number }> {
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
        ${barId !== null ? Prisma.sql`AND s.bar_id = ${barId}` : Prisma.empty}
        ${from !== null ? Prisma.sql`AND s.created_at >= ${from}` : Prisma.empty}
        ${to !== null ? Prisma.sql`AND s.created_at <= ${to}` : Prisma.empty}
    `;

    const row = result[0] || { total_amount: 0n, total_units: 0n, order_count: 0n };
    return {
      totalAmount: Number(row.total_amount),
      totalUnits: Number(row.total_units),
      orderCount: Number(row.order_count),
    };
  }

  /**
   * Get consumption totals by drink
   */
  async getConsumptionByDrink(
    eventId: number,
    barId: number | null,
    from: Date | null,
    to: Date | null,
  ): Promise<Array<{ drinkId: number; name: string; totalMl: number }>> {
    const result = await this.prisma.$queryRaw<ConsumptionByDrinkResult[]>`
      SELECT
        im.drink_id,
        d.name,
        ABS(SUM(im.quantity)) as total_ml
      FROM inventory_movement im
      JOIN "Bar" b ON im.bar_id = b.id
      JOIN "Drink" d ON im.drink_id = d.id
      WHERE b."eventId" = ${eventId}
        AND im.type = 'sale'
        ${barId !== null ? Prisma.sql`AND im.bar_id = ${barId}` : Prisma.empty}
        ${from !== null ? Prisma.sql`AND im.created_at >= ${from}` : Prisma.empty}
        ${to !== null ? Prisma.sql`AND im.created_at <= ${to}` : Prisma.empty}
      GROUP BY im.drink_id, d.name
      ORDER BY total_ml DESC
    `;

    return result.map((row) => ({
      drinkId: row.drink_id,
      name: row.name,
      totalMl: Number(row.total_ml),
    }));
  }

  /**
   * Get total consumption in ml
   */
  async getTotalConsumption(
    eventId: number,
    barId: number | null,
    from: Date | null,
    to: Date | null,
  ): Promise<number> {
    const result = await this.prisma.$queryRaw<[{ total_ml: bigint }]>`
      SELECT COALESCE(ABS(SUM(im.quantity)), 0) as total_ml
      FROM inventory_movement im
      JOIN "Bar" b ON im.bar_id = b.id
      WHERE b."eventId" = ${eventId}
        AND im.type = 'sale'
        ${barId !== null ? Prisma.sql`AND im.bar_id = ${barId}` : Prisma.empty}
        ${from !== null ? Prisma.sql`AND im.created_at >= ${from}` : Prisma.empty}
        ${to !== null ? Prisma.sql`AND im.created_at <= ${to}` : Prisma.empty}
    `;

    return Number(result[0]?.total_ml || 0n);
  }

  /**
   * Get time-series sales data
   */
  async getTimeSeriesSales(
    eventId: number,
    barId: number | null,
    bucket: string,
    from: Date,
    to: Date,
    cocktailId: number | null,
  ): Promise<Array<{ timestamp: Date; units: number; amount: number }>> {
    const interval = this.bucketToInterval(bucket);

    const result = await this.prisma.$queryRaw<TimeSeriesResult[]>`
      SELECT
        date_trunc(${interval}, s.created_at) as timestamp,
        SUM(s.quantity) as units,
        SUM(s.quantity * COALESCE(ep.price, c.price)) as amount
      FROM sale s
      JOIN "Bar" b ON s.bar_id = b.id
      JOIN "Cocktail" c ON s.cocktail_id = c.id
      LEFT JOIN event_price ep ON ep.event_id = ${eventId} AND ep.cocktail_id = c.id
      WHERE b."eventId" = ${eventId}
        AND s.created_at >= ${from}
        AND s.created_at <= ${to}
        ${barId !== null ? Prisma.sql`AND s.bar_id = ${barId}` : Prisma.empty}
        ${cocktailId !== null ? Prisma.sql`AND s.cocktail_id = ${cocktailId}` : Prisma.empty}
      GROUP BY date_trunc(${interval}, s.created_at)
      ORDER BY timestamp ASC
    `;

    return result.map((row) => ({
      timestamp: row.timestamp,
      units: Number(row.units),
      amount: Number(row.amount),
    }));
  }

  /**
   * Get time-series consumption data
   */
  async getTimeSeriesConsumption(
    eventId: number,
    barId: number | null,
    bucket: string,
    from: Date,
    to: Date,
    drinkId: number | null,
  ): Promise<Array<{ timestamp: Date; totalMl: number }>> {
    const interval = this.bucketToInterval(bucket);

    const result = await this.prisma.$queryRaw<[{ timestamp: Date; total_ml: bigint }]>`
      SELECT
        date_trunc(${interval}, im.created_at) as timestamp,
        ABS(SUM(im.quantity)) as total_ml
      FROM inventory_movement im
      JOIN "Bar" b ON im.bar_id = b.id
      WHERE b."eventId" = ${eventId}
        AND im.type = 'sale'
        AND im.created_at >= ${from}
        AND im.created_at <= ${to}
        ${barId !== null ? Prisma.sql`AND im.bar_id = ${barId}` : Prisma.empty}
        ${drinkId !== null ? Prisma.sql`AND im.drink_id = ${drinkId}` : Prisma.empty}
      GROUP BY date_trunc(${interval}, im.created_at)
      ORDER BY timestamp ASC
    `;

    return result.map((row) => ({
      timestamp: row.timestamp,
      totalMl: Number(row.total_ml),
    }));
  }

  /**
   * Get top products by units sold
   */
  async getTopProducts(
    eventId: number,
    barId: number | null,
    limit: number,
    from: Date | null,
    to: Date | null,
  ): Promise<Array<{ cocktailId: number; name: string; units: number; amount: number }>> {
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
        ${barId !== null ? Prisma.sql`AND s.bar_id = ${barId}` : Prisma.empty}
        ${from !== null ? Prisma.sql`AND s.created_at >= ${from}` : Prisma.empty}
        ${to !== null ? Prisma.sql`AND s.created_at <= ${to}` : Prisma.empty}
      GROUP BY c.id, c.name
      ORDER BY units DESC
      LIMIT ${limit}
    `;

    return result.map((row) => ({
      cocktailId: row.cocktail_id,
      name: row.name,
      units: Number(row.units),
      amount: Number(row.amount),
    }));
  }

  /**
   * Get cocktail by ID with price for an event
   */
  async getCocktailWithPrice(cocktailId: number, eventId: number) {
    const cocktail = await this.prisma.cocktail.findUnique({
      where: { id: cocktailId },
    });

    if (!cocktail) return null;

    // Use findFirst for event-level prices (barId = null)
    // The actual unique constraint is on (eventId, cocktailId, barId)
    const eventPrice = await this.prisma.eventPrice.findFirst({
      where: { eventId, cocktailId, barId: null },
    });

    return {
      ...cocktail,
      resolvedPrice: eventPrice?.price ?? cocktail.price,
    };
  }

  /**
   * Get drink by ID
   */
  async getDrinkById(drinkId: number) {
    return this.prisma.drink.findUnique({
      where: { id: drinkId },
    });
  }

  /**
   * Get event with bars
   */
  async getEventWithBars(eventId: number) {
    return this.prisma.event.findUnique({
      where: { id: eventId },
      include: { bars: true },
    });
  }

  /**
   * Get bar with event
   */
  async getBarWithEvent(barId: number) {
    return this.prisma.bar.findUnique({
      where: { id: barId },
      include: { event: true },
    });
  }
}
