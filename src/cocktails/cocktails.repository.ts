import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cocktail, Prisma } from '@prisma/client';

@Injectable()
export class CocktailsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.CocktailCreateInput): Promise<Cocktail> {
    return this.prisma.cocktail.create({ data });
  }

  async findAll(includeInactive: boolean = false): Promise<Cocktail[]> {
    return this.prisma.cocktail.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: number): Promise<Cocktail | null> {
    return this.prisma.cocktail.findUnique({
      where: { id },
    });
  }

  async findBySku(sku: string): Promise<Cocktail | null> {
    return this.prisma.cocktail.findUnique({
      where: { sku },
    });
  }

  async update(id: number, data: Prisma.CocktailUpdateInput): Promise<Cocktail> {
    return this.prisma.cocktail.update({
      where: { id },
      data,
    });
  }

  async deactivate(id: number): Promise<Cocktail> {
    return this.prisma.cocktail.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.cocktail.delete({
      where: { id },
    });
  }

  async findWithCategories(id: number) {
    return this.prisma.cocktail.findUnique({
      where: { id },
      include: {
        categories: {
          include: { category: true },
        },
      },
    });
  }

  async search(query: string): Promise<Cocktail[]> {
    return this.prisma.cocktail.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
    });
  }
}
