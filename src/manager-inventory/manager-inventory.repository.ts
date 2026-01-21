import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagerInventory, Prisma } from '@prisma/client';

@Injectable()
export class ManagerInventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ManagerInventoryCreateInput): Promise<ManagerInventory> {
    return this.prisma.managerInventory.create({
      data,
      include: {
        drink: true,
        supplier: true,
        allocations: {
          include: {
            event: true,
            bar: true,
          },
        },
      },
    });
  }

  async findByOwnerId(ownerId: number): Promise<ManagerInventory[]> {
    return this.prisma.managerInventory.findMany({
      where: { ownerId },
      include: {
        drink: true,
        supplier: true,
        allocations: {
          include: {
            event: true,
            bar: true,
          },
        },
      },
      orderBy: { receivedAt: 'desc' },
    });
  }

  async findById(id: number): Promise<ManagerInventory | null> {
    return this.prisma.managerInventory.findUnique({
      where: { id },
      include: {
        drink: true,
        supplier: true,
        allocations: {
          include: {
            event: true,
            bar: true,
          },
        },
      },
    });
  }

  async findByIdAndOwnerId(id: number, ownerId: number): Promise<ManagerInventory | null> {
    return this.prisma.managerInventory.findFirst({
      where: { id, ownerId },
      include: {
        drink: true,
        supplier: true,
        allocations: {
          include: {
            event: true,
            bar: true,
          },
        },
      },
    });
  }

  async update(id: number, data: Prisma.ManagerInventoryUpdateInput): Promise<ManagerInventory> {
    return this.prisma.managerInventory.update({
      where: { id },
      data,
      include: {
        drink: true,
        supplier: true,
        allocations: {
          include: {
            event: true,
            bar: true,
          },
        },
      },
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.managerInventory.delete({
      where: { id },
    });
  }

  async incrementAllocatedQuantity(id: number, quantity: number): Promise<ManagerInventory> {
    return this.prisma.managerInventory.update({
      where: { id },
      data: {
        allocatedQuantity: {
          increment: quantity,
        },
      },
      include: {
        drink: true,
        supplier: true,
        allocations: {
          include: {
            event: true,
            bar: true,
          },
        },
      },
    });
  }

  async createAllocation(data: Prisma.ManagerInventoryAllocationCreateInput) {
    return this.prisma.managerInventoryAllocation.create({
      data,
      include: {
        event: true,
        bar: true,
        managerInventory: {
          include: {
            drink: true,
            supplier: true,
          },
        },
      },
    });
  }
}
