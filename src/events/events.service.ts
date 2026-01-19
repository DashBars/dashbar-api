import { Injectable, NotFoundException } from '@nestjs/common';
import { EventsRepository } from './events.repository';
import { Event } from '@prisma/client';

@Injectable()
export class EventsService {
  constructor(private readonly eventsRepository: EventsRepository) {}

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
   * Check if the event has started based on the canonical start timestamp
   */
  hasEventStarted(event: Event): boolean {
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
   */
  getEventStatus(event: Event): 'upcoming' | 'ongoing' | 'finished' {
    if (this.hasEventFinished(event)) {
      return 'finished';
    }
    if (this.hasEventStarted(event)) {
      return 'ongoing';
    }
    return 'upcoming';
  }
}
