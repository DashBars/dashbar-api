import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { StockRepository } from './stock.repository';
import { BarsService } from '../bars/bars.service';
import { EventsService } from '../events/events.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import {
  UpsertStockDto,
  BulkUpsertStockDto,
  CreateConsignmentReturnDto,
  AssignStockDto,
  MoveStockDto,
  ReturnStockDto,
} from './dto';
import { NotOwnerException } from '../common/exceptions';
import { Stock, ConsignmentReturn, OwnershipMode, StockLocationType, StockMovementReason, MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GlobalInventoryService } from '../global-inventory/global-inventory.service';

@Injectable()
export class StockService {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly barsService: BarsService,
    private readonly eventsService: EventsService,
    private readonly suppliersService: SuppliersService,
    private readonly prisma: PrismaService,
    private readonly globalInventoryService: GlobalInventoryService,
  ) {}

  /**
   * Get all stock for a specific bar
   */
  async findAllByBar(eventId: number, barId: number, userId: number): Promise<Stock[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.findByBarId(barId);
  }

  /**
   * Get stock summary aggregated by product
   */
  async getStockSummary(
    eventId: number,
    barId: number,
    userId: number,
  ): Promise<
    {
      drinkId: number;
      drinkName: string;
      drinkBrand: string;
      totalQuantity: number;
      supplierCount: number;
    }[]
  > {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.getStockSummaryByBar(barId);
  }

  /**
   * Get stock breakdown by supplier
   */
  async getStockBySupplier(eventId: number, barId: number, userId: number): Promise<Stock[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.getStockBySupplier(barId);
  }

  /**
   * Get consignment stock available for return
   */
  async getConsignmentStock(eventId: number, barId: number, userId: number): Promise<Stock[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.getConsignmentStock(barId);
  }

  /**
   * Upsert stock for a specific bar, drink, and supplier
   */
  async upsert(
    eventId: number,
    barId: number,
    userId: number,
    dto: UpsertStockDto,
  ): Promise<Stock> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId, userId);

    // Verify drink exists
    const drink = await this.stockRepository.findDrinkById(dto.drinkId);
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${dto.drinkId} not found`);
    }

    // Verify supplier belongs to this user (tenant isolation)
    await this.suppliersService.validateOwnership(dto.supplierId, userId);

    // Validate quantity
    if (dto.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    return this.stockRepository.upsert(barId, dto.drinkId, dto.supplierId, {
      quantity: dto.quantity,
      unitCost: dto.unitCost,
      currency: dto.currency || 'ARS',
      ownershipMode: dto.ownershipMode,
    });
  }

  /**
   * Bulk upsert stock for a bar
   */
  async bulkUpsert(
    eventId: number,
    barId: number,
    userId: number,
    dto: BulkUpsertStockDto,
  ): Promise<Stock[]> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId, userId);

    const results: Stock[] = [];
    for (const item of dto.items) {
      // Verify drink exists
      const drink = await this.stockRepository.findDrinkById(item.drinkId);
      if (!drink) {
        throw new NotFoundException(`Drink with ID ${item.drinkId} not found`);
      }

      // Verify supplier belongs to this user
      await this.suppliersService.validateOwnership(item.supplierId, userId);

      // Validate quantity
      if (item.quantity <= 0) {
        throw new BadRequestException('Quantity must be greater than 0');
      }

      const stock = await this.stockRepository.upsert(
        barId,
        item.drinkId,
        item.supplierId,
        {
          quantity: item.quantity,
          unitCost: item.unitCost,
          currency: item.currency || 'ARS',
          ownershipMode: item.ownershipMode,
        },
      );
      results.push(stock);
    }

    return results;
  }

  /**
   * Delete stock entry for a bar
   */
  async delete(
    eventId: number,
    barId: number,
    drinkId: number,
    supplierId: number,
    userId: number,
  ): Promise<void> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId, userId);

    // Verify the stock entry exists
    const stock = await this.stockRepository.findByBarIdDrinkIdAndSupplierId(
      barId,
      drinkId,
      supplierId,
    );

    if (!stock) {
      throw new NotFoundException(
        `Stock entry not found for bar ${barId}, drink ${drinkId}, supplier ${supplierId}`,
      );
    }

    await this.stockRepository.delete(barId, drinkId, supplierId);
  }

  /**
   * Get stock for a specific drink across all bars in an event
   */
  async getStockByDrinkAcrossEvent(
    eventId: number,
    drinkId: number,
    userId: number,
  ): Promise<
    { barId: number; barName: string; supplierId: number; supplierName: string; quantity: number }[]
  > {
    const bars = await this.barsService.findAllByEvent(eventId, userId);
    const barIds = bars.map((b) => b.id);

    const stocks = await this.stockRepository.findByDrinkIdAndBarIds(drinkId, barIds);

    return stocks.map((s: any) => ({
      barId: s.bar.id,
      barName: s.bar.name,
      supplierId: s.supplier.id,
      supplierName: s.supplier.name,
      quantity: s.quantity,
    }));
  }

  /**
   * Create a consignment return
   */
  async createConsignmentReturn(
    eventId: number,
    barId: number,
    userId: number,
    dto: CreateConsignmentReturnDto,
  ): Promise<ConsignmentReturn> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId, userId);

    // Verify supplier belongs to this user
    await this.suppliersService.validateOwnership(dto.supplierId, userId);

    // Get the stock entry
    const stock = await this.stockRepository.findByBarIdDrinkIdAndSupplierId(
      barId,
      dto.drinkId,
      dto.supplierId,
    );

    if (!stock) {
      throw new NotFoundException(
        `Stock entry not found for bar ${barId}, drink ${dto.drinkId}, supplier ${dto.supplierId}`,
      );
    }

    // Verify it's consignment stock
    if (stock.ownershipMode !== OwnershipMode.consignment) {
      throw new BadRequestException(
        'Only consignment stock can be returned. This stock is marked as purchased.',
      );
    }

    // Verify quantity is valid
    if (dto.quantityReturned <= 0) {
      throw new BadRequestException('Quantity to return must be greater than 0');
    }

    // Verify we're not returning more than available
    if (dto.quantityReturned > stock.quantity) {
      throw new BadRequestException(
        `Cannot return ${dto.quantityReturned} units. Only ${stock.quantity} units available in stock.`,
      );
    }

    // Update stock quantity
    const newQuantity = stock.quantity - dto.quantityReturned;
    await this.stockRepository.updateQuantity(barId, dto.drinkId, dto.supplierId, newQuantity);

    // Create return record
    // @deprecated: This manual return flow should be replaced with ConsignmentService.executeReturn
    return this.stockRepository.createConsignmentReturn({
      stockBarId: barId,
      stockDrinkId: dto.drinkId,
      stockSupplierId: dto.supplierId,
      supplierId: dto.supplierId,
      quantityReturned: dto.quantityReturned,
      performedById: userId,
      notes: dto.notes,
    });
  }

  /**
   * Get consignment returns for a bar
   */
  async getConsignmentReturns(
    eventId: number,
    barId: number,
    userId: number,
  ): Promise<ConsignmentReturn[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.getConsignmentReturnsByBar(barId);
  }

  /**
   * Assign stock from global inventory to a bar
   */
  async assignStock(
    userId: number,
    dto: AssignStockDto,
  ): Promise<{ stock: Stock; movement: any }> {
    // Verify event ownership
    const event = await this.eventsService.findByIdWithOwner(dto.eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    // Verify bar belongs to event
    await this.barsService.findOne(dto.eventId, dto.barId, userId);

    // Get global inventory entry
    const globalInv = await this.globalInventoryService.findOne(
      dto.globalInventoryId,
      userId,
    );

    // Verify available quantity
    const availableQuantity =
      globalInv.totalQuantity - globalInv.allocatedQuantity;
    if (dto.quantity > availableQuantity) {
      throw new BadRequestException(
        `Cannot assign ${dto.quantity} units. Only ${availableQuantity} available.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Update global inventory
      await tx.globalInventory.update({
        where: { id: dto.globalInventoryId },
        data: {
          allocatedQuantity: { increment: dto.quantity },
        },
      });

      // Handle null supplier - use 0 as placeholder if needed
      const supplierIdForStock = globalInv.supplierId ?? 0;

      // Create or update stock in bar
      const stock = await tx.stock.upsert({
        where: {
          barId_drinkId_supplierId: {
            barId: dto.barId,
            drinkId: globalInv.drinkId,
            supplierId: supplierIdForStock,
          },
        },
        create: {
          barId: dto.barId,
          drinkId: globalInv.drinkId,
          supplierId: supplierIdForStock,
          quantity: dto.quantity,
          unitCost: globalInv.unitCost,
          currency: globalInv.currency,
          ownershipMode: globalInv.ownershipMode,
        },
        update: {
          quantity: { increment: dto.quantity },
        },
        include: { drink: true, supplier: true },
      });

      // Create inventory movement
      const movement = await tx.inventoryMovement.create({
        data: {
          fromLocationType: StockLocationType.GLOBAL,
          fromLocationId: null,
          toLocationType: StockLocationType.BAR,
          toLocationId: dto.barId,
          barId: dto.barId, // Keep for backward compatibility
          drinkId: globalInv.drinkId,
          supplierId: supplierIdForStock,
          quantity: dto.quantity,
          type: MovementType.transfer_in,
          reason: StockMovementReason.ASSIGN_TO_BAR,
          performedById: userId,
          globalInventoryId: dto.globalInventoryId,
          notes: dto.notes,
        },
      });

      return { stock, movement };
    });
  }

  /**
   * Move stock between bars in the same event
   */
  async moveStock(
    userId: number,
    dto: MoveStockDto,
  ): Promise<{ fromStock: Stock; toStock: Stock; movement: any }> {
    // Verify event ownership
    const event = await this.eventsService.findByIdWithOwner(dto.eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    // Verify both bars belong to event
    await this.barsService.findOne(dto.eventId, dto.fromBarId, userId);
    await this.barsService.findOne(dto.eventId, dto.toBarId, userId);

    if (dto.fromBarId === dto.toBarId) {
      throw new BadRequestException('Cannot move stock to the same bar');
    }

    // Get source stock
    const sourceStock = await this.stockRepository.findByBarIdAndDrinkId(
      dto.fromBarId,
      dto.drinkId,
    );

    if (!sourceStock || sourceStock.length === 0) {
      throw new NotFoundException(
        `No stock found for drink ${dto.drinkId} in source bar`,
      );
    }

    // Find matching stock entry (by supplier if available)
    const stockToMove = sourceStock.find(
      (s) => s.quantity >= dto.quantity,
    ) || sourceStock[0];

    if (stockToMove.quantity < dto.quantity) {
      throw new BadRequestException(
        `Cannot move ${dto.quantity} units. Only ${stockToMove.quantity} available in source bar.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Decrease source stock
      const fromStock = await tx.stock.update({
        where: {
          barId_drinkId_supplierId: {
            barId: dto.fromBarId,
            drinkId: dto.drinkId,
            supplierId: stockToMove.supplierId,
          },
        },
        data: {
          quantity: { decrement: dto.quantity },
        },
        include: { drink: true, supplier: true },
      });

      // Increase destination stock
      const toStock = await tx.stock.upsert({
        where: {
          barId_drinkId_supplierId: {
            barId: dto.toBarId,
            drinkId: dto.drinkId,
            supplierId: stockToMove.supplierId,
          },
        },
        create: {
          barId: dto.toBarId,
          drinkId: dto.drinkId,
          supplierId: stockToMove.supplierId,
          quantity: dto.quantity,
          unitCost: stockToMove.unitCost,
          currency: stockToMove.currency,
          ownershipMode: stockToMove.ownershipMode,
        },
        update: {
          quantity: { increment: dto.quantity },
        },
        include: { drink: true, supplier: true },
      });

      // Create inventory movement
      const movement = await tx.inventoryMovement.create({
        data: {
          fromLocationType: StockLocationType.BAR,
          fromLocationId: dto.fromBarId,
          toLocationType: StockLocationType.BAR,
          toLocationId: dto.toBarId,
          barId: dto.toBarId, // Keep for backward compatibility
          drinkId: dto.drinkId,
          supplierId: stockToMove.supplierId,
          quantity: dto.quantity,
          type: MovementType.transfer_in,
          reason: StockMovementReason.MOVE_BETWEEN_BARS,
          performedById: userId,
          notes: dto.notes,
        },
      });

      return { fromStock, toStock, movement };
    });
  }

  /**
   * Return stock from bar to global inventory
   */
  async returnStock(
    userId: number,
    dto: ReturnStockDto,
  ): Promise<{ globalInventory: any; movement: any }> {
    // Verify event ownership
    const event = await this.eventsService.findByIdWithOwner(dto.eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    // Verify bar belongs to event
    await this.barsService.findOne(dto.eventId, dto.barId, userId);

    // Get bar stock
    const barStock = await this.stockRepository.findByBarIdAndDrinkId(
      dto.barId,
      dto.drinkId,
    );

    if (!barStock || barStock.length === 0) {
      throw new NotFoundException(
        `No stock found for drink ${dto.drinkId} in bar`,
      );
    }

    // Find matching stock entry
    const stockToReturn = barStock.find((s) => s.quantity >= dto.quantity) || barStock[0];

    if (stockToReturn.quantity < dto.quantity) {
      throw new BadRequestException(
        `Cannot return ${dto.quantity} units. Only ${stockToReturn.quantity} available in bar.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Decrease bar stock
      await tx.stock.update({
        where: {
          barId_drinkId_supplierId: {
            barId: dto.barId,
            drinkId: dto.drinkId,
            supplierId: stockToReturn.supplierId,
          },
        },
        data: {
          quantity: { decrement: dto.quantity },
        },
      });

      // Find or create global inventory entry
      const supplierIdForGlobal = stockToReturn.supplierId || null;
      let globalInv = await tx.globalInventory.findFirst({
        where: {
          ownerId: userId,
          drinkId: dto.drinkId,
          supplierId: supplierIdForGlobal,
        },
      });

      let createdGlobalInv = false;
      if (!globalInv) {
        // Under the new rules, bar stock should always come from global inventory.
        // Still, keep this defensive path to avoid losing stock if legacy data exists.
        const created = await tx.globalInventory.create({
          data: {
            ownerId: userId,
            drinkId: dto.drinkId,
            supplierId: supplierIdForGlobal,
            // These units were not previously counted in global inventory.
            totalQuantity: dto.quantity,
            allocatedQuantity: 0,
            unitCost: stockToReturn.unitCost,
            currency: stockToReturn.currency,
            ownershipMode: stockToReturn.ownershipMode,
          },
        });
        globalInv = created;
        createdGlobalInv = true;
      }

      // Update global inventory
      // IMPORTANT: do NOT increment totalQuantity here.
      // totalQuantity already represents the physical stock owned in global inventory.
      // Assigning to bars increments allocatedQuantity; returning should only decrement allocatedQuantity.
      const updatedGlobalInv = createdGlobalInv
        ? globalInv
        : await (async () => {
            if (globalInv.allocatedQuantity < dto.quantity) {
              throw new BadRequestException(
                `Cannot return ${dto.quantity} units. Global inventory allocatedQuantity is ${globalInv.allocatedQuantity}.`,
              );
            }
            return tx.globalInventory.update({
              where: { id: globalInv.id },
              data: { allocatedQuantity: { decrement: dto.quantity } },
            });
          })();

      // Create inventory movement
      const movement = await tx.inventoryMovement.create({
        data: {
          fromLocationType: StockLocationType.BAR,
          fromLocationId: dto.barId,
          toLocationType: StockLocationType.GLOBAL,
          toLocationId: null,
          barId: dto.barId, // Keep for backward compatibility
          drinkId: dto.drinkId,
          supplierId: stockToReturn.supplierId,
          quantity: dto.quantity,
          type: MovementType.transfer_in,
          reason: StockMovementReason.RETURN_TO_GLOBAL,
          performedById: userId,
          globalInventoryId: globalInv.id,
          notes: dto.notes,
        },
      });

      return { globalInventory: updatedGlobalInv, movement };
    });
  }
}
