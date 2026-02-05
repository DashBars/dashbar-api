import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventPrice, Prisma } from '@prisma/client';

@Injectable()
export class PricesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<EventPrice | null> {
    return this.prisma.eventPrice.findUnique({
      where: { id },
      include: { cocktail: true },
    });
  }

  async findByEventIdAndPriceId(eventId: number, priceId: number): Promise<EventPrice | null> {
    return this.prisma.eventPrice.findFirst({
      where: { id: priceId, eventId },
      include: { cocktail: true },
    });
  }

  /** Event-level prices only (barId null) */
  async findByEventId(eventId: number): Promise<EventPrice[]> {
    return this.prisma.eventPrice.findMany({
      where: { eventId, barId: null },
      include: { cocktail: true },
      orderBy: { cocktailId: 'asc' },
    });
  }

  /** Bar-level price overrides for a given bar */
  async findByEventIdAndBarId(eventId: number, barId: number): Promise<EventPrice[]> {
    return this.prisma.eventPrice.findMany({
      where: { eventId, barId },
      include: { cocktail: true },
      orderBy: { cocktailId: 'asc' },
    });
  }

  /** All prices for event (event-level + all bar overrides), for catalog resolution */
  async findAllPricesForCatalog(eventId: number, barId?: number): Promise<EventPrice[]> {
    const where: { eventId: number; barId?: number | null } = { eventId };
    if (barId !== undefined) {
      return this.prisma.eventPrice.findMany({
        where: { eventId, OR: [{ barId: null }, { barId }] },
        include: { cocktail: true },
      });
    }
    return this.prisma.eventPrice.findMany({
      where: { eventId },
      include: { cocktail: true },
    });
  }

  async findByEventIdAndCocktailId(
    eventId: number,
    cocktailId: number,
    barId?: number | null,
  ): Promise<EventPrice | null> {
    const barIdValue = barId ?? null;
    
    // Use findFirst instead of findUnique for nullable barId
    if (barIdValue === null) {
      return this.prisma.eventPrice.findFirst({
        where: { eventId, cocktailId, barId: null },
        include: { cocktail: true },
      });
    }
    
    return this.prisma.eventPrice.findUnique({
      where: {
        eventId_cocktailId_barId: { eventId, cocktailId, barId: barIdValue },
      },
      include: { cocktail: true },
    });
  }

  async upsert(
    eventId: number,
    cocktailId: number,
    price: number,
    barId?: number | null,
  ): Promise<EventPrice> {
    const barIdValue = barId ?? null;

    // For non-null barId, use native upsert (works with composite unique constraint)
    if (barIdValue !== null) {
      return this.prisma.eventPrice.upsert({
        where: {
          eventId_cocktailId_barId: { eventId, cocktailId, barId: barIdValue },
        },
        create: { eventId, cocktailId, barId: barIdValue, price },
        update: { price },
        include: { cocktail: true },
      });
    }

    // For null barId, manually implement upsert logic since Prisma doesn't support
    // native upsert with nullable composite keys and PostgreSQL ON CONFLICT doesn't
    // work well with partial unique indexes
    
    // Try UPDATE first
    const updated = await this.prisma.$executeRaw`
      UPDATE "event_price"
      SET "price" = ${price}
      WHERE "event_id" = ${eventId}
        AND "cocktail_id" = ${cocktailId}
        AND "bar_id" IS NULL
    `;

    if (updated > 0) {
      // Record was updated, fetch and return it
      const result = await this.prisma.eventPrice.findFirst({
        where: { eventId, cocktailId, barId: null },
        include: { cocktail: true },
      });
      if (!result) {
        throw new Error('Failed to fetch updated event price');
      }
      return result;
    }

    // No record existed, try INSERT
    try {
      return await this.prisma.eventPrice.create({
        data: { eventId, cocktailId, barId: null, price },
        include: { cocktail: true },
      });
    } catch (error: any) {
      // Race condition: another request inserted between our UPDATE and INSERT
      // Fetch the existing record
      if (error.code === 'P2002') {
        const result = await this.prisma.eventPrice.findFirst({
          where: { eventId, cocktailId, barId: null },
          include: { cocktail: true },
        });
        if (result) {
          // Update it with our price
          return this.prisma.eventPrice.update({
            where: { id: result.id },
            data: { price },
            include: { cocktail: true },
          });
        }
      }
      throw error;
    }
  }

  async update(id: number, price: number): Promise<EventPrice> {
    return this.prisma.eventPrice.update({
      where: { id },
      data: { price },
      include: { cocktail: true },
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.eventPrice.delete({
      where: { id },
    });
  }

  async findCocktailById(cocktailId: number) {
    return this.prisma.cocktail.findUnique({
      where: { id: cocktailId },
    });
  }
}
