import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Drink, Prisma } from '@prisma/client';

@Injectable()
export class DrinksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Drink[]> {
    return this.prisma.drink.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async search(query: string): Promise<Drink[]> {
    return this.prisma.drink.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { brand: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: number): Promise<Drink | null> {
    return this.prisma.drink.findUnique({
      where: { id },
    });
  }

  async create(data: Prisma.DrinkCreateInput): Promise<Drink> {
    return this.prisma.drink.create({ data });
  }

  async update(id: number, data: Prisma.DrinkUpdateInput): Promise<Drink> {
    return this.prisma.drink.update({
      where: { id },
      data,
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.drink.delete({
      where: { id },
    });
  }
}
