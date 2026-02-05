import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { VenuesRepository } from './venues.repository';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVenueDto, UpdateVenueDto } from './dto';
import { Venue, EventStatus } from '@prisma/client';

@Injectable()
export class VenuesService {
  constructor(
    private readonly venuesRepository: VenuesRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create a new venue for the current user (manager)
   */
  async create(userId: number, dto: CreateVenueDto): Promise<Venue> {
    return this.venuesRepository.create({
      name: dto.name,
      address: dto.address,
      addressLine2: dto.addressLine2,
      city: dto.city,
      state: dto.state,
      country: dto.country,
      postalCode: dto.postalCode,
      capacity: dto.capacity,
      venueType: dto.venueType || 'nose',
      placeId: dto.placeId,
      lat: dto.lat,
      lng: dto.lng,
      formattedAddress: dto.formattedAddress,
      owner: { connect: { id: userId } },
    });
  }

  /**
   * List all venues for the current user (manager)
   */
  async findAllByOwner(userId: number): Promise<Venue[]> {
    return this.venuesRepository.findByOwnerId(userId);
  }

  /**
   * Find a specific venue by ID, ensuring owner isolation
   */
  async findOne(venueId: number, userId: number): Promise<Venue> {
    const venue = await this.venuesRepository.findByIdAndOwnerId(venueId, userId);

    if (!venue) {
      throw new NotFoundException(`Venue with ID ${venueId} not found`);
    }

    return venue;
  }

  /**
   * Update a venue
   */
  async update(venueId: number, userId: number, dto: UpdateVenueDto): Promise<Venue> {
    await this.findOne(venueId, userId); // Ensures exists and belongs to user

    return this.venuesRepository.update(venueId, dto);
  }

  /**
   * Delete a venue (only if it has no events, or only upcoming events)
   */
  async delete(venueId: number, userId: number): Promise<void> {
    const venue = await this.findOne(venueId, userId); // Ensures exists and belongs to user

    // Check for events assigned to this venue
    const events = await this.prisma.event.findMany({
      where: { venueId },
      select: { id: true, name: true, status: true },
    });

    if (events.length > 0) {
      const upcomingEvents = events.filter((e) => e.status === EventStatus.upcoming);
      const nonUpcomingEvents = events.filter((e) => e.status !== EventStatus.upcoming);

      if (nonUpcomingEvents.length > 0) {
        throw new BadRequestException(
          `Cannot delete venue: ${nonUpcomingEvents.length} event(s) are not upcoming. ` +
            `Delete or archive those events first.`,
        );
      }

      if (upcomingEvents.length > 0) {
        throw new BadRequestException(
          `Cannot delete venue: ${upcomingEvents.length} upcoming event(s) assigned. ` +
            `Delete those events first.`,
        );
      }
    }

    await this.venuesRepository.delete(venueId);
  }
}
