import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Sale,
  InventoryMovement,
  Stock,
  StockDepletionPolicy,
  MovementType,
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
   * Get stock for a drink in a bar, sorted by depletion policy
   */
  async getStockSortedByPolicy(
    barId: number,
    drinkId: number,
    policy: StockDepletionPolicy,
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

    return this.prisma.stock.findMany({
      where: {
        barId,
        drinkId,
        quantity: { gt: 0 },
      },
      orderBy,
      include: { supplier: true },
    });
  }

  /**
   * Execute sale with stock depletion in a transaction
   */
  async createSaleWithDepletion(
    barId: number,
    cocktailId: number,
    quantity: number,
    depletions: Array<{
      barId: number;
      drinkId: number;
      supplierId: number;
      quantityToDeduct: number;
    }>,
  ): Promise<Sale> {
    return this.prisma.$transaction(async (tx) => {
      // Create sale record
      const sale = await tx.sale.create({
        data: { barId, cocktailId, quantity },
      });

      // Deduct stock and create inventory movements
      // Recipe-based sales use sellAsWholeUnit=false stock
      for (const depletion of depletions) {
        // Update stock (using recipe stock, sellAsWholeUnit=false)
        await tx.stock.update({
          where: {
            barId_drinkId_supplierId_sellAsWholeUnit: {
              barId: depletion.barId,
              drinkId: depletion.drinkId,
              supplierId: depletion.supplierId,
              sellAsWholeUnit: false,
            },
          },
          data: {
            quantity: { decrement: depletion.quantityToDeduct },
          },
        });

        // Create inventory movement for audit
        await tx.inventoryMovement.create({
          data: {
            barId: depletion.barId,
            drinkId: depletion.drinkId,
            supplierId: depletion.supplierId,
            quantity: -depletion.quantityToDeduct, // Negative for deductions
            type: MovementType.sale,
            referenceId: sale.id,
          },
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
      include: { drink: true, supplier: true },
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
