import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductsRepository, EventProductWithCocktails } from './products.repository';
import { EventsService } from '../events/events.service';
import { BarsService } from '../bars/bars.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { NotOwnerException } from '../common/exceptions';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly eventsService: EventsService,
    private readonly barsService: BarsService,
  ) {}

  private async validateCanModify(eventId: number, userId: number): Promise<void> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }
  }

  async create(eventId: number, userId: number, dto: CreateProductDto): Promise<EventProductWithCocktails> {
    await this.validateCanModify(eventId, userId);

    if (dto.barId != null) {
      await this.barsService.findOne(eventId, dto.barId, userId);
    }

    // Validate all cocktails exist
    for (const cocktailId of dto.cocktailIds) {
      const cocktail = await this.productsRepository.findCocktailById(cocktailId);
      if (!cocktail) {
        throw new NotFoundException(`Cocktail with ID ${cocktailId} not found`);
      }
    }

    return this.productsRepository.create({
      eventId,
      name: dto.name,
      price: dto.price,
      cocktailIds: dto.cocktailIds,
      barId: dto.barId,
    });
  }

  async findAllByEvent(eventId: number): Promise<EventProductWithCocktails[]> {
    await this.eventsService.findById(eventId);
    return this.productsRepository.findByEventId(eventId);
  }

  async findAllByEventAndBar(eventId: number, barId: number): Promise<EventProductWithCocktails[]> {
    await this.eventsService.findById(eventId);
    return this.productsRepository.findByEventIdAndBarId(eventId, barId);
  }

  async findOne(eventId: number, productId: number): Promise<EventProductWithCocktails> {
    const product = await this.productsRepository.findByEventIdAndProductId(eventId, productId);

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found in event ${eventId}`);
    }

    return product;
  }

  async update(
    eventId: number,
    productId: number,
    userId: number,
    dto: UpdateProductDto,
  ): Promise<EventProductWithCocktails> {
    await this.validateCanModify(eventId, userId);
    await this.findOne(eventId, productId);

    // Validate all cocktails exist if provided
    if (dto.cocktailIds) {
      for (const cocktailId of dto.cocktailIds) {
        const cocktail = await this.productsRepository.findCocktailById(cocktailId);
        if (!cocktail) {
          throw new NotFoundException(`Cocktail with ID ${cocktailId} not found`);
        }
      }
    }

    return this.productsRepository.update(productId, dto);
  }

  async delete(eventId: number, productId: number, userId: number): Promise<void> {
    await this.validateCanModify(eventId, userId);
    await this.findOne(eventId, productId);

    await this.productsRepository.delete(productId);
  }

  /**
   * Delete all products for an event with the given name (event-level and per-bar).
   * Used when updating or removing "producto final" from a recipe.
   */
  async deleteByEventIdAndName(eventId: number, name: string, userId: number): Promise<void> {
    await this.validateCanModify(eventId, userId);
    const products = await this.productsRepository.findByEventIdAndName(eventId, name);
    const ids = products.map((p) => p.id);
    await this.productsRepository.deleteManyByIds(ids);
  }
}
