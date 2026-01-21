import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { VenuesRepository } from './venues.repository';
import { CreateVenueDto, UpdateVenueDto } from './dto';
import { Venue } from '@prisma/client';

@Injectable()
export class VenuesService {
  constructor(private readonly venuesRepository: VenuesRepository) {}

  /**
   * Create a new venue for the current user (manager)
   */
  async create(userId: number, dto: CreateVenueDto): Promise<Venue> {
    return this.venuesRepository.create({
      name: dto.name,
      description: dto.description,
      address: dto.address,
      city: dto.city,
      country: dto.country,
      capacity: dto.capacity,
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
   * Delete a venue
   */
  async delete(venueId: number, userId: number): Promise<void> {
    await this.findOne(venueId, userId); // Ensures exists and belongs to user

    try {
      await this.venuesRepository.delete(venueId);
    } catch (error: any) {
      // Check if it's a foreign key constraint error
      if (error.code === 'P2003' || error.meta?.field_name?.includes('venueId')) {
        throw new BadRequestException(
          'Cannot delete venue because it has associated events. Please remove or reassign events first.',
        );
      }
      throw error;
    }
  }
}
