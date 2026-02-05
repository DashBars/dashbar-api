import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CategoriesRepository } from './categories.repository';
import { EventsService } from '../events/events.service';
import { CreateCategoryDto, UpdateCategoryDto, AssignCocktailsDto } from './dto';
import { EventStartedException, NotOwnerException } from '../common/exceptions';
import { Category, CocktailCategory } from '@prisma/client';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Validate that categories can be modified (event not started)
   */
  private async validateCanModify(eventId: number, userId: number): Promise<void> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    if (this.eventsService.hasEventStarted(event)) {
      throw new EventStartedException('modify categories');
    }
  }

  /**
   * Create a new category for an event
   */
  async create(eventId: number, userId: number, dto: CreateCategoryDto): Promise<Category> {
    await this.validateCanModify(eventId, userId);

    // Check for duplicate name
    const existing = await this.categoriesRepository.findByEventIdAndName(eventId, dto.name);
    if (existing) {
      throw new ConflictException(`Category with name "${dto.name}" already exists in this event`);
    }

    // Get next sort index if not provided
    const sortIndex = dto.sortIndex ?? await this.categoriesRepository.getNextSortIndex(eventId);

    return this.categoriesRepository.create({
      eventId,
      name: dto.name,
      description: dto.description,
      sortIndex,
      isActive: dto.isActive ?? true,
    });
  }

  /**
   * Get all categories for an event (ordered by sortIndex)
   */
  async findAllByEvent(eventId: number): Promise<Category[]> {
    await this.eventsService.findById(eventId);
    return this.categoriesRepository.findByEventId(eventId);
  }

  /**
   * Get a specific category
   */
  async findOne(eventId: number, categoryId: number): Promise<Category> {
    const category = await this.categoriesRepository.findByEventIdAndCategoryId(eventId, categoryId);

    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found in event ${eventId}`);
    }

    return category;
  }

  /**
   * Update a category
   */
  async update(
    eventId: number,
    categoryId: number,
    userId: number,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    await this.validateCanModify(eventId, userId);
    const category = await this.findOne(eventId, categoryId);

    // Check for duplicate name if updating name
    if (dto.name && dto.name !== category.name) {
      const existing = await this.categoriesRepository.findByEventIdAndName(eventId, dto.name);
      if (existing) {
        throw new ConflictException(`Category with name "${dto.name}" already exists in this event`);
      }
    }

    return this.categoriesRepository.update(categoryId, dto);
  }

  /**
   * Delete a category
   */
  async delete(eventId: number, categoryId: number, userId: number): Promise<void> {
    await this.validateCanModify(eventId, userId);
    await this.findOne(eventId, categoryId);

    await this.categoriesRepository.delete(categoryId);
  }

  /**
   * Assign cocktails to a category (replaces existing assignments)
   */
  async assignCocktails(
    eventId: number,
    categoryId: number,
    userId: number,
    dto: AssignCocktailsDto,
  ): Promise<CocktailCategory[]> {
    await this.validateCanModify(eventId, userId);
    await this.findOne(eventId, categoryId);

    // Verify all cocktails exist
    for (const item of dto.cocktails) {
      const cocktail = await this.categoriesRepository.findCocktailById(item.cocktailId);
      if (!cocktail) {
        throw new NotFoundException(`Cocktail with ID ${item.cocktailId} not found`);
      }
    }

    return this.categoriesRepository.assignCocktails(categoryId, dto.cocktails);
  }

  /**
   * Add a single cocktail to a category
   */
  async addCocktail(
    eventId: number,
    categoryId: number,
    cocktailId: number,
    userId: number,
    sortIndex?: number,
  ): Promise<CocktailCategory> {
    await this.validateCanModify(eventId, userId);
    await this.findOne(eventId, categoryId);

    const cocktail = await this.categoriesRepository.findCocktailById(cocktailId);
    if (!cocktail) {
      throw new NotFoundException(`Cocktail with ID ${cocktailId} not found`);
    }

    return this.categoriesRepository.addCocktailToCategory(categoryId, cocktailId, sortIndex ?? 0);
  }

  /**
   * Remove a cocktail from a category
   */
  async removeCocktail(
    eventId: number,
    categoryId: number,
    cocktailId: number,
    userId: number,
  ): Promise<void> {
    await this.validateCanModify(eventId, userId);
    await this.findOne(eventId, categoryId);

    await this.categoriesRepository.removeCocktailFromCategory(categoryId, cocktailId);
  }
}
