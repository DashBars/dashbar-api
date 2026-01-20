import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Stock, ConsignmentReturn, Prisma, OwnershipMode } from '@prisma/client';

@Injectable()
export class StockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByBarId(barId: number): Promise<Stock[]> {
    return this.prisma.stock.findMany({
      where: { barId },
      include: { drink: true, supplier: true },
    });
  }

  async findByBarIdAndDrinkId(barId: number, drinkId: number): Promise<Stock[]> {
    return this.prisma.stock.findMany({
      where: { barId, drinkId },
      include: { drink: true, supplier: true },
    });
  }

  async findByBarIdDrinkIdAndSupplierId(
    barId: number,
    drinkId: number,
    supplierId: number,
  ): Promise<Stock | null> {
    return this.prisma.stock.findUnique({
      where: {
        barId_drinkId_supplierId: { barId, drinkId, supplierId },
      },
      include: { drink: true, supplier: true },
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
        supplier: true,
      },
    });
  }

  async upsert(
    barId: number,
    drinkId: number,
    supplierId: number,
    data: {
      quantity: number;
      unitCost: number;
      currency: string;
      ownershipMode: OwnershipMode;
    },
  ): Promise<Stock> {
    return this.prisma.stock.upsert({
      where: {
        barId_drinkId_supplierId: { barId, drinkId, supplierId },
      },
      create: {
        barId,
        drinkId,
        supplierId,
        quantity: data.quantity,
        unitCost: data.unitCost,
        currency: data.currency,
        ownershipMode: data.ownershipMode,
      },
      update: {
        quantity: data.quantity,
        unitCost: data.unitCost,
        currency: data.currency,
        ownershipMode: data.ownershipMode,
      },
      include: { drink: true, supplier: true },
    });
  }

  async updateQuantity(
    barId: number,
    drinkId: number,
    supplierId: number,
    newQuantity: number,
  ): Promise<Stock> {
    return this.prisma.stock.update({
      where: {
        barId_drinkId_supplierId: { barId, drinkId, supplierId },
      },
      data: { quantity: newQuantity },
      include: { drink: true, supplier: true },
    });
  }

  async delete(barId: number, drinkId: number, supplierId: number): Promise<void> {
    await this.prisma.stock.delete({
      where: {
        barId_drinkId_supplierId: { barId, drinkId, supplierId },
      },
    });
  }

  async findDrinkById(drinkId: number) {
    return this.prisma.drink.findUnique({
      where: { id: drinkId },
    });
  }

  /**
   * Get stock summary aggregated by product (across all suppliers)
   */
  async getStockSummaryByBar(barId: number): Promise<
    {
      drinkId: number;
      drinkName: string;
      drinkBrand: string;
      totalQuantity: number;
      supplierCount: number;
    }[]
  > {
    const stocks = await this.prisma.stock.findMany({
      where: { barId },
      include: { drink: true },
    });

    const summary = new Map<
      number,
      {
        drinkId: number;
        drinkName: string;
        drinkBrand: string;
        totalQuantity: number;
        suppliers: Set<number>;
      }
    >();

    for (const stock of stocks) {
      const existing = summary.get(stock.drinkId);
      if (existing) {
        existing.totalQuantity += stock.quantity;
        existing.suppliers.add(stock.supplierId);
      } else {
        summary.set(stock.drinkId, {
          drinkId: stock.drinkId,
          drinkName: stock.drink.name,
          drinkBrand: stock.drink.brand,
          totalQuantity: stock.quantity,
          suppliers: new Set([stock.supplierId]),
        });
      }
    }

    return Array.from(summary.values()).map((item) => ({
      drinkId: item.drinkId,
      drinkName: item.drinkName,
      drinkBrand: item.drinkBrand,
      totalQuantity: item.totalQuantity,
      supplierCount: item.suppliers.size,
    }));
  }

  /**
   * Get stock breakdown by supplier for a bar
   */
  async getStockBySupplier(barId: number): Promise<Stock[]> {
    return this.prisma.stock.findMany({
      where: { barId },
      include: {
        drink: true,
        supplier: true,
      },
      orderBy: [{ supplierId: 'asc' }, { drinkId: 'asc' }],
    });
  }

  /**
   * Get consignment stock that can be returned
   */
  async getConsignmentStock(barId: number): Promise<Stock[]> {
    return this.prisma.stock.findMany({
      where: {
        barId,
        ownershipMode: OwnershipMode.consignment,
        quantity: { gt: 0 },
      },
      include: {
        drink: true,
        supplier: true,
      },
    });
  }

  /**
   * Create a consignment return record
   * @deprecated Use ConsignmentService.executeReturn instead for system-controlled returns
   */
  async createConsignmentReturn(data: {
    stockBarId: number;
    stockDrinkId: number;
    stockSupplierId: number;
    supplierId: number;
    quantityReturned: number;
    performedById: number;
    notes?: string;
  }): Promise<ConsignmentReturn> {
    return this.prisma.consignmentReturn.create({
      data,
      include: {
        stock: { include: { drink: true } },
        supplier: true,
        performedBy: { select: { id: true, email: true } },
      },
    });
  }

  /**
   * Get consignment returns for a bar
   */
  async getConsignmentReturnsByBar(barId: number): Promise<ConsignmentReturn[]> {
    return this.prisma.consignmentReturn.findMany({
      where: { stockBarId: barId },
      include: {
        stock: { include: { drink: true } },
        supplier: true,
      },
      orderBy: { returnedAt: 'desc' },
    });
  }
}
