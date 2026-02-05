import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ManagerInventoryRepository } from './manager-inventory.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateManagerInventoryDto,
  UpdateManagerInventoryDto,
  TransferToBarDto,
} from './dto';
import { EventsService } from '../events/events.service';
import { BarsService } from '../bars/bars.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { StockRepository } from '../stock/stock.repository';
import { NotOwnerException } from '../common/exceptions';
import { ManagerInventory, OwnershipMode } from '@prisma/client';

@Injectable()
export class ManagerInventoryService {
  constructor(
    private readonly repository: ManagerInventoryRepository,
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly barsService: BarsService,
    private readonly suppliersService: SuppliersService,
    private readonly stockRepository: StockRepository,
  ) {}

  /**
   * Create a new manager inventory entry
   */
  async create(
    userId: number,
    dto: CreateManagerInventoryDto,
  ): Promise<ManagerInventory> {
    // Verify drink exists
    const drink = await this.prisma.drink.findUnique({
      where: { id: dto.drinkId },
    });

    if (!drink) {
      throw new NotFoundException(`Drink with ID ${dto.drinkId} not found`);
    }

    // Verify supplier belongs to this user
    await this.suppliersService.validateOwnership(dto.supplierId, userId);

    // Check if entry already exists with same owner, drink, supplier, and sku
    // Use findFirst since sku can be null and unique constraint may not work as expected
    const existing = await this.prisma.managerInventory.findFirst({
      where: {
        ownerId: userId,
        drinkId: dto.drinkId,
        supplierId: dto.supplierId,
        sku: dto.sku || null,
      },
    });

    if (existing) {
      // Update existing entry by adding quantity
      return this.repository.update(existing.id, {
        totalQuantity: {
          increment: dto.totalQuantity,
        },
        unitCost: dto.unitCost, // Update cost to latest
        sku: dto.sku,
      });
    }

    return this.repository.create({
      owner: { connect: { id: userId } },
      drink: { connect: { id: dto.drinkId } },
      supplier: { connect: { id: dto.supplierId } },
      totalQuantity: dto.totalQuantity,
      allocatedQuantity: 0,
      unitCost: dto.unitCost,
      currency: dto.currency || 'ARS',
      sku: dto.sku,
    });
  }

  /**
   * List all inventory entries for the manager
   */
  async findAllByOwner(userId: number): Promise<ManagerInventory[]> {
    return this.repository.findByOwnerId(userId);
  }

  /**
   * Find a specific inventory entry
   */
  async findOne(id: number, userId: number) {
    const inventory = await this.repository.findByIdAndOwnerId(id, userId);

    if (!inventory) {
      throw new NotFoundException(`Inventory entry with ID ${id} not found`);
    }

    return inventory;
  }

  /**
   * Update an inventory entry
   */
  async update(
    id: number,
    userId: number,
    dto: UpdateManagerInventoryDto,
  ): Promise<ManagerInventory> {
    const inventory = await this.findOne(id, userId);

    // Validate that new total quantity is not less than allocated quantity
    if (dto.totalQuantity !== undefined) {
      if (dto.totalQuantity < inventory.allocatedQuantity) {
        throw new BadRequestException(
          `Total quantity cannot be less than allocated quantity (${inventory.allocatedQuantity})`,
        );
      }
    }

    const updateData: any = {};
    if (dto.totalQuantity !== undefined) {
      updateData.totalQuantity = dto.totalQuantity;
    }
    if (dto.unitCost !== undefined) {
      updateData.unitCost = dto.unitCost;
    }
    if (dto.sku !== undefined) {
      updateData.sku = dto.sku;
    }

    return this.repository.update(id, updateData);
  }

  /**
   * Delete an inventory entry
   */
  async delete(id: number, userId: number): Promise<void> {
    const inventory = await this.findOne(id, userId);

    // Check if there are allocations
    if (inventory.allocatedQuantity > 0) {
      throw new BadRequestException(
        'Cannot delete inventory entry with allocated quantities. Please remove allocations first.',
      );
    }

    await this.repository.delete(id);
  }

  /**
   * Transfer inventory to a bar (creates Stock and Allocation)
   */
  async transferToBar(
    id: number,
    userId: number,
    dto: TransferToBarDto,
  ): Promise<{ stock: any; allocation: any }> {
    const inventory = await this.findOne(id, userId);

    // Validate event ownership
    const event = await this.eventsService.findByIdWithOwner(dto.eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    // Validate bar exists and belongs to event
    await this.barsService.findOne(dto.eventId, dto.barId, userId);

    // Calculate available quantity
    const availableQuantity =
      inventory.totalQuantity - inventory.allocatedQuantity;

    if (dto.quantity > availableQuantity) {
      throw new BadRequestException(
        `Cannot transfer ${dto.quantity} units. Only ${availableQuantity} units available.`,
      );
    }

    // Use transaction to ensure consistency
    return this.prisma.$transaction(async (tx) => {
      // Create or update Stock in the bar
      const stock = await tx.stock.upsert({
        where: {
          barId_drinkId_supplierId: {
            barId: dto.barId,
            drinkId: inventory.drinkId,
            supplierId: inventory.supplierId,
          },
        },
        create: {
          barId: dto.barId,
          drinkId: inventory.drinkId,
          supplierId: inventory.supplierId,
          quantity: dto.quantity,
          unitCost: inventory.unitCost,
          currency: inventory.currency,
          ownershipMode: OwnershipMode.purchased,
        },
        update: {
          quantity: {
            increment: dto.quantity,
          },
        },
        include: {
          drink: true,
          supplier: true,
        },
      });

      // Create allocation record
      const allocation = await tx.managerInventoryAllocation.create({
        data: {
          managerInventoryId: id,
          eventId: dto.eventId,
          barId: dto.barId,
          quantity: dto.quantity,
        },
        include: {
          event: true,
          bar: true,
        },
      });

      // Update allocated quantity in inventory
      await tx.managerInventory.update({
        where: { id },
        data: {
          allocatedQuantity: {
            increment: dto.quantity,
          },
        },
      });

      return { stock, allocation };
    });
  }

  /**
   * Get all allocations for an inventory entry
   */
  async getAllocations(
    id: number,
    userId: number,
  ) {
    const inventory = await this.repository.findByIdAndOwnerId(id, userId);
    
    if (!inventory) {
      throw new NotFoundException(`Inventory entry with ID ${id} not found`);
    }

    // Type assertion needed because Prisma types don't always include relations
    return (inventory as any).allocations || [];
  }
}
