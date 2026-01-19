import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventRecipe, BarType, Prisma } from '@prisma/client';

@Injectable()
export class RecipesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.EventRecipeUncheckedCreateInput): Promise<EventRecipe> {
    return this.prisma.eventRecipe.create({
      data,
      include: { cocktail: true, drink: true },
    });
  }

  async findById(id: number): Promise<EventRecipe | null> {
    return this.prisma.eventRecipe.findUnique({
      where: { id },
      include: { cocktail: true, drink: true },
    });
  }

  async findByEventIdAndRecipeId(eventId: number, recipeId: number): Promise<EventRecipe | null> {
    return this.prisma.eventRecipe.findFirst({
      where: { id: recipeId, eventId },
      include: { cocktail: true, drink: true },
    });
  }

  async findByEventId(eventId: number): Promise<EventRecipe[]> {
    return this.prisma.eventRecipe.findMany({
      where: { eventId },
      include: { cocktail: true, drink: true },
      orderBy: [{ barType: 'asc' }, { cocktailId: 'asc' }],
    });
  }

  async findByEventIdAndBarType(eventId: number, barType: BarType): Promise<EventRecipe[]> {
    return this.prisma.eventRecipe.findMany({
      where: { eventId, barType },
      include: { cocktail: true, drink: true },
    });
  }

  async findByEventIdBarTypeAndCocktailId(
    eventId: number,
    barType: BarType,
    cocktailId: number,
  ): Promise<EventRecipe[]> {
    return this.prisma.eventRecipe.findMany({
      where: { eventId, barType, cocktailId },
      include: { drink: true },
    });
  }

  async update(id: number, data: Prisma.EventRecipeUpdateInput): Promise<EventRecipe> {
    return this.prisma.eventRecipe.update({
      where: { id },
      data,
      include: { cocktail: true, drink: true },
    });
  }

  async upsert(
    eventId: number,
    barType: BarType,
    cocktailId: number,
    drinkId: number,
    cocktailPercentage: number,
  ): Promise<EventRecipe> {
    return this.prisma.eventRecipe.upsert({
      where: {
        eventId_barType_cocktailId_drinkId: {
          eventId,
          barType,
          cocktailId,
          drinkId,
        },
      },
      create: { eventId, barType, cocktailId, drinkId, cocktailPercentage },
      update: { cocktailPercentage },
      include: { cocktail: true, drink: true },
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.eventRecipe.delete({
      where: { id },
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
