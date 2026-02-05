import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BarRecipeOverride, Prisma } from '@prisma/client';

@Injectable()
export class RecipeOverridesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.BarRecipeOverrideUncheckedCreateInput): Promise<BarRecipeOverride> {
    return this.prisma.barRecipeOverride.create({
      data,
      include: { cocktail: true, drink: true },
    });
  }

  async findByBarId(barId: number): Promise<BarRecipeOverride[]> {
    return this.prisma.barRecipeOverride.findMany({
      where: { barId },
      include: { cocktail: true, drink: true },
      orderBy: [{ cocktailId: 'asc' }, { drinkId: 'asc' }],
    });
  }

  async findById(id: number): Promise<BarRecipeOverride | null> {
    return this.prisma.barRecipeOverride.findUnique({
      where: { id },
      include: { cocktail: true, drink: true, bar: true },
    });
  }

  async findByBarIdAndCocktailId(
    barId: number,
    cocktailId: number,
  ): Promise<BarRecipeOverride[]> {
    return this.prisma.barRecipeOverride.findMany({
      where: { barId, cocktailId },
      include: { drink: true },
    });
  }

  async findByBarIdCocktailIdAndDrinkId(
    barId: number,
    cocktailId: number,
    drinkId: number,
  ): Promise<BarRecipeOverride | null> {
    return this.prisma.barRecipeOverride.findUnique({
      where: {
        barId_cocktailId_drinkId: { barId, cocktailId, drinkId },
      },
      include: { cocktail: true, drink: true },
    });
  }

  async upsert(
    barId: number,
    cocktailId: number,
    drinkId: number,
    cocktailPercentage: number,
  ): Promise<BarRecipeOverride> {
    return this.prisma.barRecipeOverride.upsert({
      where: {
        barId_cocktailId_drinkId: { barId, cocktailId, drinkId },
      },
      create: { barId, cocktailId, drinkId, cocktailPercentage },
      update: { cocktailPercentage },
      include: { cocktail: true, drink: true },
    });
  }

  async update(id: number, data: Prisma.BarRecipeOverrideUpdateInput): Promise<BarRecipeOverride> {
    return this.prisma.barRecipeOverride.update({
      where: { id },
      data,
      include: { cocktail: true, drink: true },
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.barRecipeOverride.delete({
      where: { id },
    });
  }

  async deleteByBarIdAndCocktailId(barId: number, cocktailId: number): Promise<void> {
    await this.prisma.barRecipeOverride.deleteMany({
      where: { barId, cocktailId },
    });
  }

  async findCocktailById(cocktailId: number) {
    return this.prisma.cocktail.findUnique({
      where: { id: cocktailId },
    });
  }

  async findDrinkById(drinkId: number) {
    return this.prisma.drink.findUnique({
      where: { id: drinkId },
    });
  }
}
