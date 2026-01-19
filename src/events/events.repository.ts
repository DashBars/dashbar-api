import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Event } from '@prisma/client';

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<Event | null> {
    return this.prisma.event.findUnique({
      where: { id },
    });
  }

  async findByIdWithOwner(id: number): Promise<(Event & { owner: { id: number } }) | null> {
    return this.prisma.event.findUnique({
      where: { id },
      include: { owner: { select: { id: true } } },
    });
  }

  async findByIdWithRelations(id: number): Promise<Event | null> {
    return this.prisma.event.findUnique({
      where: { id },
      include: {
        owner: true,
        venue: true,
        bars: true,
        eventRecipes: true,
        eventPrices: true,
      },
    });
  }
}
