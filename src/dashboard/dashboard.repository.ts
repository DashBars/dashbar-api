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
   * Get sales totals for an event or bar.
   * Prefers POSSale data (has actual prices); falls back to legacy sale table.
   */
  async getSalesTotals(
    eventId: number,
    barId: number | null,
    from: Date | null,
    to: Date | null,
  ): Promise<{ totalAmount: number; totalUnits: number; orderCount: number }> {
    // Try POSSale first (accurate prices stored at sale time)
    const posResult = await this.prisma.$queryRaw<SalesTotalsResult[]>`
      SELECT
        COALESCE(SUM(ps.total), 0) as total_amount,
        COALESCE(SUM(psi.quantity), 0) as total_units,
        COUNT(DISTINCT ps.id) as order_count
      FROM pos_sale ps
      LEFT JOIN pos_sale_item psi ON psi.sale_id = ps.id
      WHERE ps.event_id = ${eventId}
        AND ps.status = 'COMPLETED'
        ${barId !== null ? Prisma.sql`AND ps.bar_id = ${barId}` : Prisma.empty}
        ${from !== null ? Prisma.sql`AND ps.created_at >= ${from}` : Prisma.empty}
        ${to !== null ? Prisma.sql`AND ps.created_at <= ${to}` : Prisma.empty}
    `;

    const posRow = posResult[0] || { total_amount: 0n, total_units: 0n, order_count: 0n };
    const hasPosData = Number(posRow.order_count) > 0;

    if (hasPosData) {
      return {
        totalAmount: Number(posRow.total_amount),
        totalUnits: Number(posRow.total_units),
        orderCount: Number(posRow.order_count),
      };
    }

    // Fallback to legacy sale table
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
   * Get time-series sales data.
   * Prefers POSSale data; falls back to legacy sale table.
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

    // Try POSSale first
    const posCheck = await this.prisma.$queryRaw<[{ cnt: bigint }]>`
      SELECT COUNT(*)::bigint as cnt FROM pos_sale WHERE event_id = ${eventId} AND status = 'COMPLETED'
    `;
    const hasPosData = Number(posCheck[0]?.cnt || 0n) > 0;

    if (hasPosData) {
      const posResult = await this.prisma.$queryRaw<TimeSeriesResult[]>`
        SELECT
          date_trunc(${interval}, ps.created_at) as timestamp,
          COALESCE(SUM(psi.quantity), 0) as units,
          COALESCE(SUM(psi.line_total), 0) as amount
        FROM pos_sale ps
        JOIN pos_sale_item psi ON psi.sale_id = ps.id
        WHERE ps.event_id = ${eventId}
          AND ps.status = 'COMPLETED'
          AND ps.created_at >= ${from}
          AND ps.created_at <= ${to}
          ${barId !== null ? Prisma.sql`AND ps.bar_id = ${barId}` : Prisma.empty}
          ${cocktailId !== null ? Prisma.sql`AND psi.cocktail_id = ${cocktailId}` : Prisma.empty}
        GROUP BY date_trunc(${interval}, ps.created_at)
        ORDER BY timestamp ASC
      `;

      return posResult.map((row) => ({
        timestamp: row.timestamp,
        units: Number(row.units),
        amount: Number(row.amount),
      }));
    }

    // Fallback to legacy sale table
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
   * Get top products by units sold.
   * Prefers POSSale data; falls back to legacy sale table.
   */
  async getTopProducts(
    eventId: number,
    barId: number | null,
    limit: number,
    from: Date | null,
    to: Date | null,
  ): Promise<Array<{ cocktailId: number; name: string; units: number; amount: number }>> {
    // Try POSSale first
    const posCheck = await this.prisma.$queryRaw<[{ cnt: bigint }]>`
      SELECT COUNT(*)::bigint as cnt FROM pos_sale WHERE event_id = ${eventId} AND status = 'COMPLETED'
    `;
    const hasPosData = Number(posCheck[0]?.cnt || 0n) > 0;

    if (hasPosData) {
      const posResult = await this.prisma.$queryRaw<TopProductResult[]>`
        SELECT
          COALESCE(psi.product_id, 0) as cocktail_id,
          psi.product_name_snapshot as name,
          SUM(psi.quantity) as units,
          SUM(psi.line_total) as amount
        FROM pos_sale ps
        JOIN pos_sale_item psi ON psi.sale_id = ps.id
        WHERE ps.event_id = ${eventId}
          AND ps.status = 'COMPLETED'
          ${barId !== null ? Prisma.sql`AND ps.bar_id = ${barId}` : Prisma.empty}
          ${from !== null ? Prisma.sql`AND ps.created_at >= ${from}` : Prisma.empty}
          ${to !== null ? Prisma.sql`AND ps.created_at <= ${to}` : Prisma.empty}
        GROUP BY psi.product_id, psi.product_name_snapshot
        ORDER BY units DESC
        LIMIT ${limit}
      `;

      return posResult.map((row) => ({
        cocktailId: Number(row.cocktail_id),
        name: row.name,
        units: Number(row.units),
        amount: Number(row.amount),
      }));
    }

    // Fallback to legacy sale table
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
   * Get cocktail by ID with price for an event.
   * Resolution order: EventProduct price -> EventPrice -> Cocktail.price
   */
  async getCocktailWithPrice(cocktailId: number, eventId: number) {
    const cocktail = await this.prisma.cocktail.findUnique({
      where: { id: cocktailId },
    });

    if (!cocktail) return null;

    // 1. Try EventProduct price (via EventProductCocktail)
    const productCocktail = await this.prisma.eventProductCocktail.findFirst({
      where: { cocktailId },
      include: {
        eventProduct: {
          select: { price: true, eventId: true, barId: true },
        },
      },
    });

    if (productCocktail?.eventProduct?.eventId === eventId && productCocktail.eventProduct.barId === null) {
      return {
        ...cocktail,
        resolvedPrice: productCocktail.eventProduct.price,
      };
    }

    // 2. Try EventPrice
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
