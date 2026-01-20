import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  StockThreshold,
  StockAlert,
  AlertType,
  AlertStatus,
  Prisma,
} from '@prisma/client';
import { DonorSuggestion, BarWithStock } from './interfaces/alarm.interface';

@Injectable()
export class AlarmsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ============= THRESHOLDS =============

  async createThreshold(data: Prisma.StockThresholdUncheckedCreateInput): Promise<StockThreshold> {
    return this.prisma.stockThreshold.create({ data });
  }

  async findThresholdsByEvent(eventId: number): Promise<StockThreshold[]> {
    return this.prisma.stockThreshold.findMany({
      where: { eventId },
      include: { drink: true },
      orderBy: { drinkId: 'asc' },
    });
  }

  async findThresholdByEventAndDrink(
    eventId: number,
    drinkId: number,
  ): Promise<StockThreshold | null> {
    return this.prisma.stockThreshold.findUnique({
      where: { eventId_drinkId: { eventId, drinkId } },
      include: { drink: true },
    });
  }

  async updateThreshold(
    eventId: number,
    drinkId: number,
    data: Prisma.StockThresholdUpdateInput,
  ): Promise<StockThreshold> {
    return this.prisma.stockThreshold.update({
      where: { eventId_drinkId: { eventId, drinkId } },
      data,
    });
  }

  async deleteThreshold(eventId: number, drinkId: number): Promise<void> {
    await this.prisma.stockThreshold.delete({
      where: { eventId_drinkId: { eventId, drinkId } },
    });
  }

  // ============= ALERTS =============

  async createAlert(data: {
    eventId: number;
    barId: number;
    drinkId: number;
    type: AlertType;
    currentStock: number;
    threshold: number;
    suggestedDonors: DonorSuggestion[];
    externalNeeded: boolean;
    projectedMinutes?: number;
  }): Promise<StockAlert> {
    return this.prisma.stockAlert.create({
      data: {
        eventId: data.eventId,
        barId: data.barId,
        drinkId: data.drinkId,
        type: data.type,
        currentStock: data.currentStock,
        threshold: data.threshold,
        suggestedDonors: data.suggestedDonors as any,
        externalNeeded: data.externalNeeded,
        projectedMinutes: data.projectedMinutes,
      },
      include: { bar: true, drink: true },
    });
  }

  async findAlertsByEvent(
    eventId: number,
    status?: AlertStatus,
  ): Promise<StockAlert[]> {
    return this.prisma.stockAlert.findMany({
      where: {
        eventId,
        ...(status ? { status } : {}),
      },
      include: { bar: true, drink: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAlertById(id: number): Promise<StockAlert | null> {
    return this.prisma.stockAlert.findUnique({
      where: { id },
      include: { bar: true, drink: true, event: true },
    });
  }

  async findActiveAlertForBarDrink(
    barId: number,
    drinkId: number,
    type: AlertType,
  ): Promise<StockAlert | null> {
    return this.prisma.stockAlert.findFirst({
      where: {
        barId,
        drinkId,
        type,
        status: { in: [AlertStatus.active, AlertStatus.acknowledged] },
      },
    });
  }

  async updateAlertStatus(
    id: number,
    status: AlertStatus,
    resolvedAt?: Date,
  ): Promise<StockAlert> {
    return this.prisma.stockAlert.update({
      where: { id },
      data: { status, resolvedAt },
      include: { bar: true, drink: true },
    });
  }

  // ============= STOCK QUERIES =============

  /**
   * Get total stock for a bar and drink (aggregated across suppliers)
   */
  async getTotalStockForBarDrink(barId: number, drinkId: number): Promise<number> {
    const result = await this.prisma.stock.aggregate({
      where: { barId, drinkId },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  /**
   * Get all bars in an event with their total stock for a specific drink
   */
  async getBarsWithStockForDrink(
    eventId: number,
    drinkId: number,
  ): Promise<BarWithStock[]> {
    const bars = await this.prisma.bar.findMany({
      where: { eventId },
      include: {
        stocks: {
          where: { drinkId },
          select: { quantity: true },
        },
      },
    });

    return bars.map((bar) => ({
      id: bar.id,
      name: bar.name,
      totalStock: bar.stocks.reduce((sum, s) => sum + s.quantity, 0),
    }));
  }

  /**
   * Get consumption rate for a bar and drink (ml per minute in last N minutes)
   */
  async getConsumptionRate(
    barId: number,
    drinkId: number,
    windowMinutes: number,
  ): Promise<number> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const result = await this.prisma.inventoryMovement.aggregate({
      where: {
        barId,
        drinkId,
        type: 'sale',
        createdAt: { gte: since },
      },
      _sum: { quantity: true },
    });

    // Quantity is negative for sales, so we take absolute value
    const totalConsumed = Math.abs(result._sum.quantity ?? 0);
    return totalConsumed / windowMinutes; // ml per minute
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
   * Get bar with event
   */
  async getBarWithEvent(barId: number) {
    return this.prisma.bar.findUnique({
      where: { id: barId },
      include: { event: true },
    });
  }
}
