import { Injectable, NotFoundException } from '@nestjs/common';
import { PricesRepository } from './prices.repository';
import { EventsService } from '../events/events.service';
import { CreatePriceDto, UpdatePriceDto } from './dto';
import { EventStartedException, NotOwnerException } from '../common/exceptions';
import { EventPrice } from '@prisma/client';

@Injectable()
export class PricesService {
  constructor(
    private readonly pricesRepository: PricesRepository,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Validate that prices can be modified (event not started)
   */
  private async validateCanModify(eventId: number, userId: number): Promise<void> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    if (this.eventsService.hasEventStarted(event)) {
      throw new EventStartedException('modify prices');
    }
  }

  /**
   * Create or update a price for a cocktail within an event
   */
  async upsert(eventId: number, userId: number, dto: CreatePriceDto): Promise<EventPrice> {
    await this.validateCanModify(eventId, userId);

    // Verify cocktail exists
    const cocktail = await this.pricesRepository.findCocktailById(dto.cocktailId);
    if (!cocktail) {
      throw new NotFoundException(`Cocktail with ID ${dto.cocktailId} not found`);
    }

    return this.pricesRepository.upsert(eventId, dto.cocktailId, dto.price);
  }

  /**
   * Get all prices for an event
   */
  async findAllByEvent(eventId: number): Promise<EventPrice[]> {
    await this.eventsService.findById(eventId); // Ensure event exists
    return this.pricesRepository.findByEventId(eventId);
  }

  /**
   * Get price for a specific cocktail in an event
   */
  async findByCocktail(eventId: number, cocktailId: number): Promise<EventPrice | null> {
    return this.pricesRepository.findByEventIdAndCocktailId(eventId, cocktailId);
  }

  /**
   * Get a specific price by ID
   */
  async findOne(eventId: number, priceId: number): Promise<EventPrice> {
    const price = await this.pricesRepository.findByEventIdAndPriceId(eventId, priceId);

    if (!price) {
      throw new NotFoundException(`Price with ID ${priceId} not found in event ${eventId}`);
    }

    return price;
  }

  /**
   * Update a price
   */
  async update(
    eventId: number,
    priceId: number,
    userId: number,
    dto: UpdatePriceDto,
  ): Promise<EventPrice> {
    await this.validateCanModify(eventId, userId);
    await this.findOne(eventId, priceId); // Ensure price exists in event

    return this.pricesRepository.update(priceId, dto.price);
  }

  /**
   * Delete a price
   */
  async delete(eventId: number, priceId: number, userId: number): Promise<void> {
    await this.validateCanModify(eventId, userId);
    await this.findOne(eventId, priceId); // Ensure price exists in event

    await this.pricesRepository.delete(priceId);
  }

  /**
   * Bulk upsert prices for an event
   */
  async bulkUpsert(
    eventId: number,
    userId: number,
    prices: CreatePriceDto[],
  ): Promise<EventPrice[]> {
    await this.validateCanModify(eventId, userId);

    const results: EventPrice[] = [];

    for (const priceDto of prices) {
      const price = await this.pricesRepository.upsert(eventId, priceDto.cocktailId, priceDto.price);
      results.push(price);
    }

    return results;
  }
}
