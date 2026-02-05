import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GlobalInventory, Prisma } from '@prisma/client';

@Injectable()
export class GlobalInventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByOwner(ownerId: number): Promise<GlobalInventory[]> {
    return this.prisma.globalInventory.findMany({
      where: { ownerId },
      include: {
        drink: true,
        supplier: true,
      },
      orderBy: { lastUpdatedAt: 'desc' },
    });
  }

  async findById(id: number): Promise<GlobalInventory | null> {
    return this.prisma.globalInventory.findUnique({
      where: { id },
      include: {
        drink: true,
        supplier: true,
      },
    });
  }

  async findByIdAndOwnerId(
    id: number,
    ownerId: number,
  ): Promise<GlobalInventory | null> {
    return this.prisma.globalInventory.findFirst({
      where: { id, ownerId },
      include: {
        drink: true,
        supplier: true,
      },
    });
  }

  async findByOwnerDrinkSupplier(
    ownerId: number,
    drinkId: number,
    supplierId: number | null,
  ): Promise<GlobalInventory | null> {
    return this.prisma.globalInventory.findUnique({
      where: {
        ownerId_drinkId_supplierId: {
          ownerId,
          drinkId,
          supplierId: supplierId || 0, // Handle null supplierId
        },
      },
    });
  }

  async create(
    data: Prisma.GlobalInventoryCreateInput,
  ): Promise<GlobalInventory> {
    return this.prisma.globalInventory.create({
      data,
      include: {
        drink: true,
        supplier: true,
      },
    });
  }

  async update(
    id: number,
    data: Prisma.GlobalInventoryUpdateInput,
  ): Promise<GlobalInventory> {
    return this.prisma.globalInventory.update({
      where: { id },
      data,
      include: {
        drink: true,
        supplier: true,
      },
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.globalInventory.delete({
      where: { id },
    });
  }
}
