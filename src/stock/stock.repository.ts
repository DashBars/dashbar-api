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

  async findByBarDrinkSupplier(
    barId: number,
    drinkId: number,
  ): Promise<Stock[]> {
    return this.prisma.stock.findMany({
      where: { barId, drinkId },
      include: { drink: true, supplier: true },
    });
  }

  async findByBarIdDrinkIdAndSupplierId(
    barId: number,
    drinkId: number,
    supplierId: number,
    sellAsWholeUnit?: boolean,
  ): Promise<Stock | null> {
    // Si no se especifica sellAsWholeUnit, buscar el primero que coincida
    if (sellAsWholeUnit === undefined) {
      return this.prisma.stock.findFirst({
        where: { barId, drinkId, supplierId },
        include: { drink: true, supplier: true },
      });
    }
    return this.prisma.stock.findUnique({
      where: {
        barId_drinkId_supplierId_sellAsWholeUnit: { barId, drinkId, supplierId, sellAsWholeUnit },
      },
      include: { drink: true, supplier: true },
    });
  }

  /**
   * Get unique drinks available in a bar's stock, aggregated across suppliers
   * and sellAsWholeUnit variants. Returns drink info with total ml and unit count.
   */
  async getUniqueDrinksByBar(
    barId: number,
  ): Promise<
    {
      drinkId: number;
      name: string;
      brand: string;
      volume: number;
      totalMl: number;
      unitCount: number;
    }[]
  > {
    // Group stock by drinkId, summing quantities
    const grouped = await this.prisma.stock.groupBy({
      by: ['drinkId'],
      where: { barId, quantity: { gt: 0 } },
      _sum: { quantity: true },
    });

    if (grouped.length === 0) return [];

    // Fetch drink details for all drinkIds
    const drinkIds = grouped.map((g) => g.drinkId);
    const drinks = await this.prisma.drink.findMany({
      where: { id: { in: drinkIds } },
      select: { id: true, name: true, brand: true, volume: true },
    });

    const drinkMap = new Map(drinks.map((d) => [d.id, d]));

    return grouped
      .map((g) => {
        const drink = drinkMap.get(g.drinkId);
        const totalMl = g._sum.quantity || 0;
        const volume = drink?.volume || 1;
        return {
          drinkId: g.drinkId,
          name: drink?.name || `Drink ${g.drinkId}`,
          brand: drink?.brand || '',
          volume,
          totalMl,
          unitCount: Math.floor(totalMl / volume),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get unique drinks available across all bars of a given type in an event.
   * Only includes recipe stock (sellAsWholeUnit: false).
   * Returns drink info + total ml + weighted average cost per ml.
   */
  async getUniqueDrinksByBarType(
    eventId: number,
    barType: string,
  ): Promise<
    {
      drinkId: number;
      name: string;
      brand: string;
      volume: number;
      totalMl: number;
      unitCount: number;
      costPerMl: number; // weighted average cost in cents per ml
    }[]
  > {
    // Find all bars of this type in the event
    const bars = await this.prisma.bar.findMany({
      where: { eventId, type: barType as any },
      select: { id: true },
    });

    if (bars.length === 0) return [];

    const barIds = bars.map((b) => b.id);

    // Fetch all recipe stock entries with cost data
    const stockEntries = await this.prisma.stock.findMany({
      where: {
        barId: { in: barIds },
        quantity: { gt: 0 },
        sellAsWholeUnit: false,
      },
      select: {
        drinkId: true,
        quantity: true,
        unitCost: true,
        drink: { select: { id: true, name: true, brand: true, volume: true } },
      },
    });

    if (stockEntries.length === 0) return [];

    // Aggregate by drinkId: sum quantity, weighted average cost
    const aggregated = new Map<
      number,
      { totalMl: number; totalCost: number; drink: { id: number; name: string; brand: string; volume: number } }
    >();

    for (const entry of stockEntries) {
      const existing = aggregated.get(entry.drinkId);
      // unitCost is cost per unit (bottle) in cents; cost per ml = unitCost / volume
      const drinkVolume = entry.drink.volume || 1;
      const costForThisQuantity = (entry.unitCost / drinkVolume) * entry.quantity;

      if (existing) {
        existing.totalMl += entry.quantity;
        existing.totalCost += costForThisQuantity;
      } else {
        aggregated.set(entry.drinkId, {
          totalMl: entry.quantity,
          totalCost: costForThisQuantity,
          drink: entry.drink,
        });
      }
    }

    return Array.from(aggregated.entries())
      .map(([drinkId, data]) => {
        const volume = data.drink.volume || 1;
        return {
          drinkId,
          name: data.drink.name || `Drink ${drinkId}`,
          brand: data.drink.brand || '',
          volume,
          totalMl: data.totalMl,
          unitCount: Math.floor(data.totalMl / volume),
          costPerMl: data.totalMl > 0 ? data.totalCost / data.totalMl : 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
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
      sellAsWholeUnit?: boolean;
      salePrice?: number | null;
    },
  ): Promise<Stock> {
    const sellAsWholeUnit = data.sellAsWholeUnit ?? false;
    return this.prisma.stock.upsert({
      where: {
        barId_drinkId_supplierId_sellAsWholeUnit: { barId, drinkId, supplierId, sellAsWholeUnit },
      },
      create: {
        barId,
        drinkId,
        supplierId,
        quantity: data.quantity,
        unitCost: data.unitCost,
        currency: data.currency,
        ownershipMode: data.ownershipMode,
        sellAsWholeUnit,
        salePrice: data.salePrice,
      },
      update: {
        quantity: data.quantity,
        unitCost: data.unitCost,
        currency: data.currency,
        ownershipMode: data.ownershipMode,
        salePrice: data.salePrice,
      },
      include: { drink: true, supplier: true },
    });
  }

  async updateQuantity(
    barId: number,
    drinkId: number,
    supplierId: number,
    newQuantity: number,
    sellAsWholeUnit: boolean = false,
  ): Promise<Stock> {
    return this.prisma.stock.update({
      where: {
        barId_drinkId_supplierId_sellAsWholeUnit: { barId, drinkId, supplierId, sellAsWholeUnit },
      },
      data: { quantity: newQuantity },
      include: { drink: true, supplier: true },
    });
  }

  async delete(barId: number, drinkId: number, supplierId: number, sellAsWholeUnit: boolean = false): Promise<void> {
    await this.prisma.stock.delete({
      where: {
        barId_drinkId_supplierId_sellAsWholeUnit: { barId, drinkId, supplierId, sellAsWholeUnit },
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
   * Quantities are in ml; unitCount shows equivalent whole units (bottles/cans)
   */
  async getStockSummaryByBar(barId: number): Promise<
    {
      drinkId: number;
      drinkName: string;
      drinkBrand: string;
      drinkVolume: number;
      totalQuantity: number;
      unitCount: number;
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
        drinkVolume: number;
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
          drinkVolume: stock.drink.volume,
          totalQuantity: stock.quantity,
          suppliers: new Set([stock.supplierId]),
        });
      }
    }

    return Array.from(summary.values()).map((item) => ({
      drinkId: item.drinkId,
      drinkName: item.drinkName,
      drinkBrand: item.drinkBrand,
      drinkVolume: item.drinkVolume,
      totalQuantity: item.totalQuantity,
      unitCount: item.drinkVolume > 0 ? Math.floor(item.totalQuantity / item.drinkVolume) : 0,
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
