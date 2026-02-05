import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventRecipe, BarType, Prisma } from '@prisma/client';

export interface EventRecipeWithRelations extends EventRecipe {
  barTypes: { barType: BarType }[];
  components: Array<{
    id: number;
    drinkId: number;
    percentage: number;
    drink?: {
      id: number;
      name: string;
      brand: string;
    };
  }>;
}

@Injectable()
export class RecipesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    eventId: number;
    cocktailName: string;
    glassVolume: number;
    hasIce: boolean;
    barTypes: BarType[];
    components: Array<{ drinkId: number; percentage: number }>;
  }): Promise<EventRecipeWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      // Create or find cocktail in catalog
      let cocktail = await tx.cocktail.findFirst({
        where: {
          name: {
            equals: data.cocktailName,
            mode: 'insensitive', // Case-insensitive search
          },
        },
      });

      if (!cocktail) {
        // Create new cocktail in catalog with default price
        cocktail = await tx.cocktail.create({
          data: {
            name: data.cocktailName,
            price: 0, // Default price, should be set via EventPrice
            volume: data.glassVolume,
            isActive: true,
          },
        });
      }

      // Create main recipe
      const recipe = await tx.eventRecipe.create({
        data: {
          eventId: data.eventId,
          cocktailName: data.cocktailName,
          glassVolume: data.glassVolume,
          hasIce: data.hasIce,
        },
      });

      // Create bar type relations
      if (data.barTypes.length > 0) {
        await tx.eventRecipeBarType.createMany({
          data: data.barTypes.map((barType) => ({
            eventRecipeId: recipe.id,
            barType,
          })),
        });
      }

      // Create component relations
      if (data.components.length > 0) {
        await tx.eventRecipeComponent.createMany({
          data: data.components.map((component) => ({
            eventRecipeId: recipe.id,
            drinkId: component.drinkId,
            percentage: component.percentage,
          })),
        });
      }

      // Return with relations
      return this.findById(recipe.id) as Promise<EventRecipeWithRelations>;
    });
  }

  async findById(id: number): Promise<EventRecipeWithRelations | null> {
    const recipe = await this.prisma.eventRecipe.findUnique({
      where: { id },
      include: {
        barTypes: {
          select: { barType: true },
        },
        components: {
          include: {
            drink: {
              select: {
                id: true,
                name: true,
                brand: true,
              },
            },
          },
        },
      },
    });

    if (!recipe) {
      return null;
    }

    return {
      ...recipe,
      barTypes: recipe.barTypes.map((bt) => ({ barType: bt.barType })),
      components: recipe.components.map((c) => ({
        id: c.id,
        drinkId: c.drinkId,
        percentage: c.percentage,
        drink: c.drink,
      })),
    } as EventRecipeWithRelations;
  }

  async findByEventIdAndRecipeId(
    eventId: number,
    recipeId: number,
  ): Promise<EventRecipeWithRelations | null> {
    const recipe = await this.prisma.eventRecipe.findFirst({
      where: { id: recipeId, eventId },
      include: {
        barTypes: {
          select: { barType: true },
        },
        components: {
          include: {
            drink: {
              select: {
                id: true,
                name: true,
                brand: true,
              },
            },
          },
        },
      },
    });

    if (!recipe) {
      return null;
    }

    return {
      ...recipe,
      barTypes: recipe.barTypes.map((bt) => ({ barType: bt.barType })),
      components: recipe.components.map((c) => ({
        id: c.id,
        drinkId: c.drinkId,
        percentage: c.percentage,
        drink: c.drink,
      })),
    } as EventRecipeWithRelations;
  }

  async findByEventId(eventId: number): Promise<EventRecipeWithRelations[]> {
    const recipes = await this.prisma.eventRecipe.findMany({
      where: { eventId },
      include: {
        barTypes: {
          select: { barType: true },
        },
        components: {
          include: {
            drink: {
              select: {
                id: true,
                name: true,
                brand: true,
              },
            },
          },
        },
      },
      orderBy: { cocktailName: 'asc' },
    });

    return recipes.map((recipe) => ({
      ...recipe,
      barTypes: recipe.barTypes.map((bt) => ({ barType: bt.barType })),
      components: recipe.components.map((c) => ({
        id: c.id,
        drinkId: c.drinkId,
        percentage: c.percentage,
        drink: c.drink,
      })),
    })) as EventRecipeWithRelations[];
  }

  async findByEventIdAndBarType(
    eventId: number,
    barType: BarType,
  ): Promise<EventRecipeWithRelations[]> {
    const recipes = await this.prisma.eventRecipe.findMany({
      where: {
        eventId,
        barTypes: {
          some: {
            barType,
          },
        },
      },
      include: {
        barTypes: {
          select: { barType: true },
        },
        components: {
          include: {
            drink: {
              select: {
                id: true,
                name: true,
                brand: true,
              },
            },
          },
        },
      },
      orderBy: { cocktailName: 'asc' },
    });

    return recipes.map((recipe) => ({
      ...recipe,
      barTypes: recipe.barTypes.map((bt) => ({ barType: bt.barType })),
      components: recipe.components.map((c) => ({
        id: c.id,
        drinkId: c.drinkId,
        percentage: c.percentage,
        drink: c.drink,
      })),
    })) as EventRecipeWithRelations[];
  }

  async findByEventIdBarTypeAndCocktailName(
    eventId: number,
    barType: BarType,
    cocktailName: string,
  ): Promise<EventRecipeWithRelations[]> {
    const recipes = await this.prisma.eventRecipe.findMany({
      where: {
        eventId,
        cocktailName,
        barTypes: {
          some: {
            barType,
          },
        },
      },
      include: {
        barTypes: {
          select: { barType: true },
        },
        components: {
          include: {
            drink: {
              select: {
                id: true,
                name: true,
                brand: true,
              },
            },
          },
        },
      },
    });

    return recipes.map((recipe) => ({
      ...recipe,
      barTypes: recipe.barTypes.map((bt) => ({ barType: bt.barType })),
      components: recipe.components.map((c) => ({
        id: c.id,
        drinkId: c.drinkId,
        percentage: c.percentage,
        drink: c.drink,
      })),
    })) as EventRecipeWithRelations[];
  }

  async update(
    id: number,
    data: {
        cocktailName?: string;
        glassVolume?: number;
        hasIce?: boolean;
        barTypes?: BarType[];
        components?: Array<{ drinkId: number; percentage: number }>;
    },
  ): Promise<EventRecipeWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      // Update main recipe fields
      const updateData: Prisma.EventRecipeUpdateInput = {};
      if (data.cocktailName !== undefined) updateData.cocktailName = data.cocktailName;
      if (data.glassVolume !== undefined) updateData.glassVolume = data.glassVolume;
      if (data.hasIce !== undefined) updateData.hasIce = data.hasIce;

      if (Object.keys(updateData).length > 0) {
        await tx.eventRecipe.update({
          where: { id },
          data: updateData,
        });
      }

      // Update bar types if provided
      if (data.barTypes !== undefined) {
        await tx.eventRecipeBarType.deleteMany({
          where: { eventRecipeId: id },
        });
        if (data.barTypes.length > 0) {
          await tx.eventRecipeBarType.createMany({
            data: data.barTypes.map((barType) => ({
              eventRecipeId: id,
              barType,
            })),
          });
        }
      }

      // Update components if provided
      if (data.components !== undefined) {
        await tx.eventRecipeComponent.deleteMany({
          where: { eventRecipeId: id },
        });
        if (data.components.length > 0) {
          await tx.eventRecipeComponent.createMany({
            data: data.components.map((component) => ({
              eventRecipeId: id,
              drinkId: component.drinkId,
              percentage: component.percentage,
            })),
          });
        }
      }

      // Return updated recipe with relations
      return this.findById(id) as Promise<EventRecipeWithRelations>;
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

  async findCocktailByName(cocktailName: string) {
    return this.prisma.cocktail.findFirst({
      where: { name: cocktailName },
    });
  }

  async findDrinkById(drinkId: number) {
    return this.prisma.drink.findUnique({
      where: { id: drinkId },
    });
  }
}
