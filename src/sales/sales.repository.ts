import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Sale,
  InventoryMovement,
  Stock,
  StockDepletionPolicy,
  MovementType,
  StockMovementReason,
  Prisma,
} from '@prisma/client';

@Injectable()
export class SalesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get bar with event (including depletion policy)
   */
  async getBarWithEvent(barId: number) {
    return this.prisma.bar.findUnique({
      where: { id: barId },
      include: { event: true },
    });
  }

  /**
   * Get event recipes for a cocktail by bar type and cocktail name
   */
  async getEventRecipes(eventId: number, barType: string, cocktailName: string) {
    return this.prisma.eventRecipe.findMany({
      where: {
        eventId,
        cocktailName,
        barTypes: {
          some: {
            barType: barType as any,
          },
        },
      },
      include: {
        components: {
          include: {
            drink: true,
          },
        },
      },
    });
  }

  /**
   * Get bar recipe overrides for a cocktail
   */
  async getBarRecipeOverrides(barId: number, cocktailId: number) {
    return this.prisma.barRecipeOverride.findMany({
      where: { barId, cocktailId },
      include: { drink: true },
    });
  }

  /**
   * Get cocktail by ID
   */
  async getCocktailById(cocktailId: number) {
    return this.prisma.cocktail.findUnique({
      where: { id: cocktailId },
    });
  }

  /**
   * Get cocktail by name
   */
  async getCocktailByName(cocktailName: string) {
    return this.prisma.cocktail.findFirst({
      where: { name: cocktailName },
    });
  }

  /**
   * Get stock for a drink in a bar, sorted by depletion policy.
   * @param sellAsWholeUnit - when provided, restricts to the matching stock pool:
   *   true  = "venta directa" stock only
   *   false = "para recetas" stock only
   *   undefined = both pools (legacy behaviour)
   */
  async getStockSortedByPolicy(
    barId: number,
    drinkId: number,
    policy: StockDepletionPolicy,
    sellAsWholeUnit?: boolean,
  ): Promise<Stock[]> {
    let orderBy: Prisma.StockOrderByWithRelationInput[];

    switch (policy) {
      case StockDepletionPolicy.cheapest_first:
        orderBy = [{ unitCost: 'asc' }, { receivedAt: 'asc' }];
        break;
      case StockDepletionPolicy.fifo:
        orderBy = [{ receivedAt: 'asc' }];
        break;
      case StockDepletionPolicy.consignment_last:
        // purchased (0) before consignment (1), then by unit cost
        orderBy = [{ ownershipMode: 'asc' }, { unitCost: 'asc' }];
        break;
      default:
        orderBy = [{ unitCost: 'asc' }];
    }

    const where: Prisma.StockWhereInput = {
      barId,
      drinkId,
      quantity: { gt: 0 },
    };

    // Filter by stock pool when specified
    if (sellAsWholeUnit !== undefined) {
      where.sellAsWholeUnit = sellAsWholeUnit;
    }

    return this.prisma.stock.findMany({
      where,
      orderBy,
      include: { supplier: true },
    });
  }

  /**
   * Execute sale with stock depletion in a transaction
   * Optimized: parallel stock updates + batch inventory movements
   */
  async createSaleWithDepletion(
    barId: number,
    cocktailId: number,
    quantity: number,
    depletions: Array<{
      barId: number;
      drinkId: number;
      supplierId: number;
      sellAsWholeUnit: boolean;
      quantityToDeduct: number;
    }>,
  ): Promise<Sale> {
    return this.prisma.$transaction(async (tx) => {
      // Create sale record
      const sale = await tx.sale.create({
        data: { barId, cocktailId, quantity },
      });

      // Deduct stock in parallel (each targets a different composite key)
      await Promise.all(
        depletions.map((depletion) =>
          tx.stock.update({
            where: {
              barId_drinkId_supplierId_sellAsWholeUnit: {
                barId: depletion.barId,
                drinkId: depletion.drinkId,
                supplierId: depletion.supplierId,
                sellAsWholeUnit: depletion.sellAsWholeUnit,
              },
            },
            data: {
              quantity: { decrement: depletion.quantityToDeduct },
            },
          }),
        ),
      );

      // Create all inventory movements in a single batch
      if (depletions.length > 0) {
        await tx.inventoryMovement.createMany({
          data: depletions.map((depletion) => ({
            barId: depletion.barId,
            drinkId: depletion.drinkId,
            supplierId: depletion.supplierId,
            quantity: -depletion.quantityToDeduct,
            type: MovementType.sale,
            reason: StockMovementReason.SALE_DECREMENT,
            sellAsWholeUnit: depletion.sellAsWholeUnit,
            referenceId: sale.id,
          })),
        });
      }

      return sale;
    });
  }

  /**
   * Find sales by bar
   */
  async findByBarId(barId: number): Promise<Sale[]> {
    return this.prisma.sale.findMany({
      where: { barId },
      include: { cocktail: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find sale by ID
   */
  async findById(id: number): Promise<Sale | null> {
    return this.prisma.sale.findUnique({
      where: { id },
      include: { cocktail: true, bar: true },
    });
  }

  /**
   * Get inventory movements by bar
   */
  async getInventoryMovementsByBar(barId: number): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { barId },
      include: { drink: true, supplier: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get inventory movements by global inventory entry
   */
  async getInventoryMovementsByGlobalInventory(
    globalInventoryId: number,
  ): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { globalInventoryId },
      include: { drink: true, supplier: true, bar: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get inventory movements by sale
   */
  async getInventoryMovementsBySale(saleId: number): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { referenceId: saleId, type: MovementType.sale },
      include: { drink: true, supplier: true },
    });
  }
}
