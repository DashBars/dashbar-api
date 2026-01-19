import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Stock, Prisma } from '@prisma/client';

@Injectable()
export class StockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByBarId(barId: number): Promise<Stock[]> {
    return this.prisma.stock.findMany({
      where: { barId },
      include: { drink: true },
    });
  }

  async findByBarIdAndDrinkId(barId: number, drinkId: number): Promise<Stock | null> {
    return this.prisma.stock.findUnique({
      where: {
        barId_drinkId: { barId, drinkId },
      },
      include: { drink: true },
    });
  }

  async findByDrinkIdAndBarIds(drinkId: number, barIds: number[]): Promise<Stock[]> {
    return this.prisma.stock.findMany({
      where: {
        drinkId,
        barId: { in: barIds },
      },
      include: {
        bar: { select: { id: true, name: true } },
      },
    });
  }

  async upsert(barId: number, drinkId: number, amount: number): Promise<Stock> {
    return this.prisma.stock.upsert({
      where: {
        barId_drinkId: { barId, drinkId },
      },
      create: { barId, drinkId, amount },
      update: { amount },
      include: { drink: true },
    });
  }

  async delete(barId: number, drinkId: number): Promise<void> {
    await this.prisma.stock.delete({
      where: {
        barId_drinkId: { barId, drinkId },
      },
    });
  }

  async findDrinkById(drinkId: number) {
    return this.prisma.drink.findUnique({
      where: { id: drinkId },
    });
  }
}
