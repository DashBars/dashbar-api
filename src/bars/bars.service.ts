import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { BarsRepository } from './bars.repository';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBarDto, UpdateBarDto } from './dto';
import { NotOwnerException } from '../common/exceptions';
import { Bar, BarType, BarStatus, EventStatus, StockLocationType, StockMovementReason, MovementType } from '@prisma/client';

@Injectable()
export class BarsService {
  constructor(
    private readonly barsRepository: BarsRepository,
    private readonly eventsService: EventsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create a new bar under an event
   */
  async create(eventId: number, userId: number, dto: CreateBarDto): Promise<Bar> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    // Only allow creating bars for upcoming events
    if (event.status !== EventStatus.upcoming) {
      throw new BadRequestException('Can only create bars for upcoming events');
    }

    return this.barsRepository.create({
      name: dto.name,
      type: dto.type,
      status: dto.status || BarStatus.closed, // Default to closed for upcoming events
      event: { connect: { id: eventId } },
    });
  }

  /**
   * List all bars for an event (only if user owns the event)
   */
  async findAllByEvent(eventId: number, userId: number): Promise<Bar[]> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    return this.barsRepository.findByEventId(eventId);
  }

  /**
   * Find a specific bar by ID within an event (only if user owns the event)
   */
  async findOne(eventId: number, barId: number, userId: number): Promise<Bar> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const bar = await this.barsRepository.findByEventIdAndBarId(eventId, barId);

    if (!bar) {
      throw new NotFoundException(`Bar with ID ${barId} not found in event ${eventId}`);
    }

    return bar;
  }

  /**
   * Update a bar
   */
  async update(eventId: number, barId: number, userId: number, dto: UpdateBarDto): Promise<Bar> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.findOne(eventId, barId, userId); // Ensure bar exists in event and user owns it

    return this.barsRepository.update(barId, dto);
  }

  /**
   * Delete a bar (only if event is upcoming, and return stock to global inventory)
   */
  async delete(eventId: number, barId: number, userId: number): Promise<void> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    // Only allow deleting bars from upcoming events
    if (event.status !== EventStatus.upcoming) {
      throw new BadRequestException('Can only delete bars from upcoming events');
    }

    const bar = await this.findOne(eventId, barId, userId); // Ensure bar exists in event and user owns it

    return this.prisma.$transaction(async (tx) => {
      // Get all stock from the bar
      const barStock = await tx.stock.findMany({
        where: { barId },
        include: { drink: true, supplier: true },
      });

      // Return each stock item to global inventory
      for (const stock of barStock) {
        // Find or create GlobalInventory entry
        let globalInv = await tx.globalInventory.findFirst({
          where: {
            ownerId: userId,
            drinkId: stock.drinkId,
            supplierId: stock.supplierId || null,
          },
        });

        let createdGlobalInv = false;
        if (!globalInv) {
          globalInv = await tx.globalInventory.create({
            data: {
              ownerId: userId,
              drinkId: stock.drinkId,
              supplierId: stock.supplierId || null,
              // Defensive path: if legacy bar stock exists without a global record,
              // create it so we don't lose track of physical stock.
              totalQuantity: stock.quantity,
              allocatedQuantity: 0,
              unitCost: stock.unitCost,
              currency: stock.currency,
              ownershipMode: stock.ownershipMode,
            },
          });
          createdGlobalInv = true;
        }

        // IMPORTANT: do NOT increment totalQuantity here.
        // totalQuantity represents the physical stock owned in global inventory.
        // Deleting a bar returns allocated stock back to available by decrementing allocatedQuantity.
        if (!createdGlobalInv) {
          if (globalInv.allocatedQuantity < stock.quantity) {
            throw new BadRequestException(
              `Cannot return ${stock.quantity} units to global. allocatedQuantity is ${globalInv.allocatedQuantity}.`,
            );
          }
          await tx.globalInventory.update({
            where: { id: globalInv.id },
            data: { allocatedQuantity: { decrement: stock.quantity } },
          });
        }

        // Create inventory movement
        await tx.inventoryMovement.create({
          data: {
            fromLocationType: StockLocationType.BAR,
            fromLocationId: barId,
            toLocationType: StockLocationType.GLOBAL,
            toLocationId: null,
            barId: barId, // Keep for backward compatibility
            drinkId: stock.drinkId,
            supplierId: stock.supplierId,
            quantity: stock.quantity,
            type: MovementType.transfer_in,
            reason: StockMovementReason.RETURN_TO_GLOBAL,
            performedById: userId,
            globalInventoryId: globalInv.id,
            notes: `Returned from bar ${bar.name} (deleted)`,
          },
        });
      }

      // Delete stock records
      await tx.stock.deleteMany({
        where: { barId },
      });

      // Delete ManagerInventoryAllocation if exists
      await tx.managerInventoryAllocation.deleteMany({
        where: { barId },
      });

      // Delete inventory movements associated with this bar
      await tx.inventoryMovement.deleteMany({
        where: { barId },
      });

      // Delete the bar
      await tx.bar.delete({
        where: { id: barId },
      });
    });
  }

  /**
   * Get bars by type within an event (only if user owns the event)
   */
  async findByType(eventId: number, barType: BarType, userId: number): Promise<Bar[]> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    return this.barsRepository.findByEventIdAndType(eventId, barType);
  }

  /**
   * Get all bar types used in an event (only if user owns the event)
   */
  async getBarTypesInEvent(eventId: number, userId: number): Promise<BarType[]> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    return this.barsRepository.findDistinctTypesByEventId(eventId);
  }

  /**
   * Update bar status (used by alarms service)
   * This method doesn't require ownership validation as it's called internally
   */
  async updateBarStatus(barId: number, status: BarStatus): Promise<Bar> {
    return this.barsRepository.update(barId, { status });
  }
}
