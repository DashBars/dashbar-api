import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/** Drink with association counts for dependency checks */
export type DrinkWithCounts = Prisma.DrinkGetPayload<{
  include: { _count: { select: { globalInventories: true; stocks: true; eventRecipeComponents: true; inventoryMovements: true } } };
}>;

const DRINK_INCLUDE = {
  _count: {
    select: {
      globalInventories: true,
      stocks: true,
      eventRecipeComponents: true,
      inventoryMovements: true,
    },
  },
} as const;

@Injectable()
export class DrinksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<DrinkWithCounts[]> {
    return this.prisma.drink.findMany({
      orderBy: { name: 'asc' },
      include: DRINK_INCLUDE,
    });
  }

  async search(query: string): Promise<DrinkWithCounts[]> {
    return this.prisma.drink.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { brand: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      include: DRINK_INCLUDE,
    });
  }

  async findById(id: number): Promise<DrinkWithCounts | null> {
    return this.prisma.drink.findUnique({
      where: { id },
      include: DRINK_INCLUDE,
    });
  }

  async create(data: Prisma.DrinkCreateInput): Promise<DrinkWithCounts> {
    return this.prisma.drink.create({ data, include: DRINK_INCLUDE });
  }

  async update(id: number, data: Prisma.DrinkUpdateInput): Promise<DrinkWithCounts> {
    return this.prisma.drink.update({
      where: { id },
      data,
      include: DRINK_INCLUDE,
    });
  }

  /** Check if a drink has any associations that depend on its volume/type */
  async hasAssociations(id: number): Promise<boolean> {
    const counts = await this.prisma.drink.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            globalInventories: true,
            stocks: true,
            eventRecipeComponents: true,
            inventoryMovements: true,
            managerInventories: true,
            stockReturns: true,
            transfers: true,
          },
        },
      },
    });
    if (!counts) return false;
    const c = counts._count;
    return (
      c.globalInventories > 0 ||
      c.stocks > 0 ||
      c.eventRecipeComponents > 0 ||
      c.inventoryMovements > 0 ||
      c.managerInventories > 0 ||
      c.stockReturns > 0 ||
      c.transfers > 0
    );
  }

  async delete(id: number): Promise<void> {
    await this.prisma.drink.delete({
      where: { id },
    });
  }
}
