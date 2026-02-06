import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventProduct, Prisma } from '@prisma/client';

export interface EventProductWithCocktails extends EventProduct {
  cocktails: Array<{
    cocktailId: number;
    cocktail: {
      id: number;
      name: string;
      price: number;
    };
  }>;
}

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<EventProductWithCocktails | null> {
    return this.prisma.eventProduct.findUnique({
      where: { id },
      include: {
        cocktails: {
          include: {
            cocktail: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
          },
        },
      },
    }) as Promise<EventProductWithCocktails | null>;
  }

  async findByEventIdAndProductId(
    eventId: number,
    productId: number,
  ): Promise<EventProductWithCocktails | null> {
    return this.prisma.eventProduct.findFirst({
      where: { id: productId, eventId },
      include: {
        cocktails: {
          include: {
            cocktail: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
          },
        },
      },
    }) as Promise<EventProductWithCocktails | null>;
  }

  async findByEventId(eventId: number): Promise<EventProductWithCocktails[]> {
    return this.prisma.eventProduct.findMany({
      where: { eventId, barId: null },
      include: {
        cocktails: {
          include: {
            cocktail: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }) as Promise<EventProductWithCocktails[]>;
  }

  /**
   * Get products available at a specific bar.
   * Returns bar-specific products + event-wide products filtered by bar type recipes.
   * Event-wide products without any recipe are included (direct sale items).
   * Event-wide products with a recipe NOT assigned to this bar type are excluded.
   */
  async findByEventIdAndBarId(
    eventId: number,
    barId: number,
  ): Promise<EventProductWithCocktails[]> {
    const include = {
      cocktails: {
        include: {
          cocktail: {
            select: { id: true, name: true, price: true },
          },
        },
      },
    };

    // Get bar type
    const bar = await this.prisma.bar.findUnique({
      where: { id: barId },
      select: { type: true },
    });
    if (!bar) return [];

    // Get recipe names allowed for this bar type
    const recipesForBarType = await this.prisma.eventRecipe.findMany({
      where: { eventId, barTypes: { some: { barType: bar.type as any } } },
      select: { cocktailName: true },
    });
    const allowedNames = new Set(recipesForBarType.map(r => r.cocktailName.toLowerCase()));

    // Get ALL recipe names in the event (to distinguish "no recipe" from "recipe for other bar type")
    const allRecipes = await this.prisma.eventRecipe.findMany({
      where: { eventId },
      select: { cocktailName: true },
    });
    const allRecipeNames = new Set(allRecipes.map(r => r.cocktailName.toLowerCase()));

    // Bar-specific products (always included)
    const barProducts = await this.prisma.eventProduct.findMany({
      where: { eventId, barId },
      include,
      orderBy: { name: 'asc' },
    }) as EventProductWithCocktails[];

    // Event-wide products (barId is null)
    const barProductNames = barProducts.map(p => p.name);
    const eventWideProducts = await this.prisma.eventProduct.findMany({
      where: {
        eventId,
        barId: null,
        ...(barProductNames.length > 0 ? { name: { notIn: barProductNames } } : {}),
      },
      include,
      orderBy: { name: 'asc' },
    }) as EventProductWithCocktails[];

    // Filter event-wide: include if no recipe exists OR recipe is for this bar type
    const filteredEventWide = eventWideProducts.filter(p => {
      const nameLower = p.name.toLowerCase();
      const hasAnyRecipe = allRecipeNames.has(nameLower);
      if (!hasAnyRecipe) return true; // direct sale item
      return allowedNames.has(nameLower); // only if recipe assigned to this bar type
    });

    return [...barProducts, ...filteredEventWide].sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(data: {
    eventId: number;
    barId?: number | null;
    name: string;
    price: number;
    cocktailIds: number[];
  }): Promise<EventProductWithCocktails> {
    const isCombo = data.cocktailIds.length > 1;

    const product = await this.prisma.eventProduct.create({
      data: {
        eventId: data.eventId,
        barId: data.barId ?? null,
        name: data.name,
        price: data.price,
        isCombo,
        cocktails: {
          create: data.cocktailIds.map((cocktailId) => ({
            cocktailId,
          })),
        },
      },
      include: {
        cocktails: {
          include: {
            cocktail: {
              select: {
                id: true,
                name: true,
                price: true,
              },
            },
          },
        },
      },
    });

    return product as EventProductWithCocktails;
  }

  async update(
    id: number,
    data: {
      name?: string;
      price?: number;
      cocktailIds?: number[];
    },
  ): Promise<EventProductWithCocktails> {
    return this.prisma.$transaction(async (tx) => {
      const updateData: Prisma.EventProductUpdateInput = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.price !== undefined) updateData.price = data.price;

      // Update cocktails if provided
      if (data.cocktailIds !== undefined) {
        // Remove old cocktail relations
        await tx.eventProductCocktail.deleteMany({
          where: { eventProductId: id },
        });

        // Create new cocktail relations
        if (data.cocktailIds.length > 0) {
          await tx.eventProductCocktail.createMany({
            data: data.cocktailIds.map((cocktailId) => ({
              eventProductId: id,
              cocktailId,
            })),
          });
        }

        // Update isCombo flag
        updateData.isCombo = data.cocktailIds.length > 1;
      }

      if (Object.keys(updateData).length > 0) {
        await tx.eventProduct.update({
          where: { id },
          data: updateData,
        });
      }

      return this.findById(id) as Promise<EventProductWithCocktails>;
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.eventProduct.delete({
      where: { id },
    });
  }

  async findCocktailById(id: number) {
    return this.prisma.cocktail.findUnique({
      where: { id },
    });
  }

  /** Find all products for an event with the given name (event-level and per-bar). Used to sync with recipe "producto final". */
  async findByEventIdAndName(eventId: number, name: string): Promise<EventProductWithCocktails[]> {
    return this.prisma.eventProduct.findMany({
      where: { eventId, name },
      include: {
        cocktails: {
          include: {
            cocktail: {
              select: { id: true, name: true, price: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }) as Promise<EventProductWithCocktails[]>;
  }

  async deleteManyByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.eventProduct.deleteMany({
      where: { id: { in: ids } },
    });
  }

  /**
   * Get products available for a specific bar.
   * Returns bar-specific products OR event-wide products if no bar-specific exists.
   * This handles the "producto final" flow where recipes create both event-wide and bar-specific products.
   */
  async findProductsForBar(eventId: number, barId: number): Promise<EventProductWithCocktails[]> {
    // Get bar-specific products
    const barProducts = await this.prisma.eventProduct.findMany({
      where: { eventId, barId },
      include: {
        cocktails: {
          include: {
            cocktail: {
              select: { id: true, name: true, price: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Get event-wide products that don't have a bar-specific version
    const barProductNames = barProducts.map(p => p.name);
    
    const eventWideProducts = await this.prisma.eventProduct.findMany({
      where: { 
        eventId, 
        barId: null,
        // Exclude products that have a bar-specific override
        name: barProductNames.length > 0 ? { notIn: barProductNames } : undefined,
      },
      include: {
        cocktails: {
          include: {
            cocktail: {
              select: { id: true, name: true, price: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Combine and sort
    return [...barProducts, ...eventWideProducts].sort((a, b) => 
      a.name.localeCompare(b.name)
    ) as EventProductWithCocktails[];
  }
}
