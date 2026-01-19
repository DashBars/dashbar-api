import { Injectable, NotFoundException } from '@nestjs/common';
import { BarsRepository } from './bars.repository';
import { EventsService } from '../events/events.service';
import { CreateBarDto, UpdateBarDto } from './dto';
import { NotOwnerException } from '../common/exceptions';
import { Bar, BarType } from '@prisma/client';

@Injectable()
export class BarsService {
  constructor(
    private readonly barsRepository: BarsRepository,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Create a new bar under an event
   */
  async create(eventId: number, userId: number, dto: CreateBarDto): Promise<Bar> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    return this.barsRepository.create({
      name: dto.name,
      type: dto.type,
      status: dto.status,
      event: { connect: { id: eventId } },
    });
  }

  /**
   * List all bars for an event
   */
  async findAllByEvent(eventId: number): Promise<Bar[]> {
    await this.eventsService.findById(eventId); // Ensure event exists
    return this.barsRepository.findByEventId(eventId);
  }

  /**
   * Find a specific bar by ID within an event
   */
  async findOne(eventId: number, barId: number): Promise<Bar> {
    const bar = await this.barsRepository.findByEventIdAndBarId(eventId, barId);

    if (!bar) {
      throw new NotFoundException(`Bar with ID ${barId} not found in event ${eventId}`);
    }

    return bar;
  }

  /**
   * Update a bar
   */
  async update(eventId: number, barId: number, userId: number, dto: UpdateBarDto): Promise<Bar> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.findOne(eventId, barId); // Ensure bar exists in event

    return this.barsRepository.update(barId, dto);
  }

  /**
   * Delete a bar
   */
  async delete(eventId: number, barId: number, userId: number): Promise<void> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.findOne(eventId, barId); // Ensure bar exists in event
    await this.barsRepository.delete(barId);
  }

  /**
   * Get bars by type within an event
   */
  async findByType(eventId: number, barType: BarType): Promise<Bar[]> {
    return this.barsRepository.findByEventIdAndType(eventId, barType);
  }

  /**
   * Get all bar types used in an event
   */
  async getBarTypesInEvent(eventId: number): Promise<BarType[]> {
    return this.barsRepository.findDistinctTypesByEventId(eventId);
  }
}
