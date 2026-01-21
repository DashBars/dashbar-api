import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Venue, Prisma } from '@prisma/client';

@Injectable()
export class VenuesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.VenueCreateInput): Promise<Venue> {
    return this.prisma.venue.create({ data });
  }

  async findByOwnerId(ownerId: number): Promise<Venue[]> {
    return this.prisma.venue.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: number): Promise<Venue | null> {
    return this.prisma.venue.findUnique({
      where: { id },
    });
  }

  async findByIdAndOwnerId(id: number, ownerId: number): Promise<Venue | null> {
    return this.prisma.venue.findFirst({
      where: { id, ownerId },
    });
  }

  async update(id: number, data: Prisma.VenueUpdateInput): Promise<Venue> {
    return this.prisma.venue.update({
      where: { id },
      data,
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.venue.delete({
      where: { id },
    });
  }
}
