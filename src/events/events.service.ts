import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventsRepository } from './events.repository';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto, UpdateEventDto } from './dto';
import { NotOwnerException } from '../common/exceptions';
import { Event } from '@prisma/client';

@Injectable()
export class EventsService {
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findById(eventId: number): Promise<Event> {
    const event = await this.eventsRepository.findById(eventId);

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    return event;
  }

  async findByIdWithOwner(eventId: number): Promise<Event & { owner: { id: number } }> {
    const event = await this.eventsRepository.findByIdWithOwner(eventId);

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    return event;
  }

  /**
   * List all events for an owner
   */
  async findAllByOwner(ownerId: number): Promise<Event[]> {
    return this.eventsRepository.findAllByOwner(ownerId);
  }

  /**
   * Create a new event
   */
  async create(ownerId: number, dto: CreateEventDto): Promise<Event> {
    // Validate venue exists
    const venue = await this.prisma.venue.findUnique({
      where: { id: dto.venueId },
    });

    if (!venue) {
      throw new NotFoundException(`Venue with ID ${dto.venueId} not found`);
    }

    return this.eventsRepository.create({
      name: dto.name,
      description: dto.description,
      startedAt: dto.startedAt ? new Date(dto.startedAt) : null, // Can be scheduled date or null
      finishedAt: null,
      owner: { connect: { id: ownerId } },
      venue: { connect: { id: dto.venueId } },
    });
  }

  /**
   * Update an event
   */
  async update(eventId: number, ownerId: number, dto: UpdateEventDto): Promise<Event> {
    const event = await this.findByIdWithOwner(eventId);

    if (!this.isOwner(event, ownerId)) {
      throw new NotOwnerException();
    }

    // Validate venue if provided
    if (dto.venueId) {
      const venue = await this.prisma.venue.findUnique({
        where: { id: dto.venueId },
      });

      if (!venue) {
        throw new NotFoundException(`Venue with ID ${dto.venueId} not found`);
      }
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    // Only allow updating startedAt if event hasn't been manually started yet
    // (i.e., if startedAt is null or in the future, it's still a scheduled date)
    if (dto.startedAt !== undefined) {
      const event = await this.findByIdWithOwner(eventId);
      const now = new Date();
      const currentStartedAt = event.startedAt ? new Date(event.startedAt) : null;
      
      // Only allow update if event hasn't been manually started (startedAt is null or future)
      if (!currentStartedAt || currentStartedAt > now) {
        updateData.startedAt = dto.startedAt ? new Date(dto.startedAt) : null;
      } else {
        throw new BadRequestException('Cannot update scheduled start time for an event that has already started');
      }
    }
    if (dto.venueId !== undefined) {
      updateData.venue = { connect: { id: dto.venueId } };
    }

    return this.eventsRepository.update(eventId, updateData);
  }

  /**
   * Delete an event
   */
  async delete(eventId: number, ownerId: number): Promise<void> {
    const event = await this.findByIdWithOwner(eventId);

    if (!this.isOwner(event, ownerId)) {
      throw new NotOwnerException();
    }

    await this.eventsRepository.delete(eventId);
  }

  /**
   * Start an event (overwrite startedAt with current date/time)
   * This sets the actual start time, overwriting any scheduled start time
   * Also opens all bars in the event (changes status from closed to open)
   */
  async startEvent(eventId: number, ownerId: number): Promise<Event> {
    const event = await this.findByIdWithOwner(eventId);

    if (!this.isOwner(event, ownerId)) {
      throw new NotOwnerException();
    }

    // Validate event can be started
    // Check if event is already active (startedAt exists and is in the past)
    if (event.startedAt !== null) {
      const startedAtDate = new Date(event.startedAt);
      const now = new Date();
      if (startedAtDate <= now) {
        throw new BadRequestException('Event has already been started');
      }
    }

    if (event.finishedAt !== null) {
      throw new BadRequestException('Cannot start an event that has already been finished');
    }

    // Overwrite startedAt with current date/time (actual start)
    const updatedEvent = await this.eventsRepository.startEvent(eventId);

    // Open all bars in the event (change status from closed to open)
    // This is done in a transaction to ensure consistency
    await this.prisma.$transaction(async (tx) => {
      await tx.bar.updateMany({
        where: { eventId, status: 'closed' },
        data: { status: 'open' },
      });
    });

    return updatedEvent;
  }

  /**
   * Finish an event (set finishedAt to now)
   * Also closes all bars in the event (changes status to closed)
   */
  async finishEvent(eventId: number, ownerId: number): Promise<Event> {
    const event = await this.findByIdWithOwner(eventId);

    if (!this.isOwner(event, ownerId)) {
      throw new NotOwnerException();
    }

    // Validate event can be finished
    if (event.startedAt === null) {
      throw new BadRequestException('Cannot finish an event that has not been started');
    }

    if (event.finishedAt !== null) {
      throw new BadRequestException('Event has already been finished');
    }

    // Set finishedAt to current date/time
    const updatedEvent = await this.eventsRepository.finishEvent(eventId);

    // Close all bars in the event (change status to closed)
    // This is done in a transaction to ensure consistency
    await this.prisma.$transaction(async (tx) => {
      await tx.bar.updateMany({
        where: { eventId },
        data: { status: 'closed' },
      });
    });

    return updatedEvent;
  }

  /**
   * Check if the event has started based on the canonical start timestamp
   */
  hasEventStarted(event: Event): boolean {
    if (!event.startedAt) {
      return false;
    }
    return new Date() >= new Date(event.startedAt);
  }

  /**
   * Check if the event has finished
   */
  hasEventFinished(event: Event): boolean {
    return event.finishedAt ? new Date() >= new Date(event.finishedAt) : false;
  }

  /**
   * Check if the user is the owner of the event
   */
  isOwner(event: Event, userId: number): boolean {
    return event.ownerId === userId;
  }

  /**
   * Get event status
   * UPCOMING: startedAt == null OR startedAt is in the future (scheduled but not started)
   * ACTIVE: startedAt != null AND startedAt is in the past/present AND finishedAt == null
   * FINISHED: finishedAt != null
   */
  getEventStatus(event: Event): 'upcoming' | 'active' | 'finished' {
    if (event.finishedAt !== null) {
      return 'finished';
    }
    if (event.startedAt !== null) {
      const startedAtDate = new Date(event.startedAt);
      const now = new Date();
      // If startedAt is in the past or present, event is active
      if (startedAtDate <= now) {
        return 'active';
      }
      // If startedAt is in the future, it's still upcoming (scheduled)
      return 'upcoming';
    }
    return 'upcoming';
  }
}
