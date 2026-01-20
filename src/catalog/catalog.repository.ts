import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all active categories with their cocktails for an event
   */
  async getCategoriesWithCocktails(eventId: number) {
    return this.prisma.category.findMany({
      where: {
        eventId,
        isActive: true,
      },
      include: {
        cocktails: {
          include: {
            cocktail: true,
          },
          orderBy: { sortIndex: 'asc' },
        },
      },
      orderBy: { sortIndex: 'asc' },
    });
  }

  /**
   * Get all event prices for cocktails
   */
  async getEventPrices(eventId: number) {
    return this.prisma.eventPrice.findMany({
      where: { eventId },
    });
  }

  /**
   * Get all active cocktails
   */
  async getActiveCocktails() {
    return this.prisma.cocktail.findMany({
      where: { isActive: true },
    });
  }

  /**
   * Get cocktails that are not in any category for this event
   */
  async getUncategorizedCocktails(eventId: number) {
    // Get all cocktail IDs in categories for this event
    const categorizedCocktails = await this.prisma.cocktailCategory.findMany({
      where: {
        category: {
          eventId,
          isActive: true,
        },
      },
      select: { cocktailId: true },
    });

    const categorizedIds = categorizedCocktails.map((c) => c.cocktailId);

    // Get all active cocktails not in any category
    return this.prisma.cocktail.findMany({
      where: {
        isActive: true,
        id: categorizedIds.length > 0 ? { notIn: categorizedIds } : undefined,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get event by ID
   */
  async getEventById(eventId: number) {
    return this.prisma.event.findUnique({
      where: { id: eventId },
    });
  }
}
