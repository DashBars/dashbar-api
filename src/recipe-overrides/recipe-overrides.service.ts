import { Injectable, NotFoundException } from '@nestjs/common';
import { RecipeOverridesRepository } from './recipe-overrides.repository';
import { BarsService } from '../bars/bars.service';
import { EventsService } from '../events/events.service';
import { CreateRecipeOverrideDto, UpdateRecipeOverrideDto } from './dto';
import { NotOwnerException } from '../common/exceptions';
import { BarRecipeOverride } from '@prisma/client';

@Injectable()
export class RecipeOverridesService {
  constructor(
    private readonly repository: RecipeOverridesRepository,
    private readonly barsService: BarsService,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Validate that user can modify overrides for this bar
   */
  private async validateCanModify(eventId: number, barId: number, userId: number): Promise<void> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    // Ensure bar exists in event
    await this.barsService.findOne(eventId, barId, userId);
  }

  /**
   * Create a recipe override for a specific bar
   */
  async create(
    eventId: number,
    barId: number,
    userId: number,
    dto: CreateRecipeOverrideDto,
  ): Promise<BarRecipeOverride> {
    await this.validateCanModify(eventId, barId, userId);

    // Verify cocktail exists
    const cocktail = await this.repository.findCocktailById(dto.cocktailId);
    if (!cocktail) {
      throw new NotFoundException(`Cocktail with ID ${dto.cocktailId} not found`);
    }

    // Verify drink exists
    const drink = await this.repository.findDrinkById(dto.drinkId);
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${dto.drinkId} not found`);
    }

    return this.repository.upsert(barId, dto.cocktailId, dto.drinkId, dto.cocktailPercentage);
  }

  /**
   * Get all recipe overrides for a bar
   */
  async findAllByBar(eventId: number, barId: number, userId: number): Promise<BarRecipeOverride[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.repository.findByBarId(barId);
  }

  /**
   * Get recipe override for a specific cocktail in a bar
   */
  async findByCocktail(
    eventId: number,
    barId: number,
    cocktailId: number,
    userId: number,
  ): Promise<BarRecipeOverride[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.repository.findByBarIdAndCocktailId(barId, cocktailId);
  }

  /**
   * Get a specific override by ID
   */
  async findOne(eventId: number, barId: number, overrideId: number, userId: number): Promise<BarRecipeOverride> {
    await this.barsService.findOne(eventId, barId, userId);

    const override = await this.repository.findById(overrideId);

    if (!override || (override as any).bar?.id !== barId) {
      throw new NotFoundException(
        `Recipe override with ID ${overrideId} not found in bar ${barId}`,
      );
    }

    return override;
  }

  /**
   * Update a recipe override
   */
  async update(
    eventId: number,
    barId: number,
    overrideId: number,
    userId: number,
    dto: UpdateRecipeOverrideDto,
  ): Promise<BarRecipeOverride> {
    await this.validateCanModify(eventId, barId, userId);
    await this.findOne(eventId, barId, overrideId, userId);

    return this.repository.update(overrideId, dto);
  }

  /**
   * Delete a recipe override
   */
  async delete(
    eventId: number,
    barId: number,
    overrideId: number,
    userId: number,
  ): Promise<void> {
    await this.validateCanModify(eventId, barId, userId);
    await this.findOne(eventId, barId, overrideId, userId);

    await this.repository.delete(overrideId);
  }

  /**
   * Delete all overrides for a cocktail in a bar
   */
  async deleteByCocktail(
    eventId: number,
    barId: number,
    cocktailId: number,
    userId: number,
  ): Promise<void> {
    await this.validateCanModify(eventId, barId, userId);
    await this.repository.deleteByBarIdAndCocktailId(barId, cocktailId);
  }
}
