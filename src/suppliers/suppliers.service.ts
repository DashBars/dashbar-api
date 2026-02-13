import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { SuppliersRepository } from './suppliers.repository';
import { CreateSupplierDto, UpdateSupplierDto } from './dto';
import { Supplier } from '@prisma/client';

@Injectable()
export class SuppliersService {
  constructor(private readonly suppliersRepository: SuppliersRepository) {}

  /**
   * Create a new supplier for the current user (tenant)
   */
  async create(userId: number, dto: CreateSupplierDto): Promise<Supplier> {
    return this.suppliersRepository.create({
      name: dto.name,
      description: dto.description,
      email: dto.email,
      phone: dto.phone,
      owner: { connect: { id: userId } },
    });
  }

  /**
   * List all suppliers for the current user (tenant)
   */
  async findAllByOwner(userId: number): Promise<Supplier[]> {
    return this.suppliersRepository.findByOwnerId(userId);
  }

  /**
   * Find a specific supplier by ID, ensuring tenant isolation
   */
  async findOne(supplierId: number, userId: number): Promise<Supplier> {
    const supplier = await this.suppliersRepository.findByIdAndOwnerId(supplierId, userId);

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${supplierId} not found`);
    }

    return supplier;
  }

  /**
   * Find supplier by ID (internal use, validates ownership separately)
   */
  async findById(supplierId: number): Promise<Supplier> {
    const supplier = await this.suppliersRepository.findById(supplierId);

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${supplierId} not found`);
    }

    return supplier;
  }

  /**
   * Validate that a supplier belongs to the given user (tenant)
   */
  async validateOwnership(supplierId: number, userId: number): Promise<Supplier> {
    const supplier = await this.suppliersRepository.findById(supplierId);

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${supplierId} not found`);
    }

    if (supplier.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this supplier');
    }

    return supplier;
  }

  /**
   * Update a supplier
   */
  async update(supplierId: number, userId: number, dto: UpdateSupplierDto): Promise<Supplier> {
    await this.findOne(supplierId, userId); // Ensures exists and belongs to user

    return this.suppliersRepository.update(supplierId, dto);
  }

  /**
   * Delete a supplier only if it has no active stock anywhere
   */
  async delete(supplierId: number, userId: number): Promise<void> {
    await this.findOne(supplierId, userId); // Ensures exists and belongs to user

    const activeStock = await this.suppliersRepository.hasActiveStock(supplierId);
    if (activeStock) {
      throw new ConflictException(
        'No se puede eliminar este proveedor porque tiene stock asociado en una o más barras. Eliminá o consumí el stock primero.',
      );
    }

    await this.suppliersRepository.delete(supplierId);
  }
}
