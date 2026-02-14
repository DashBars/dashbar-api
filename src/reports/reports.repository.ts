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
  PeakHourBucketEntry,
  BarBreakdown,
  PosBreakdown,
  BarStockValuation,
  StockValuationSummary,
  CogsBreakdownByBar,
  BucketSize,
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
  drink_volume: number;
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
    const result = await this.prisma.$queryRaw<(RemainingStockResult & { drink_volume: number })[]>`
      SELECT
        s.bar_id,
        b.name as bar_name,
        s.drink_id,
        d.name as drink_name,
        d.volume as drink_volume,
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

    return result.map((row) => {
      const drinkVolume = row.drink_volume || 1;
      // totalValue = (quantity in ml / ml per unit) * cost per unit
      const totalValue = Math.round((row.quantity / drinkVolume) * row.unit_cost);
      return {
        barId: row.bar_id,
        barName: row.bar_name,
        drinkId: row.drink_id,
        drinkName: row.drink_name,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        quantity: row.quantity,
        unitCost: row.unit_cost,
        totalValue,
        ownershipMode: row.ownership_mode as 'purchased' | 'consignment',
      };
    });
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
        d.volume as drink_volume,
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
      GROUP BY im.drink_id, d.name, d.volume, im.supplier_id, sup.name, s.unit_cost, s.ownership_mode
      ORDER BY d.name, sup.name
    `;

    // Group by drink
    const drinkMap = new Map<number, ConsumptionEntry>();

    for (const row of result) {
      const drinkId = row.drink_id;
      const unitCost = row.unit_cost ?? 0;
      const drinkVolume = row.drink_volume || 1; // ml per unit (bottle)
      const totalMl = Number(row.total_ml);
      // Cost = (consumed ml / ml per unit) * cost per unit
      const cost = Math.round((totalMl / drinkVolume) * unitCost);

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
      if (!event.startedAt || !event.finishedAt) {
        throw new Error(`Event ${event.id} is missing required timestamps`);
      }
      const startedAt = new Date(event.startedAt);
      const finishedAt = new Date(event.finishedAt);
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

  // ============= ENHANCED REPORTING METHODS =============

  /**
   * Get peak hours by bucket size using POSSale data
   */
  async getPeakHoursByBucket(
    eventId: number,
    bucketMinutes: BucketSize,
  ): Promise<PeakHourBucketEntry[]> {
    const intervalSql = `${bucketMinutes} minutes`;

    // Query to get time-bucketed sales with top product per bucket
    const result = await this.prisma.$queryRaw<
      Array<{
        bucket_start: Date;
        bucket_end: Date;
        sales_count: bigint;
        revenue: bigint;
        top_product: string | null;
      }>
    >`
      WITH bucketed_sales AS (
        SELECT 
          date_trunc('hour', ps.created_at) + 
            (FLOOR(EXTRACT(MINUTE FROM ps.created_at) / ${bucketMinutes}) * INTERVAL '1 minute' * ${bucketMinutes}) AS bucket_start,
          ps.id as sale_id,
          ps.total as revenue
        FROM pos_sale ps
        WHERE ps.event_id = ${eventId}
          AND ps.status = 'COMPLETED'
      ),
      bucket_stats AS (
        SELECT 
          bucket_start,
          bucket_start + INTERVAL '${Prisma.raw(intervalSql)}' AS bucket_end,
          COUNT(sale_id) AS sales_count,
          SUM(revenue) AS revenue
        FROM bucketed_sales
        GROUP BY bucket_start
      ),
      top_products_per_bucket AS (
        SELECT DISTINCT ON (bs.bucket_start)
          bs.bucket_start,
          psi.product_name_snapshot as top_product
        FROM bucketed_sales bs2
        JOIN pos_sale_item psi ON psi.sale_id = bs2.sale_id
        JOIN bucket_stats bs ON bs.bucket_start = bs2.bucket_start
        GROUP BY bs.bucket_start, psi.product_name_snapshot
        ORDER BY bs.bucket_start, SUM(psi.quantity) DESC
      )
      SELECT 
        bs.bucket_start,
        bs.bucket_end,
        bs.sales_count,
        bs.revenue,
        tp.top_product
      FROM bucket_stats bs
      LEFT JOIN top_products_per_bucket tp ON tp.bucket_start = bs.bucket_start
      ORDER BY bs.revenue DESC
    `;

    return result.map((row) => ({
      startTime: row.bucket_start.toISOString(),
      endTime: row.bucket_end.toISOString(),
      salesCount: Number(row.sales_count),
      revenue: Number(row.revenue),
      topProduct: row.top_product || undefined,
    }));
  }

  /**
   * Get sales totals from POSSale (newer POS system)
   */
  async getPosSalesTotals(eventId: number): Promise<{
    totalRevenue: number;
    totalUnits: number;
    orderCount: number;
  }> {
    const result = await this.prisma.$queryRaw<
      Array<{
        total_revenue: bigint;
        total_units: bigint;
        order_count: bigint;
      }>
    >`
      SELECT
        COALESCE(SUM(ps.total), 0) as total_revenue,
        COALESCE(SUM(psi.quantity), 0) as total_units,
        COUNT(DISTINCT ps.id) as order_count
      FROM pos_sale ps
      LEFT JOIN pos_sale_item psi ON psi.sale_id = ps.id
      WHERE ps.event_id = ${eventId}
        AND ps.status = 'COMPLETED'
    `;

    const row = result[0] || { total_revenue: 0n, total_units: 0n, order_count: 0n };
    return {
      totalRevenue: Number(row.total_revenue),
      totalUnits: Number(row.total_units),
      orderCount: Number(row.order_count),
    };
  }

  /**
   * Get bar breakdowns with all metrics from POSSale
   * Optimized: uses 4 total queries instead of 4*N (N = number of bars)
   */
  async getBarBreakdowns(eventId: number): Promise<BarBreakdown[]> {
    // Get bars for the event
    const bars = await this.prisma.bar.findMany({
      where: { eventId },
      select: { id: true, name: true, type: true },
    });

    if (bars.length === 0) return [];
    const barIds = bars.map(b => b.id);

    // 1. Totals per bar (single query)
    const totalsResult = await this.prisma.$queryRaw<
      Array<{ bar_id: number; total_revenue: bigint; total_units: bigint; order_count: bigint }>
    >`
      SELECT
        ps.bar_id,
        COALESCE(SUM(ps.total), 0) as total_revenue,
        COALESCE(SUM(psi.quantity), 0) as total_units,
        COUNT(DISTINCT ps.id) as order_count
      FROM pos_sale ps
      LEFT JOIN pos_sale_item psi ON psi.sale_id = ps.id
      WHERE ps.event_id = ${eventId}
        AND ps.bar_id = ANY(${barIds})
        AND ps.status = 'COMPLETED'
      GROUP BY ps.bar_id
    `;
    const totalsMap = new Map(totalsResult.map(r => [r.bar_id, r]));

    // 2. COGS per bar (single query)
    // Cost = (consumed_ml / drink_volume) * unit_cost  (unit_cost is cost per physical unit/bottle)
    const cogsResult = await this.prisma.$queryRaw<
      Array<{ bar_id: number; total_cogs: bigint }>
    >`
      SELECT
        im.bar_id,
        COALESCE(SUM(
          CASE WHEN d.volume > 0
            THEN ROUND(ABS(im.quantity)::numeric * s.unit_cost::numeric / d.volume::numeric)
            ELSE ABS(im.quantity)::numeric * s.unit_cost::numeric
          END
        ), 0)::bigint as total_cogs
      FROM inventory_movement im
      JOIN "Stock" s ON s.bar_id = im.bar_id AND s.drink_id = im.drink_id AND s.supplier_id = im.supplier_id
      JOIN "Drink" d ON d.id = im.drink_id
      WHERE im.bar_id = ANY(${barIds})
        AND im.type = 'sale'
      GROUP BY im.bar_id
    `;
    const cogsMap = new Map(cogsResult.map(r => [r.bar_id, Number(r.total_cogs)]));

    // 3. Top products per bar (single query, ranked in SQL)
    const topProdsResult = await this.prisma.$queryRaw<
      Array<{ bar_id: number; product_name: string; units: bigint; revenue: bigint; rn: bigint }>
    >`
      SELECT bar_id, product_name, units, revenue, rn FROM (
        SELECT
          ps.bar_id,
          psi.product_name_snapshot as product_name,
          SUM(psi.quantity) as units,
          SUM(psi.line_total) as revenue,
          ROW_NUMBER() OVER (PARTITION BY ps.bar_id ORDER BY SUM(psi.quantity) DESC) as rn
        FROM pos_sale ps
        JOIN pos_sale_item psi ON psi.sale_id = ps.id
        WHERE ps.event_id = ${eventId}
          AND ps.bar_id = ANY(${barIds})
          AND ps.status = 'COMPLETED'
        GROUP BY ps.bar_id, psi.product_name_snapshot
      ) ranked
      WHERE rn <= 5
    `;
    const topProdsMap = new Map<number, typeof topProdsResult>();
    for (const r of topProdsResult) {
      if (!topProdsMap.has(r.bar_id)) topProdsMap.set(r.bar_id, []);
      topProdsMap.get(r.bar_id)!.push(r);
    }

    // 4. Peak hours per bar (single query, ranked in SQL)
    const peakResult = await this.prisma.$queryRaw<
      Array<{ bar_id: number; hour: Date; units: bigint; revenue: bigint; order_count: bigint; rn: bigint }>
    >`
      SELECT bar_id, hour, units, revenue, order_count, rn FROM (
        SELECT
          ps.bar_id,
          date_trunc('hour', ps.created_at) as hour,
          COALESCE(SUM(psi.quantity), 0) as units,
          SUM(ps.total) as revenue,
          COUNT(DISTINCT ps.id) as order_count,
          ROW_NUMBER() OVER (PARTITION BY ps.bar_id ORDER BY COALESCE(SUM(psi.quantity), 0) DESC) as rn
        FROM pos_sale ps
        LEFT JOIN pos_sale_item psi ON psi.sale_id = ps.id
        WHERE ps.event_id = ${eventId}
          AND ps.bar_id = ANY(${barIds})
          AND ps.status = 'COMPLETED'
        GROUP BY ps.bar_id, date_trunc('hour', ps.created_at)
      ) ranked
      WHERE rn <= 5
    `;
    const peakMap = new Map<number, typeof peakResult>();
    for (const r of peakResult) {
      if (!peakMap.has(r.bar_id)) peakMap.set(r.bar_id, []);
      peakMap.get(r.bar_id)!.push(r);
    }

    // Assemble breakdowns in memory
    return bars.map((bar) => {
      const totals = totalsMap.get(bar.id);
      const totalRevenue = Number(totals?.total_revenue ?? 0n);
      const totalUnits = Number(totals?.total_units ?? 0n);
      const orderCount = Number(totals?.order_count ?? 0n);
      const totalCOGS = cogsMap.get(bar.id) ?? 0;
      const grossProfit = totalRevenue - totalCOGS;
      const marginPercent = totalRevenue > 0
        ? Math.round((grossProfit / totalRevenue) * 10000) / 100
        : 0;
      const avgTicketSize = orderCount > 0
        ? Math.round(totalRevenue / orderCount)
        : 0;

      const topProducts: TopProductEntry[] = (topProdsMap.get(bar.id) || []).map((row) => ({
        cocktailId: 0,
        name: row.product_name,
        unitsSold: Number(row.units),
        revenue: Number(row.revenue),
        sharePercent: totalUnits > 0
          ? Math.round((Number(row.units) / totalUnits) * 10000) / 100
          : 0,
      }));

      const peakHours: PeakHourEntry[] = (peakMap.get(bar.id) || []).map((row) => ({
        hour: row.hour.toISOString(),
        units: Number(row.units),
        revenue: Number(row.revenue),
        orderCount: Number(row.order_count),
      }));

      return {
        barId: bar.id,
        barName: bar.name,
        barType: bar.type,
        totalRevenue,
        totalCOGS,
        grossProfit,
        marginPercent,
        totalUnitsSold: totalUnits,
        totalOrderCount: orderCount,
        avgTicketSize,
        topProducts,
        peakHours,
      };
    });
  }

  /**
   * Get POS terminal breakdowns
   * Optimized: uses 2 total queries instead of 2*N (N = number of posnets)
   */
  async getPosBreakdowns(eventId: number): Promise<PosBreakdown[]> {
    // Get all POS terminals for the event
    const posnets = await this.prisma.posnet.findMany({
      where: { eventId },
      include: { bar: { select: { id: true, name: true } } },
    });

    if (posnets.length === 0) return [];
    const posnetIds = posnets.map(p => p.id);

    // 1. Totals per posnet (single query)
    const totalsResult = await this.prisma.$queryRaw<
      Array<{ posnet_id: number; total_revenue: bigint; total_units: bigint; transaction_count: bigint }>
    >`
      SELECT
        ps.posnet_id,
        COALESCE(SUM(ps.total), 0) as total_revenue,
        COALESCE(SUM(psi.quantity), 0) as total_units,
        COUNT(DISTINCT ps.id) as transaction_count
      FROM pos_sale ps
      LEFT JOIN pos_sale_item psi ON psi.sale_id = ps.id
      WHERE ps.posnet_id = ANY(${posnetIds})
        AND ps.status = 'COMPLETED'
      GROUP BY ps.posnet_id
    `;
    const totalsMap = new Map(totalsResult.map(r => [r.posnet_id, r]));

    // 2. Busiest hours per posnet (single query, ranked in SQL)
    const hoursResult = await this.prisma.$queryRaw<
      Array<{ posnet_id: number; hour: Date; transactions: bigint; revenue: bigint; rn: bigint }>
    >`
      SELECT posnet_id, hour, transactions, revenue, rn FROM (
        SELECT
          ps.posnet_id,
          date_trunc('hour', ps.created_at) as hour,
          COUNT(ps.id) as transactions,
          SUM(ps.total) as revenue,
          ROW_NUMBER() OVER (PARTITION BY ps.posnet_id ORDER BY COUNT(ps.id) DESC) as rn
        FROM pos_sale ps
        WHERE ps.posnet_id = ANY(${posnetIds})
          AND ps.status = 'COMPLETED'
        GROUP BY ps.posnet_id, date_trunc('hour', ps.created_at)
      ) ranked
      WHERE rn <= 5
    `;
    const hoursMap = new Map<number, typeof hoursResult>();
    for (const r of hoursResult) {
      if (!hoursMap.has(r.posnet_id)) hoursMap.set(r.posnet_id, []);
      hoursMap.get(r.posnet_id)!.push(r);
    }

    // Assemble breakdowns in memory
    return posnets.map((posnet) => {
      const totals = totalsMap.get(posnet.id);
      const totalRevenue = Number(totals?.total_revenue ?? 0n);
      const totalUnits = Number(totals?.total_units ?? 0n);
      const transactionCount = Number(totals?.transaction_count ?? 0n);
      const avgTicketSize = transactionCount > 0
        ? Math.round(totalRevenue / transactionCount)
        : 0;

      const busiestHours = (hoursMap.get(posnet.id) || []).map((row) => ({
        hour: row.hour.toISOString(),
        transactions: Number(row.transactions),
        revenue: Number(row.revenue),
      }));

      return {
        posnetId: posnet.id,
        posnetCode: posnet.code,
        posnetName: posnet.name,
        barId: posnet.bar.id,
        barName: posnet.bar.name,
        totalRevenue,
        totalTransactions: transactionCount,
        totalUnitsSold: totalUnits,
        avgTicketSize,
        busiestHours,
      };
    });
  }

  /**
   * Get stock valuation by bar
   */
  async getStockValuation(eventId: number): Promise<StockValuationSummary> {
    const result = await this.prisma.$queryRaw<
      Array<{
        bar_id: number;
        bar_name: string;
        drink_id: number;
        drink_name: string;
        drink_volume: number;
        quantity: number;
        unit_cost: number;
        ownership_mode: string;
      }>
    >`
      SELECT
        b.id as bar_id,
        b.name as bar_name,
        d.id as drink_id,
        d.name as drink_name,
        d.volume as drink_volume,
        s.quantity,
        s.unit_cost,
        s.ownership_mode
      FROM "Stock" s
      JOIN "Bar" b ON s.bar_id = b.id
      JOIN "Drink" d ON s.drink_id = d.id
      WHERE b."eventId" = ${eventId}
        AND s.quantity > 0
      ORDER BY b.name, d.name
    `;

    // Group by bar
    const barMap = new Map<number, BarStockValuation>();

    for (const row of result) {
      const drinkVolume = row.drink_volume || 1;
      // value = (quantity in ml / ml per unit) * cost per unit
      const value = Math.round((row.quantity / drinkVolume) * row.unit_cost);
      const item = {
        drinkId: row.drink_id,
        drinkName: row.drink_name,
        quantity: row.quantity,
        unitCost: row.unit_cost,
        value,
        ownershipMode: row.ownership_mode as 'purchased' | 'consignment',
      };

      if (barMap.has(row.bar_id)) {
        const bar = barMap.get(row.bar_id)!;
        bar.totalValue += value;
        if (row.ownership_mode === 'purchased') {
          bar.purchasedValue += value;
        } else {
          bar.consignmentValue += value;
        }
        bar.items.push(item);
      } else {
        barMap.set(row.bar_id, {
          barId: row.bar_id,
          barName: row.bar_name,
          totalValue: value,
          purchasedValue: row.ownership_mode === 'purchased' ? value : 0,
          consignmentValue: row.ownership_mode === 'consignment' ? value : 0,
          items: [item],
        });
      }
    }

    const byBar = Array.from(barMap.values());
    const totalValue = byBar.reduce((sum, b) => sum + b.totalValue, 0);
    const purchasedValue = byBar.reduce((sum, b) => sum + b.purchasedValue, 0);
    const consignmentValue = byBar.reduce((sum, b) => sum + b.consignmentValue, 0);

    return {
      totalValue,
      purchasedValue,
      consignmentValue,
      byBar,
    };
  }

  /**
   * Get COGS breakdown by bar
   */
  async getCogsBreakdownByBar(eventId: number): Promise<CogsBreakdownByBar[]> {
    const result = await this.prisma.$queryRaw<
      Array<{
        bar_id: number;
        bar_name: string;
        drink_id: number;
        drink_name: string;
        drink_volume: number;
        quantity_used: bigint;
        unit_cost: number;
      }>
    >`
      SELECT
        b.id as bar_id,
        b.name as bar_name,
        d.id as drink_id,
        d.name as drink_name,
        d.volume as drink_volume,
        ABS(SUM(im.quantity)) as quantity_used,
        COALESCE(s.unit_cost, 0) as unit_cost
      FROM inventory_movement im
      JOIN "Bar" b ON im.bar_id = b.id
      JOIN "Drink" d ON im.drink_id = d.id
      LEFT JOIN "Stock" s ON s.bar_id = im.bar_id AND s.drink_id = im.drink_id AND s.supplier_id = im.supplier_id
      WHERE b."eventId" = ${eventId}
        AND im.type = 'sale'
      GROUP BY b.id, b.name, d.id, d.name, d.volume, s.unit_cost
      ORDER BY b.name, d.name
    `;

    // Group by bar
    const barMap = new Map<number, CogsBreakdownByBar>();

    for (const row of result) {
      const quantityUsed = Number(row.quantity_used);
      const drinkVolume = row.drink_volume || 1;
      // cost = (consumed ml / ml per unit) * cost per unit
      const cost = Math.round((quantityUsed / drinkVolume) * row.unit_cost);
      const drinkEntry = {
        drinkId: row.drink_id,
        drinkName: row.drink_name,
        quantityUsed,
        cost,
      };

      if (barMap.has(row.bar_id)) {
        const bar = barMap.get(row.bar_id)!;
        bar.totalCogs += cost;
        bar.byDrink.push(drinkEntry);
      } else {
        barMap.set(row.bar_id, {
          barId: row.bar_id,
          barName: row.bar_name,
          totalCogs: cost,
          byDrink: [drinkEntry],
        });
      }
    }

    return Array.from(barMap.values());
  }

  /**
   * Get top products from POSSale
   */
  async getPosTopProducts(eventId: number, limit: number = 10): Promise<TopProductEntry[]> {
    const result = await this.prisma.$queryRaw<
      Array<{
        product_id: number | null;
        product_name: string;
        units: bigint;
        revenue: bigint;
      }>
    >`
      SELECT
        psi.product_id,
        psi.product_name_snapshot as product_name,
        SUM(psi.quantity) as units,
        SUM(psi.line_total) as revenue
      FROM pos_sale ps
      JOIN pos_sale_item psi ON psi.sale_id = ps.id
      WHERE ps.event_id = ${eventId}
        AND ps.status = 'COMPLETED'
      GROUP BY psi.product_id, psi.product_name_snapshot
      ORDER BY units DESC
      LIMIT ${limit}
    `;

    const totalUnits = result.reduce((sum, r) => sum + Number(r.units), 0);

    return result.map((row) => ({
      cocktailId: row.product_id || 0,
      name: row.product_name,
      unitsSold: Number(row.units),
      revenue: Number(row.revenue),
      sharePercent: totalUnits > 0 
        ? Math.round((Number(row.units) / totalUnits) * 10000) / 100 
        : 0,
    }));
  }

  /**
   * Get time series from POSSale by hour
   */
  async getPosTimeSeriesByHour(eventId: number): Promise<TimeSeriesEntry[]> {
    const result = await this.prisma.$queryRaw<
      Array<{
        timestamp: Date;
        units: bigint;
        amount: bigint;
      }>
    >`
      SELECT
        date_trunc('hour', ps.created_at) as timestamp,
        COALESCE(SUM(psi.quantity), 0) as units,
        SUM(ps.total) as amount
      FROM pos_sale ps
      LEFT JOIN pos_sale_item psi ON psi.sale_id = ps.id
      WHERE ps.event_id = ${eventId}
        AND ps.status = 'COMPLETED'
      GROUP BY date_trunc('hour', ps.created_at)
      ORDER BY timestamp ASC
    `;

    return result.map((row) => ({
      timestamp: row.timestamp,
      units: Number(row.units),
      amount: Number(row.amount),
    }));
  }
}
