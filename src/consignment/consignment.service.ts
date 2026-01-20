import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConsignmentRepository } from './consignment.repository';
import { BarsService } from '../bars/bars.service';
import { EventsService } from '../events/events.service';
import { NotOwnerException } from '../common/exceptions';
import { ConsignmentReturn, OwnershipMode } from '@prisma/client';
import {
  ConsignmentReturnSummary,
  EventConsignmentSummary,
  SupplierReturnSummary,
  ExecuteReturnResult,
} from './interfaces/consignment.interface';

@Injectable()
export class ConsignmentService {
  constructor(
    private readonly repository: ConsignmentRepository,
    private readonly barsService: BarsService,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Get consignment return summary for a specific bar
   * Shows what can be returned (system-calculated, not negotiable)
   */
  async getReturnSummary(
    eventId: number,
    barId: number,
    userId: number,
  ): Promise<ConsignmentReturnSummary[]> {
    // Validate access
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId);

    // Get consignment stock for the bar
    const consignmentStock = await this.repository.getConsignmentStockForBar(barId);

    // Build summary for each item
    const summaries: ConsignmentReturnSummary[] = [];

    for (const stock of consignmentStock) {
      const [totalReceived, totalConsumed, totalReturned] = await Promise.all([
        this.repository.getTotalInputs(stock.barId, stock.drinkId, stock.supplierId),
        this.repository.getTotalConsumption(stock.barId, stock.drinkId, stock.supplierId),
        this.repository.getTotalReturned(stock.barId, stock.drinkId, stock.supplierId),
      ]);

      summaries.push({
        barId: stock.barId,
        barName: stock.bar.name,
        supplierId: stock.supplierId,
        supplierName: stock.supplier.name,
        drinkId: stock.drinkId,
        drinkName: stock.drink.name,
        drinkSku: stock.drink.sku,
        currentStockQuantity: stock.quantity,
        totalReceived,
        totalConsumed,
        totalReturned,
        // The quantity to return is ALWAYS the current stock - non-negotiable
        quantityToReturn: stock.quantity,
      });
    }

    return summaries;
  }

  /**
   * Get event-wide consignment return summary grouped by supplier
   */
  async getEventReturnSummary(
    eventId: number,
    userId: number,
  ): Promise<EventConsignmentSummary> {
    // Validate access
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    // Get all consignment stock for the event
    const consignmentStock = await this.repository.getConsignmentStockForEvent(eventId);

    // Group by supplier
    const supplierMap = new Map<number, SupplierReturnSummary>();

    for (const stock of consignmentStock) {
      const [totalReceived, totalConsumed, totalReturned] = await Promise.all([
        this.repository.getTotalInputs(stock.barId, stock.drinkId, stock.supplierId),
        this.repository.getTotalConsumption(stock.barId, stock.drinkId, stock.supplierId),
        this.repository.getTotalReturned(stock.barId, stock.drinkId, stock.supplierId),
      ]);

      const item: ConsignmentReturnSummary = {
        barId: stock.barId,
        barName: stock.bar.name,
        supplierId: stock.supplierId,
        supplierName: stock.supplier.name,
        drinkId: stock.drinkId,
        drinkName: stock.drink.name,
        drinkSku: stock.drink.sku,
        currentStockQuantity: stock.quantity,
        totalReceived,
        totalConsumed,
        totalReturned,
        quantityToReturn: stock.quantity,
      };

      const existing = supplierMap.get(stock.supplierId);
      if (existing) {
        existing.items.push(item);
        existing.totalToReturn += stock.quantity;
      } else {
        supplierMap.set(stock.supplierId, {
          supplierId: stock.supplierId,
          supplierName: stock.supplier.name,
          items: [item],
          totalToReturn: stock.quantity,
        });
      }
    }

    const bySupplier = Array.from(supplierMap.values());
    const grandTotal = bySupplier.reduce((sum, s) => sum + s.totalToReturn, 0);

    return {
      eventId,
      eventName: event.name,
      bySupplier,
      grandTotal,
    };
  }

  /**
   * Execute a consignment return for a specific item
   * The quantity is system-determined (current stock), not manager-chosen
   */
  async executeReturn(
    eventId: number,
    barId: number,
    drinkId: number,
    supplierId: number,
    userId: number,
    notes?: string,
  ): Promise<ExecuteReturnResult> {
    // Validate access
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId);

    // Get the stock entry
    const stock = await this.repository.getStock(barId, drinkId, supplierId);

    if (!stock) {
      throw new NotFoundException(
        `Stock not found for bar ${barId}, drink ${drinkId}, supplier ${supplierId}`,
      );
    }

    if (stock.ownershipMode !== OwnershipMode.consignment) {
      throw new BadRequestException(
        'Only consignment stock can be returned. This stock is marked as purchased.',
      );
    }

    if (stock.quantity <= 0) {
      throw new BadRequestException(
        'No stock available to return. Quantity is 0.',
      );
    }

    // The quantity to return is the current stock - system determined
    const quantityToReturn = stock.quantity;

    // Execute the return
    const consignmentReturn = await this.repository.executeReturn(
      barId,
      drinkId,
      supplierId,
      quantityToReturn,
      userId,
      notes,
    );

    return {
      returnId: consignmentReturn.id,
      barId,
      drinkId,
      drinkSku: stock.drink.sku,
      supplierId,
      quantityReturned: quantityToReturn,
      returnedAt: consignmentReturn.returnedAt,
      performedById: userId,
    };
  }

  /**
   * Execute all pending consignment returns for a bar
   * Used at event close to return all remaining consignment stock
   */
  async executeAllReturns(
    eventId: number,
    barId: number,
    userId: number,
  ): Promise<ExecuteReturnResult[]> {
    // Validate access
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId);

    // Get all consignment stock for the bar
    const consignmentStock = await this.repository.getConsignmentStockForBar(barId);

    if (consignmentStock.length === 0) {
      return [];
    }

    const results: ExecuteReturnResult[] = [];

    for (const stock of consignmentStock) {
      if (stock.quantity > 0) {
        const result = await this.executeReturn(
          eventId,
          barId,
          stock.drinkId,
          stock.supplierId,
          userId,
          'Bulk return at event close',
        );
        results.push(result);
      }
    }

    return results;
  }
}
