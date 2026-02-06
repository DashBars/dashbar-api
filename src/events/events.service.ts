import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventsRepository } from './events.repository';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto, UpdateEventDto } from './dto';
import { NotOwnerException } from '../common/exceptions';
import { Event, EventStatus } from '@prisma/client';

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

    // Validate scheduledStartAt is in the future if provided
    if (dto.scheduledStartAt) {
      const scheduledDate = new Date(dto.scheduledStartAt);
      const now = new Date();
      if (scheduledDate <= now) {
        throw new BadRequestException('Scheduled start time must be in the future');
      }
    }

    return this.eventsRepository.create({
      name: dto.name,
      description: dto.description,
      status: EventStatus.upcoming,
      scheduledStartAt: dto.scheduledStartAt ? new Date(dto.scheduledStartAt) : null,
      startedAt: null, // Will be set when event is activated
      finishedAt: null,
      owner: { connect: { id: ownerId } },
      venue: { connect: { id: dto.venueId } },
    });
  }

  /**
   * Update an event (only allowed when status is 'upcoming')
   */
  async update(eventId: number, ownerId: number, dto: UpdateEventDto): Promise<Event> {
    const event = await this.findByIdWithOwner(eventId);

    if (!this.isOwner(event, ownerId)) {
      throw new NotOwnerException();
    }

    // Only allow updates when event is upcoming
    if (event.status !== EventStatus.upcoming) {
      throw new BadRequestException(
        `Cannot update event with status '${event.status}'. Only upcoming events can be updated.`
      );
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
    
    // Update scheduledStartAt (must be in the future)
    if (dto.scheduledStartAt !== undefined) {
      if (dto.scheduledStartAt) {
        const scheduledDate = new Date(dto.scheduledStartAt);
        const now = new Date();
        if (scheduledDate <= now) {
          throw new BadRequestException('Scheduled start time must be in the future');
        }
        updateData.scheduledStartAt = scheduledDate;
      } else {
        updateData.scheduledStartAt = null;
      }
    }
    
    if (dto.venueId !== undefined) {
      updateData.venue = { connect: { id: dto.venueId } };
    }

    return this.eventsRepository.update(eventId, updateData);
  }

  /**
   * Delete an event (only allowed when status is 'upcoming')
   */
  async delete(eventId: number, ownerId: number): Promise<void> {
    const event = await this.findByIdWithOwner(eventId);

    if (!this.isOwner(event, ownerId)) {
      throw new NotOwnerException();
    }

    // Only allow delete when event is upcoming
    if (event.status !== EventStatus.upcoming) {
      throw new BadRequestException(
        `Cannot delete event with status '${event.status}'. Only upcoming events can be deleted. Use archive instead.`
      );
    }

    await this.eventsRepository.delete(eventId);
  }

  /**
   * Start an event (activate)
   * This sets the actual start time, overwriting any scheduled start time
   * Also opens all bars in the event (changes status from closed to open)
   * @deprecated Use activateEvent instead
   */
  async startEvent(eventId: number, ownerId: number): Promise<Event> {
    return this.activateEvent(eventId, ownerId, { barIds: undefined });
  }

  /**
   * Activate an event (set startedAt to current date/time and update status)
   * Also opens selected bars in the event
   */
  async activateEvent(
    eventId: number,
    ownerId: number,
    dto: { barIds?: number[] },
  ): Promise<Event> {
    const event = await this.findByIdWithOwner(eventId);

    if (!this.isOwner(event, ownerId)) {
      throw new NotOwnerException();
    }

    // Only allow activation when event is upcoming
    if (event.status !== EventStatus.upcoming) {
      throw new BadRequestException('Only upcoming events can be activated');
    }

    return this.prisma.$transaction(async (tx) => {
      // Update event status and startedAt
      const updated = await tx.event.update({
        where: { id: eventId },
        data: {
          status: EventStatus.active,
          startedAt: new Date(),
        },
      });

      // Get bars to open (all if barIds not provided)
      const barIds = dto.barIds && dto.barIds.length > 0
        ? dto.barIds
        : (await tx.bar.findMany({
            where: { eventId },
            select: { id: true },
          })).map((b) => b.id);

      // Open selected bars
      if (barIds.length > 0) {
        await tx.bar.updateMany({
          where: { eventId, id: { in: barIds } },
          data: { status: 'open' },
        });
      }

      return updated;
    });
  }

  /**
   * Finish an event (set finishedAt to now and update status)
   * Also closes all bars in the event (changes status to closed)
   */
  async finishEvent(eventId: number, ownerId: number): Promise<Event> {
    const event = await this.findByIdWithOwner(eventId);

    if (!this.isOwner(event, ownerId)) {
      throw new NotOwnerException();
    }

    // Only allow finish when event is active
    if (event.status !== EventStatus.active) {
      throw new BadRequestException(
        `Cannot finish event with status '${event.status}'. Only active events can be finished.`
      );
    }

    // Validate event has been started
    if (event.startedAt === null) {
      throw new BadRequestException('Cannot finish an event that has not been started');
    }

    if (event.finishedAt !== null) {
      throw new BadRequestException('Event has already been finished');
    }

    // Set finishedAt to current date/time and update status
    return this.prisma.$transaction(async (tx) => {
      const updatedEvent = await tx.event.update({
        where: { id: eventId },
        data: {
          status: EventStatus.finished,
          finishedAt: new Date(),
        },
      });

      // Close all bars in the event
      await tx.bar.updateMany({
        where: { eventId },
        data: { status: 'closed' },
      });

      // Get or create return policy
      let returnPolicy = await tx.returnPolicy.findUnique({
        where: { eventId },
      });

      if (!returnPolicy) {
        returnPolicy = await tx.returnPolicy.create({
          data: {
            eventId,
            ownerId,
            autoReturnToGlobal: true,
            requireApproval: false,
          },
        });
      }

      // If autoReturnToGlobal is enabled, create stock returns for remaining stock
      if (returnPolicy.autoReturnToGlobal) {
        // Get all bars in the event
        const bars = await tx.bar.findMany({
          where: { eventId },
          select: { id: true },
        });

        // Get all stock from all bars
        const allStock = await tx.stock.findMany({
          where: { barId: { in: bars.map((b) => b.id) } },
          include: { drink: true, supplier: true },
        });

        // Create stock returns for all stock items in bulk
        if (allStock.length > 0) {
          const returnStatus = returnPolicy.requireApproval ? 'pending' : 'approved';
          const now = new Date();
          await tx.stockReturn.createMany({
            data: allStock.map((stock) => ({
              policyId: returnPolicy.id,
              barId: stock.barId,
              drinkId: stock.drinkId,
              supplierId: stock.supplierId || null,
              quantity: stock.quantity,
              unitCost: stock.unitCost,
              currency: stock.currency,
              ownershipMode: stock.ownershipMode,
              status: returnStatus,
              requestedAt: now,
              requestedById: ownerId,
            })),
          });
        }
      }

      return updatedEvent;
    });
  }

  /**
   * Archive an event (only allowed when status is 'finished')
   */
  async archiveEvent(eventId: number, ownerId: number): Promise<Event> {
    const event = await this.findByIdWithOwner(eventId);

    if (!this.isOwner(event, ownerId)) {
      throw new NotOwnerException();
    }

    // Only allow archive when event is finished
    if (event.status !== EventStatus.finished) {
      throw new BadRequestException(
        `Cannot archive event with status '${event.status}'. Only finished events can be archived.`
      );
    }

    return this.eventsRepository.update(eventId, {
      status: EventStatus.archived,
      archivedAt: new Date(),
    });
  }

  /**
   * Unarchive an event (only allowed when status is 'archived')
   * Returns event back to 'finished' state.
   */
  async unarchiveEvent(eventId: number, ownerId: number): Promise<Event> {
    const event = await this.findByIdWithOwner(eventId);

    if (!this.isOwner(event, ownerId)) {
      throw new NotOwnerException();
    }

    if (event.status !== EventStatus.archived) {
      throw new BadRequestException(
        `Cannot unarchive event with status '${event.status}'. Only archived events can be unarchived.`,
      );
    }

    return this.eventsRepository.update(eventId, {
      status: EventStatus.finished,
      archivedAt: null,
    });
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
   * Get event status (from persisted field, with reconciliation if needed)
   * This method returns the persisted status, but can also calculate it for validation
   */
  getEventStatus(event: Event): EventStatus {
    // Return persisted status (source of truth)
    return event.status;
  }

  /**
   * Calculate event status from dates (for reconciliation)
   */
  calculateEventStatus(event: Event): EventStatus {
    if (event.finishedAt !== null) {
      return EventStatus.finished;
    }
    if (event.archivedAt !== null) {
      return EventStatus.archived;
    }
    if (event.startedAt !== null) {
      const startedAtDate = new Date(event.startedAt);
      const now = new Date();
      // If startedAt is in the past or present, event is active
      if (startedAtDate <= now) {
        return EventStatus.active;
      }
      // If startedAt is in the future, it's still upcoming (scheduled)
      return EventStatus.upcoming;
    }
    return EventStatus.upcoming;
  }
}
