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

  async findByEventIdAndBarId(
    eventId: number,
    barId: number,
  ): Promise<EventProductWithCocktails[]> {
    return this.prisma.eventProduct.findMany({
      where: { eventId, barId },
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
}
