import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { GlobalInventoryRepository } from './global-inventory.repository';
import { CreateGlobalInventoryDto, UpdateGlobalInventoryDto } from './dto';
import { NotOwnerException } from '../common/exceptions';
import { DrinksService } from '../drinks/drinks.service';
import { SuppliersService } from '../suppliers/suppliers.service';

@Injectable()
export class GlobalInventoryService {
  constructor(
    private readonly repository: GlobalInventoryRepository,
    private readonly drinksService: DrinksService,
    private readonly suppliersService: SuppliersService,
  ) {}

  /**
   * List all global inventory for the manager
   */
  async findAllByOwner(userId: number) {
    return this.repository.findAllByOwner(userId);
  }

  /**
   * Get a specific inventory entry
   */
  async findOne(id: number, userId: number) {
    const inventory = await this.repository.findByIdAndOwnerId(id, userId);
    if (!inventory) {
      throw new NotFoundException(`Global inventory with ID ${id} not found`);
    }
    return inventory;
  }

  /**
   * Create a new global inventory entry
   */
  async create(
    userId: number,
    dto: CreateGlobalInventoryDto,
  ): Promise<any> {
    // Verify drink exists
    const drink = await this.drinksService.findOne(dto.drinkId);
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${dto.drinkId} not found`);
    }

    // Verify supplier if provided
    if (dto.supplierId) {
      await this.suppliersService.validateOwnership(dto.supplierId, userId);
    }

    // Check if entry already exists
    const existing = await this.repository.findByOwnerDrinkSupplier(
      userId,
      dto.drinkId,
      dto.supplierId || null,
    );

    if (existing) {
      throw new BadRequestException(
        'Inventory entry already exists for this drink and supplier combination',
      );
    }

    return this.repository.create({
      owner: { connect: { id: userId } },
      drink: { connect: { id: dto.drinkId } },
      supplier: dto.supplierId
        ? { connect: { id: dto.supplierId } }
        : undefined,
      totalQuantity: dto.totalQuantity,
      allocatedQuantity: 0,
      unitCost: dto.unitCost,
      currency: dto.currency || 'ARS',
      sku: dto.sku,
      ownershipMode: dto.ownershipMode || 'purchased',
    });
  }

  /**
   * Update a global inventory entry
   */
  async update(
    id: number,
    userId: number,
    dto: UpdateGlobalInventoryDto,
  ): Promise<any> {
    const inventory = await this.findOne(id, userId);

    // Validate that allocatedQuantity doesn't exceed new totalQuantity
    if (dto.totalQuantity !== undefined) {
      if (dto.totalQuantity < inventory.allocatedQuantity) {
        throw new BadRequestException(
          `Cannot set totalQuantity to ${dto.totalQuantity}. ` +
            `There are ${inventory.allocatedQuantity} units allocated to bars.`,
        );
      }
    }

    return this.repository.update(id, dto);
  }

  /**
   * Delete a global inventory entry (only if no allocated quantity)
   */
  async delete(id: number, userId: number): Promise<void> {
    const inventory = await this.findOne(id, userId);

    if (inventory.allocatedQuantity > 0) {
      throw new BadRequestException(
        `Cannot delete inventory with allocated quantity. ` +
          `There are ${inventory.allocatedQuantity} units allocated to bars.`,
      );
    }

    await this.repository.delete(id);
  }
}
