import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PosnetStatus } from '@prisma/client';

export interface POSMetrics {
  posnetId: number;
  tps: number; // Transactions per second (actually per minute for POS)
  avgCheckoutMs: number;
  salesCount: number;
  revenue: number;
  periodStart: Date;
  periodEnd: Date;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  
  // Congestion thresholds from config or defaults
  private readonly congestionTpsThreshold: number;
  private readonly congestionAvgCheckoutMsThreshold: number;
  private readonly metricsWindowMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    // TODO: Make these configurable via env vars
    this.congestionTpsThreshold = 
      this.configService.get<number>('POS_METRICS_CONGESTION_TPS_THRESHOLD') || 10;
    this.congestionAvgCheckoutMsThreshold = 
      this.configService.get<number>('POS_METRICS_AVG_CHECKOUT_MS_THRESHOLD') || 30000;
    this.metricsWindowMinutes = 
      this.configService.get<number>('POS_METRICS_WINDOW_MINUTES') || 5;
  }

  /**
   * Calculate metrics for a specific POS terminal
   */
  async calculatePOSMetrics(posnetId: number): Promise<POSMetrics> {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - this.metricsWindowMinutes * 60 * 1000);

    const sales = await this.prisma.pOSSale.findMany({
      where: {
        posnetId,
        status: 'COMPLETED',
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      select: {
        id: true,
        total: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const salesCount = sales.length;
    const revenue = sales.reduce((sum, s) => sum + s.total, 0);
    
    // TPS calculation (transactions per minute, normalized to seconds)
    const tps = salesCount / (this.metricsWindowMinutes * 60);

    // Average checkout time (time between consecutive sales)
    let avgCheckoutMs = 0;
    if (salesCount >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < sales.length; i++) {
        const interval = sales[i].createdAt.getTime() - sales[i - 1].createdAt.getTime();
        intervals.push(interval);
      }
      avgCheckoutMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    }

    return {
      posnetId,
      tps,
      avgCheckoutMs,
      salesCount,
      revenue,
      periodStart,
      periodEnd,
    };
  }

  /**
   * Check if a POS should be marked as congested based on metrics
   */
  async checkCongestion(posnetId: number): Promise<{ isCongested: boolean; metrics: POSMetrics }> {
    const metrics = await this.calculatePOSMetrics(posnetId);
    
    // Check congestion conditions
    // High TPS or very fast consecutive sales indicate congestion
    const isCongested = 
      metrics.tps > this.congestionTpsThreshold ||
      (metrics.avgCheckoutMs > 0 && metrics.avgCheckoutMs < this.congestionAvgCheckoutMsThreshold);

    return { isCongested, metrics };
  }

  /**
   * Update POS congestion status based on metrics
   */
  async updateCongestionStatus(posnetId: number): Promise<void> {
    try {
      const posnet = await this.prisma.posnet.findUnique({
        where: { id: posnetId },
        select: { id: true, status: true, enabled: true, eventId: true },
      });

      if (!posnet || !posnet.enabled || posnet.status === PosnetStatus.CLOSED) {
        return;
      }

      const { isCongested, metrics } = await this.checkCongestion(posnetId);
      const currentStatus = posnet.status;
      const newStatus = isCongested ? PosnetStatus.CONGESTED : PosnetStatus.OPEN;

      if (currentStatus !== newStatus) {
        // Update status
        await this.prisma.posnet.update({
          where: { id: posnetId },
          data: { status: newStatus },
        });

        // Emit status change event
        this.eventEmitter.emit('pos.status.changed', {
          posnetId,
          eventId: posnet.eventId,
          previousStatus: currentStatus,
          newStatus,
          reason: isCongested ? 'congestion_detected' : 'congestion_cleared',
          metrics,
        });

        this.logger.log(
          `POS ${posnetId} status changed: ${currentStatus} -> ${newStatus} (TPS: ${metrics.tps.toFixed(2)})`,
        );
      }

      // Always emit metrics update
      this.eventEmitter.emit('pos.metrics.updated', {
        posnetId,
        eventId: posnet.eventId,
        metrics,
      });
    } catch (error: any) {
      this.logger.error(`Error updating congestion status for POS ${posnetId}: ${error?.message}`);
    }
  }

  /**
   * Save a metric sample to the database
   */
  async saveMetricSample(
    posnetId: number,
    eventId: number,
    barId: number,
    metricType: string,
    value: number,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    await this.prisma.metricSample.create({
      data: {
        posnetId,
        eventId,
        barId,
        metricType,
        value,
        periodStart,
        periodEnd,
      },
    });
  }

  /**
   * Get aggregated metrics for an event
   */
  async getEventMetrics(eventId: number): Promise<{
    totalSales: number;
    totalRevenue: number;
    activePOS: number;
    congestedPOS: number;
  }> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.metricsWindowMinutes * 60 * 1000);

    const [salesAgg, posStats] = await Promise.all([
      this.prisma.pOSSale.aggregate({
        where: {
          eventId,
          status: 'COMPLETED',
          createdAt: { gte: windowStart },
        },
        _count: { id: true },
        _sum: { total: true },
      }),
      this.prisma.posnet.groupBy({
        by: ['status'],
        where: { eventId, enabled: true },
        _count: { id: true },
      }),
    ]);

    const activePOS = posStats.find((s) => s.status === PosnetStatus.OPEN)?._count.id || 0;
    const congestedPOS = posStats.find((s) => s.status === PosnetStatus.CONGESTED)?._count.id || 0;

    return {
      totalSales: salesAgg._count.id,
      totalRevenue: salesAgg._sum.total || 0,
      activePOS: activePOS + congestedPOS,
      congestedPOS,
    };
  }

  /**
   * Periodic job to update metrics for all active POS terminals
   * Runs every minute
   */
  @Interval(60000)
  async updateAllMetrics(): Promise<void> {
    try {
      const activePOS = await this.prisma.posnet.findMany({
        where: {
          enabled: true,
          status: { not: PosnetStatus.CLOSED },
        },
        select: { id: true },
      });

      for (const pos of activePOS) {
        await this.updateCongestionStatus(pos.id);
      }
    } catch (error: any) {
      this.logger.error(`Error in periodic metrics update: ${error?.message}`);
    }
  }
}
