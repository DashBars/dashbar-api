import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  StockTransfer,
  TransferStatus,
  MovementType,
  AlertStatus,
  Prisma,
} from '@prisma/client';

@Injectable()
export class TransfersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.StockTransferUncheckedCreateInput): Promise<StockTransfer> {
    return this.prisma.stockTransfer.create({
      data,
      include: {
        receiverBar: true,
        donorBar: true,
        drink: true,
      },
    });
  }

  async findById(id: number): Promise<StockTransfer | null> {
    return this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        event: true,
        receiverBar: true,
        donorBar: true,
        drink: true,
      },
    });
  }

  async findByEvent(
    eventId: number,
    status?: TransferStatus,
  ): Promise<StockTransfer[]> {
    return this.prisma.stockTransfer.findMany({
      where: {
        eventId,
        ...(status ? { status } : {}),
      },
      include: {
        receiverBar: true,
        donorBar: true,
        drink: true,
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async updateStatus(
    id: number,
    status: TransferStatus,
    additionalData: Partial<{
      approvedAt: Date;
      completedAt: Date;
    }> = {},
  ): Promise<StockTransfer> {
    return this.prisma.stockTransfer.update({
      where: { id },
      data: { status, ...additionalData },
      include: {
        receiverBar: true,
        donorBar: true,
        drink: true,
      },
    });
  }

  /**
   * Get stock for a bar and drink (for depletion during transfer)
   */
  async getStockForBarDrink(barId: number, drinkId: number) {
    return this.prisma.stock.findMany({
      where: { barId, drinkId, quantity: { gt: 0 } },
      include: { supplier: true },
      orderBy: { unitCost: 'asc' }, // Cheapest first for transfers
    });
  }

  /**
   * Get total stock for bar and drink
   */
  async getTotalStock(barId: number, drinkId: number): Promise<number> {
    const result = await this.prisma.stock.aggregate({
      where: { barId, drinkId },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
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

  /**
   * Complete transfer with stock movements (transactional)
   */
  async completeTransfer(
    transfer: StockTransfer,
    donorStock: Array<{ barId: number; drinkId: number; supplierId: number; quantity: number; sellAsWholeUnit: boolean }>,
  ): Promise<StockTransfer> {
    return this.prisma.$transaction(async (tx) => {
      let remaining = transfer.quantity;
      let primarySupplierId: number | null = null;

      // 1. Deduct from donor stock lots
      for (const lot of donorStock) {
        if (remaining <= 0) break;

        const deduct = Math.min(lot.quantity, remaining);

        if (!primarySupplierId) {
          primarySupplierId = lot.supplierId;
        }

        // Update stock
        await tx.stock.update({
          where: {
            barId_drinkId_supplierId_sellAsWholeUnit: {
              barId: lot.barId,
              drinkId: lot.drinkId,
              supplierId: lot.supplierId,
              sellAsWholeUnit: lot.sellAsWholeUnit,
            },
          },
          data: { quantity: { decrement: deduct } },
        });

        // Record movement (outgoing)
        await tx.inventoryMovement.create({
          data: {
            barId: transfer.donorBarId,
            drinkId: transfer.drinkId,
            supplierId: lot.supplierId,
            quantity: -deduct,
            type: MovementType.transfer_out,
            referenceId: transfer.id,
            notes: `Transfer to bar ${transfer.receiverBarId}`,
          },
        });

        remaining -= deduct;
      }

      // 2. Add to receiver stock (use primary supplier from donor)
      // Transfers are for recipe components, so sellAsWholeUnit=false
      if (primarySupplierId) {
        await tx.stock.upsert({
          where: {
            barId_drinkId_supplierId_sellAsWholeUnit: {
              barId: transfer.receiverBarId,
              drinkId: transfer.drinkId,
              supplierId: primarySupplierId,
              sellAsWholeUnit: false,
            },
          },
          create: {
            barId: transfer.receiverBarId,
            drinkId: transfer.drinkId,
            supplierId: primarySupplierId,
            quantity: transfer.quantity,
            unitCost: 0, // Internal transfer, no cost
            currency: 'ARS',
            ownershipMode: 'purchased', // Transferred stock becomes purchased
            sellAsWholeUnit: false,
          },
          update: {
            quantity: { increment: transfer.quantity },
          },
        });

        // Record movement (incoming)
        await tx.inventoryMovement.create({
          data: {
            barId: transfer.receiverBarId,
            drinkId: transfer.drinkId,
            supplierId: primarySupplierId,
            quantity: transfer.quantity,
            type: MovementType.transfer_in,
            referenceId: transfer.id,
            notes: `Transfer from bar ${transfer.donorBarId}`,
          },
        });
      }

      // 3. Update transfer status
      const updatedTransfer = await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: TransferStatus.completed,
          completedAt: new Date(),
        },
        include: {
          receiverBar: true,
          donorBar: true,
          drink: true,
        },
      });

      // 4. Resolve related alert if any
      if (transfer.alertId) {
        await tx.stockAlert.update({
          where: { id: transfer.alertId },
          data: {
            status: AlertStatus.resolved,
            resolvedAt: new Date(),
          },
        });
      }

      return updatedTransfer;
    });
  }
}
