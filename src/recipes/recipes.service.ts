import { Injectable, NotFoundException } from '@nestjs/common';
import { RecipesRepository } from './recipes.repository';
import { EventsService } from '../events/events.service';
import { CreateRecipeDto, UpdateRecipeDto } from './dto';
import { EventStartedException, NotOwnerException } from '../common/exceptions';
import { BarType, EventRecipe } from '@prisma/client';

@Injectable()
export class RecipesService {
  constructor(
    private readonly recipesRepository: RecipesRepository,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Validate that recipes can be modified (event not started)
   */
  private async validateCanModify(eventId: number, userId: number): Promise<void> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    if (this.eventsService.hasEventStarted(event)) {
      throw new EventStartedException('modify recipes');
    }
  }

  /**
   * Create a recipe for a bar type within an event
   */
  async create(eventId: number, userId: number, dto: CreateRecipeDto): Promise<EventRecipe> {
    await this.validateCanModify(eventId, userId);

    // Verify cocktail exists
    const cocktail = await this.recipesRepository.findCocktailById(dto.cocktailId);
    if (!cocktail) {
      throw new NotFoundException(`Cocktail with ID ${dto.cocktailId} not found`);
    }

    // Verify drink exists
    const drink = await this.recipesRepository.findDrinkById(dto.drinkId);
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${dto.drinkId} not found`);
    }

    return this.recipesRepository.create({
      eventId,
      barType: dto.barType,
      cocktailId: dto.cocktailId,
      drinkId: dto.drinkId,
      cocktailPercentage: dto.cocktailPercentage,
    });
  }

  /**
   * Get all recipes for an event
   */
  async findAllByEvent(eventId: number): Promise<EventRecipe[]> {
    await this.eventsService.findById(eventId); // Ensure event exists
    return this.recipesRepository.findByEventId(eventId);
  }

  /**
   * Get recipes for a specific bar type within an event
   */
  async findByBarType(eventId: number, barType: BarType): Promise<EventRecipe[]> {
    await this.eventsService.findById(eventId); // Ensure event exists
    return this.recipesRepository.findByEventIdAndBarType(eventId, barType);
  }

  /**
   * Get a specific recipe
   */
  async findOne(eventId: number, recipeId: number): Promise<EventRecipe> {
    const recipe = await this.recipesRepository.findByEventIdAndRecipeId(eventId, recipeId);

    if (!recipe) {
      throw new NotFoundException(`Recipe with ID ${recipeId} not found in event ${eventId}`);
    }

    return recipe;
  }

  /**
   * Get recipe for a cocktail by bar type (used for resolving recipes at runtime)
   */
  async getRecipeForCocktail(
    eventId: number,
    barType: BarType,
    cocktailId: number,
  ): Promise<EventRecipe[]> {
    return this.recipesRepository.findByEventIdBarTypeAndCocktailId(eventId, barType, cocktailId);
  }

  /**
   * Update a recipe
   */
  async update(
    eventId: number,
    recipeId: number,
    userId: number,
    dto: UpdateRecipeDto,
  ): Promise<EventRecipe> {
    await this.validateCanModify(eventId, userId);
    await this.findOne(eventId, recipeId); // Ensure recipe exists in event

    return this.recipesRepository.update(recipeId, dto);
  }

  /**
   * Delete a recipe
   */
  async delete(eventId: number, recipeId: number, userId: number): Promise<void> {
    await this.validateCanModify(eventId, userId);
    await this.findOne(eventId, recipeId); // Ensure recipe exists in event

    await this.recipesRepository.delete(recipeId);
  }

  /**
   * Copy recipes from one bar type to another within the same event
   */
  async copyRecipes(
    eventId: number,
    userId: number,
    fromBarType: BarType,
    toBarType: BarType,
  ): Promise<EventRecipe[]> {
    await this.validateCanModify(eventId, userId);

    const sourceRecipes = await this.findByBarType(eventId, fromBarType);

    const createdRecipes: EventRecipe[] = [];

    for (const recipe of sourceRecipes) {
      const created = await this.recipesRepository.upsert(
        eventId,
        toBarType,
        recipe.cocktailId,
        recipe.drinkId,
        recipe.cocktailPercentage,
      );
      createdRecipes.push(created);
    }

    return createdRecipes;
  }
}
