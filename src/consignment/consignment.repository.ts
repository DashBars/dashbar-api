import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Stock, ConsignmentReturn, OwnershipMode, MovementType, Prisma } from '@prisma/client';

interface ConsignmentStockWithRelations extends Stock {
  drink: { id: number; name: string; sku: string };
  supplier: { id: number; name: string };
  bar: { id: number; name: string; eventId: number };
}

@Injectable()
export class ConsignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all consignment stock for a bar with drink and supplier info
   */
  async getConsignmentStockForBar(barId: number): Promise<ConsignmentStockWithRelations[]> {
    return this.prisma.stock.findMany({
      where: {
        barId,
        ownershipMode: OwnershipMode.consignment,
        quantity: { gt: 0 },
      },
      include: {
        drink: { select: { id: true, name: true, sku: true } },
        supplier: { select: { id: true, name: true } },
        bar: { select: { id: true, name: true, eventId: true } },
      },
    }) as Promise<ConsignmentStockWithRelations[]>;
  }

  /**
   * Get all consignment stock for an event (all bars)
   */
  async getConsignmentStockForEvent(eventId: number): Promise<ConsignmentStockWithRelations[]> {
    return this.prisma.stock.findMany({
      where: {
        bar: { eventId },
        ownershipMode: OwnershipMode.consignment,
        quantity: { gt: 0 },
      },
      include: {
        drink: { select: { id: true, name: true, sku: true } },
        supplier: { select: { id: true, name: true } },
        bar: { select: { id: true, name: true, eventId: true } },
      },
    }) as Promise<ConsignmentStockWithRelations[]>;
  }

  /**
   * Get total input quantity for a specific stock lot
   */
  async getTotalInputs(
    barId: number,
    drinkId: number,
    supplierId: number,
  ): Promise<number> {
    const result = await this.prisma.inventoryMovement.aggregate({
      where: {
        barId,
        drinkId,
        supplierId,
        type: MovementType.input,
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  /**
   * Get total consumption (sales) for a specific stock lot
   */
  async getTotalConsumption(
    barId: number,
    drinkId: number,
    supplierId: number,
  ): Promise<number> {
    const result = await this.prisma.inventoryMovement.aggregate({
      where: {
        barId,
        drinkId,
        supplierId,
        type: MovementType.sale,
      },
      _sum: { quantity: true },
    });
    // Sales are negative, return absolute value
    return Math.abs(result._sum.quantity ?? 0);
  }

  /**
   * Get total already returned quantity for a specific stock lot
   */
  async getTotalReturned(
    barId: number,
    drinkId: number,
    supplierId: number,
  ): Promise<number> {
    const result = await this.prisma.consignmentReturn.aggregate({
      where: {
        stockBarId: barId,
        stockDrinkId: drinkId,
        stockSupplierId: supplierId,
      },
      _sum: { quantityReturned: true },
    });
    return result._sum.quantityReturned ?? 0;
  }

  /**
   * Get a specific stock entry
   */
  async getStock(
    barId: number,
    drinkId: number,
    supplierId: number,
    sellAsWholeUnit: boolean = false,
  ): Promise<ConsignmentStockWithRelations | null> {
    return this.prisma.stock.findUnique({
      where: {
        barId_drinkId_supplierId_sellAsWholeUnit: { barId, drinkId, supplierId, sellAsWholeUnit },
      },
      include: {
        drink: { select: { id: true, name: true, sku: true } },
        supplier: { select: { id: true, name: true } },
        bar: { select: { id: true, name: true, eventId: true } },
      },
    }) as Promise<ConsignmentStockWithRelations | null>;
  }

  /**
   * Execute a consignment return in a transaction
   * - Updates stock quantity to 0 (or decrements by quantityToReturn)
   * - Creates ConsignmentReturn record
   * - Creates InventoryMovement audit record
   */
  async executeReturn(
    barId: number,
    drinkId: number,
    supplierId: number,
    quantityToReturn: number,
    performedById: number,
    notes?: string,
    sellAsWholeUnit: boolean = false,
  ): Promise<ConsignmentReturn> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Get current stock and verify
      const stock = await tx.stock.findUnique({
        where: {
          barId_drinkId_supplierId_sellAsWholeUnit: { barId, drinkId, supplierId, sellAsWholeUnit },
        },
      });

      if (!stock) {
        throw new Error(`Stock not found for bar ${barId}, drink ${drinkId}, supplier ${supplierId}`);
      }

      if (stock.ownershipMode !== OwnershipMode.consignment) {
        throw new Error('Only consignment stock can be returned');
      }

      if (stock.quantity < quantityToReturn) {
        throw new Error(
          `Cannot return ${quantityToReturn}. Only ${stock.quantity} available.`,
        );
      }

      // 2. Update stock quantity
      const newQuantity = stock.quantity - quantityToReturn;
      await tx.stock.update({
        where: {
          barId_drinkId_supplierId_sellAsWholeUnit: { barId, drinkId, supplierId, sellAsWholeUnit },
        },
        data: { quantity: newQuantity },
      });

      // 3. Create ConsignmentReturn record with audit
      const consignmentReturn = await tx.consignmentReturn.create({
        data: {
          stockBarId: barId,
          stockDrinkId: drinkId,
          stockSupplierId: supplierId,
          supplierId,
          quantityReturned: quantityToReturn,
          notes,
          performedById,
        },
        include: {
          stock: { include: { drink: true } },
          supplier: true,
          performedBy: { select: { id: true, email: true } },
        },
      });

      // 4. Create InventoryMovement for audit trail
      await tx.inventoryMovement.create({
        data: {
          barId,
          drinkId,
          supplierId,
          quantity: -quantityToReturn, // Negative for deduction
          type: MovementType.return_,
          referenceId: consignmentReturn.id,
          notes: notes ?? `Consignment return to supplier`,
        },
      });

      return consignmentReturn;
    });
  }

  /**
   * Get bar by ID with event info
   */
  async getBarWithEvent(barId: number) {
    return this.prisma.bar.findUnique({
      where: { id: barId },
      include: { event: { include: { owner: true } } },
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
}
