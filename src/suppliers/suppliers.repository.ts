import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Supplier, Prisma } from '@prisma/client';

@Injectable()
export class SuppliersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.SupplierCreateInput): Promise<Supplier> {
    return this.prisma.supplier.create({ data });
  }

  async findByOwnerId(ownerId: number): Promise<Supplier[]> {
    return this.prisma.supplier.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: number): Promise<Supplier | null> {
    return this.prisma.supplier.findUnique({
      where: { id },
    });
  }

  async findByIdAndOwnerId(id: number, ownerId: number): Promise<Supplier | null> {
    return this.prisma.supplier.findFirst({
      where: { id, ownerId },
    });
  }

  async update(id: number, data: Prisma.SupplierUpdateInput): Promise<Supplier> {
    return this.prisma.supplier.update({
      where: { id },
      data,
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.supplier.delete({
      where: { id },
    });
  }
}
