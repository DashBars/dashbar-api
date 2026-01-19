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

  async findByEventId(eventId: number): Promise<EventPrice[]> {
    return this.prisma.eventPrice.findMany({
      where: { eventId },
      include: { cocktail: true },
      orderBy: { cocktailId: 'asc' },
    });
  }

  async findByEventIdAndCocktailId(eventId: number, cocktailId: number): Promise<EventPrice | null> {
    return this.prisma.eventPrice.findUnique({
      where: {
        eventId_cocktailId: { eventId, cocktailId },
      },
      include: { cocktail: true },
    });
  }

  async upsert(eventId: number, cocktailId: number, price: number): Promise<EventPrice> {
    return this.prisma.eventPrice.upsert({
      where: {
        eventId_cocktailId: { eventId, cocktailId },
      },
      create: { eventId, cocktailId, price },
      update: { price },
      include: { cocktail: true },
    });
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
