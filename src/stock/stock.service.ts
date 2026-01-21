import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { StockRepository } from './stock.repository';
import { BarsService } from '../bars/bars.service';
import { EventsService } from '../events/events.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { UpsertStockDto, BulkUpsertStockDto, CreateConsignmentReturnDto } from './dto';
import { NotOwnerException } from '../common/exceptions';
import { Stock, ConsignmentReturn, OwnershipMode } from '@prisma/client';

@Injectable()
export class StockService {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly barsService: BarsService,
    private readonly eventsService: EventsService,
    private readonly suppliersService: SuppliersService,
  ) {}

  /**
   * Get all stock for a specific bar
   */
  async findAllByBar(eventId: number, barId: number, userId: number): Promise<Stock[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.findByBarId(barId);
  }

  /**
   * Get stock summary aggregated by product
   */
  async getStockSummary(
    eventId: number,
    barId: number,
    userId: number,
  ): Promise<
    {
      drinkId: number;
      drinkName: string;
      drinkBrand: string;
      totalQuantity: number;
      supplierCount: number;
    }[]
  > {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.getStockSummaryByBar(barId);
  }

  /**
   * Get stock breakdown by supplier
   */
  async getStockBySupplier(eventId: number, barId: number, userId: number): Promise<Stock[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.getStockBySupplier(barId);
  }

  /**
   * Get consignment stock available for return
   */
  async getConsignmentStock(eventId: number, barId: number, userId: number): Promise<Stock[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.getConsignmentStock(barId);
  }

  /**
   * Upsert stock for a specific bar, drink, and supplier
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

    await this.barsService.findOne(eventId, barId, userId);

    // Verify drink exists
    const drink = await this.stockRepository.findDrinkById(dto.drinkId);
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${dto.drinkId} not found`);
    }

    // Verify supplier belongs to this user (tenant isolation)
    await this.suppliersService.validateOwnership(dto.supplierId, userId);

    // Validate quantity
    if (dto.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    return this.stockRepository.upsert(barId, dto.drinkId, dto.supplierId, {
      quantity: dto.quantity,
      unitCost: dto.unitCost,
      currency: dto.currency || 'ARS',
      ownershipMode: dto.ownershipMode,
    });
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

    await this.barsService.findOne(eventId, barId, userId);

    const results: Stock[] = [];
    for (const item of dto.items) {
      // Verify drink exists
      const drink = await this.stockRepository.findDrinkById(item.drinkId);
      if (!drink) {
        throw new NotFoundException(`Drink with ID ${item.drinkId} not found`);
      }

      // Verify supplier belongs to this user
      await this.suppliersService.validateOwnership(item.supplierId, userId);

      // Validate quantity
      if (item.quantity <= 0) {
        throw new BadRequestException('Quantity must be greater than 0');
      }

      const stock = await this.stockRepository.upsert(
        barId,
        item.drinkId,
        item.supplierId,
        {
          quantity: item.quantity,
          unitCost: item.unitCost,
          currency: item.currency || 'ARS',
          ownershipMode: item.ownershipMode,
        },
      );
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
    supplierId: number,
    userId: number,
  ): Promise<void> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId, userId);

    // Verify the stock entry exists
    const stock = await this.stockRepository.findByBarIdDrinkIdAndSupplierId(
      barId,
      drinkId,
      supplierId,
    );

    if (!stock) {
      throw new NotFoundException(
        `Stock entry not found for bar ${barId}, drink ${drinkId}, supplier ${supplierId}`,
      );
    }

    await this.stockRepository.delete(barId, drinkId, supplierId);
  }

  /**
   * Get stock for a specific drink across all bars in an event
   */
  async getStockByDrinkAcrossEvent(
    eventId: number,
    drinkId: number,
    userId: number,
  ): Promise<
    { barId: number; barName: string; supplierId: number; supplierName: string; quantity: number }[]
  > {
    const bars = await this.barsService.findAllByEvent(eventId, userId);
    const barIds = bars.map((b) => b.id);

    const stocks = await this.stockRepository.findByDrinkIdAndBarIds(drinkId, barIds);

    return stocks.map((s: any) => ({
      barId: s.bar.id,
      barName: s.bar.name,
      supplierId: s.supplier.id,
      supplierName: s.supplier.name,
      quantity: s.quantity,
    }));
  }

  /**
   * Create a consignment return
   */
  async createConsignmentReturn(
    eventId: number,
    barId: number,
    userId: number,
    dto: CreateConsignmentReturnDto,
  ): Promise<ConsignmentReturn> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId, userId);

    // Verify supplier belongs to this user
    await this.suppliersService.validateOwnership(dto.supplierId, userId);

    // Get the stock entry
    const stock = await this.stockRepository.findByBarIdDrinkIdAndSupplierId(
      barId,
      dto.drinkId,
      dto.supplierId,
    );

    if (!stock) {
      throw new NotFoundException(
        `Stock entry not found for bar ${barId}, drink ${dto.drinkId}, supplier ${dto.supplierId}`,
      );
    }

    // Verify it's consignment stock
    if (stock.ownershipMode !== OwnershipMode.consignment) {
      throw new BadRequestException(
        'Only consignment stock can be returned. This stock is marked as purchased.',
      );
    }

    // Verify quantity is valid
    if (dto.quantityReturned <= 0) {
      throw new BadRequestException('Quantity to return must be greater than 0');
    }

    // Verify we're not returning more than available
    if (dto.quantityReturned > stock.quantity) {
      throw new BadRequestException(
        `Cannot return ${dto.quantityReturned} units. Only ${stock.quantity} units available in stock.`,
      );
    }

    // Update stock quantity
    const newQuantity = stock.quantity - dto.quantityReturned;
    await this.stockRepository.updateQuantity(barId, dto.drinkId, dto.supplierId, newQuantity);

    // Create return record
    // @deprecated: This manual return flow should be replaced with ConsignmentService.executeReturn
    return this.stockRepository.createConsignmentReturn({
      stockBarId: barId,
      stockDrinkId: dto.drinkId,
      stockSupplierId: dto.supplierId,
      supplierId: dto.supplierId,
      quantityReturned: dto.quantityReturned,
      performedById: userId,
      notes: dto.notes,
    });
  }

  /**
   * Get consignment returns for a bar
   */
  async getConsignmentReturns(
    eventId: number,
    barId: number,
    userId: number,
  ): Promise<ConsignmentReturn[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.getConsignmentReturnsByBar(barId);
  }
}
