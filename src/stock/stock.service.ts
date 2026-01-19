import { Injectable, NotFoundException } from '@nestjs/common';
import { StockRepository } from './stock.repository';
import { BarsService } from '../bars/bars.service';
import { EventsService } from '../events/events.service';
import { UpsertStockDto, BulkUpsertStockDto } from './dto';
import { NotOwnerException } from '../common/exceptions';
import { Stock } from '@prisma/client';

@Injectable()
export class StockService {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly barsService: BarsService,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Get all stock for a specific bar
   */
  async findAllByBar(eventId: number, barId: number): Promise<Stock[]> {
    await this.barsService.findOne(eventId, barId); // Ensure bar exists in event
    return this.stockRepository.findByBarId(barId);
  }

  /**
   * Upsert stock for a specific bar and drink
   */
  async upsert(
    eventId: number,
    barId: number,
    userId: number,
    dto: UpsertStockDto,
  ): Promise<Stock> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId); // Ensure bar exists in event

    // Verify drink exists
    const drink = await this.stockRepository.findDrinkById(dto.drinkId);
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${dto.drinkId} not found`);
    }

    return this.stockRepository.upsert(barId, dto.drinkId, dto.amount);
  }

  /**
   * Bulk upsert stock for a bar
   */
  async bulkUpsert(
    eventId: number,
    barId: number,
    userId: number,
    dto: BulkUpsertStockDto,
  ): Promise<Stock[]> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId); // Ensure bar exists in event

    const results: Stock[] = [];
    for (const item of dto.items) {
      const stock = await this.stockRepository.upsert(barId, item.drinkId, item.amount);
      results.push(stock);
    }

    return results;
  }

  /**
   * Delete stock entry for a bar
   */
  async delete(
    eventId: number,
    barId: number,
    drinkId: number,
    userId: number,
  ): Promise<void> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId); // Ensure bar exists in event
    await this.stockRepository.delete(barId, drinkId);
  }

  /**
   * Get stock for a specific drink across all bars in an event
   */
  async getStockByDrinkAcrossEvent(
    eventId: number,
    drinkId: number,
  ): Promise<{ barId: number; barName: string; amount: number }[]> {
    const bars = await this.barsService.findAllByEvent(eventId);
    const barIds = bars.map((b) => b.id);
    
    const stocks = await this.stockRepository.findByDrinkIdAndBarIds(drinkId, barIds);

    return stocks.map((s: any) => ({
      barId: s.bar.id,
      barName: s.bar.name,
      amount: s.amount,
    }));
  }
}
