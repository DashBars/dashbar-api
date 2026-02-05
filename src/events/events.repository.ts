import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Event, Prisma } from '@prisma/client';

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

  async findAllByOwner(ownerId: number): Promise<Event[]> {
    return this.prisma.event.findMany({
      where: { ownerId },
      include: {
        venue: true,
      },
      orderBy: { id: 'desc' },
    });
  }

  async create(data: Prisma.EventCreateInput): Promise<Event> {
    return this.prisma.event.create({ data });
  }

  async update(id: number, data: Prisma.EventUpdateInput): Promise<Event> {
    return this.prisma.event.update({
      where: { id },
      data,
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.event.delete({
      where: { id },
    });
  }

  async startEvent(id: number): Promise<Event> {
    return this.prisma.event.update({
      where: { id },
      data: {
        status: 'active',
        startedAt: new Date(),
      },
    });
  }

  async finishEvent(id: number): Promise<Event> {
    return this.prisma.event.update({
      where: { id },
      data: {
        status: 'finished',
        finishedAt: new Date(),
      },
    });
  }
}
