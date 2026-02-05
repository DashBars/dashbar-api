import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Category, CocktailCategory, Prisma } from '@prisma/client';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.CategoryUncheckedCreateInput): Promise<Category> {
    return this.prisma.category.create({
      data,
      include: {
        cocktails: {
          include: { cocktail: true },
          orderBy: { sortIndex: 'asc' },
        },
      },
    });
  }

  async findByEventId(eventId: number): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { eventId },
      include: {
        cocktails: {
          include: { cocktail: true },
          orderBy: { sortIndex: 'asc' },
        },
      },
      orderBy: { sortIndex: 'asc' },
    });
  }

  async findById(id: number): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: { id },
      include: {
        cocktails: {
          include: { cocktail: true },
          orderBy: { sortIndex: 'asc' },
        },
      },
    });
  }

  async findByEventIdAndCategoryId(eventId: number, categoryId: number): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: { id: categoryId, eventId },
      include: {
        cocktails: {
          include: { cocktail: true },
          orderBy: { sortIndex: 'asc' },
        },
      },
    });
  }

  async findByEventIdAndName(eventId: number, name: string): Promise<Category | null> {
    return this.prisma.category.findUnique({
      where: {
        eventId_name: { eventId, name },
      },
    });
  }

  async update(id: number, data: Prisma.CategoryUpdateInput): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data,
      include: {
        cocktails: {
          include: { cocktail: true },
          orderBy: { sortIndex: 'asc' },
        },
      },
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.category.delete({
      where: { id },
    });
  }

  async assignCocktails(
    categoryId: number,
    cocktails: Array<{ cocktailId: number; sortIndex?: number }>,
  ): Promise<CocktailCategory[]> {
    // Delete existing assignments for these cocktails in this category
    await this.prisma.cocktailCategory.deleteMany({
      where: { categoryId },
    });

    // Create new assignments
    const data = cocktails.map((c, index) => ({
      categoryId,
      cocktailId: c.cocktailId,
      sortIndex: c.sortIndex ?? index,
    }));

    await this.prisma.cocktailCategory.createMany({
      data,
    });

    return this.prisma.cocktailCategory.findMany({
      where: { categoryId },
      include: { cocktail: true },
      orderBy: { sortIndex: 'asc' },
    });
  }

  async addCocktailToCategory(
    categoryId: number,
    cocktailId: number,
    sortIndex: number = 0,
  ): Promise<CocktailCategory> {
    return this.prisma.cocktailCategory.upsert({
      where: {
        categoryId_cocktailId: { categoryId, cocktailId },
      },
      create: { categoryId, cocktailId, sortIndex },
      update: { sortIndex },
      include: { cocktail: true },
    });
  }

  async removeCocktailFromCategory(categoryId: number, cocktailId: number): Promise<void> {
    await this.prisma.cocktailCategory.delete({
      where: {
        categoryId_cocktailId: { categoryId, cocktailId },
      },
    });
  }

  async findCocktailById(cocktailId: number) {
    return this.prisma.cocktail.findUnique({
      where: { id: cocktailId },
    });
  }

  async getNextSortIndex(eventId: number): Promise<number> {
    const maxCategory = await this.prisma.category.findFirst({
      where: { eventId },
      orderBy: { sortIndex: 'desc' },
      select: { sortIndex: true },
    });

    return (maxCategory?.sortIndex ?? -1) + 1;
  }
}
