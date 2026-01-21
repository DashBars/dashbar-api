import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Bar, BarType, BarStatus, Prisma } from '@prisma/client';

@Injectable()
export class BarsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.BarCreateInput): Promise<Bar> {
    return this.prisma.bar.create({ data });
  }

  async findById(id: number): Promise<Bar | null> {
    return this.prisma.bar.findUnique({
      where: { id },
    });
  }

  async findByIdWithRelations(id: number): Promise<Bar | null> {
    return this.prisma.bar.findUnique({
      where: { id },
      include: {
        stocks: { include: { drink: true } },
        posnets: true,
      },
    });
  }

  async findByEventId(eventId: number): Promise<Bar[]> {
    return this.prisma.bar.findMany({
      where: { eventId },
      include: {
        stocks: { include: { drink: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  async findByEventIdAndBarId(eventId: number, barId: number): Promise<Bar | null> {
    return this.prisma.bar.findFirst({
      where: { id: barId, eventId },
      include: {
        stocks: { include: { drink: true } },
        posnets: true,
      },
    });
  }

  async findByEventIdAndType(eventId: number, type: BarType): Promise<Bar[]> {
    return this.prisma.bar.findMany({
      where: { eventId, type },
    });
  }

  async findDistinctTypesByEventId(eventId: number): Promise<BarType[]> {
    const bars = await this.prisma.bar.findMany({
      where: { eventId },
      select: { type: true },
      distinct: ['type'],
    });
    return bars.map((b) => b.type);
  }

  async update(id: number, data: Prisma.BarUpdateInput): Promise<Bar> {
    return this.prisma.bar.update({
      where: { id },
      data,
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.bar.delete({
      where: { id },
    });
  }

  /**
   * Update all bars in an event to a specific status
   */
  async updateAllBarsInEvent(eventId: number, status: BarStatus): Promise<{ count: number }> {
    return this.prisma.bar.updateMany({
      where: { eventId },
      data: { status },
    });
  }
}
