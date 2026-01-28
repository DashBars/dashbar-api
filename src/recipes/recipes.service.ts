import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { RecipesRepository } from './recipes.repository';
import { EventsService } from '../events/events.service';
import { CreateRecipeDto, UpdateRecipeDto } from './dto';
import { EventStartedException, NotOwnerException } from '../common/exceptions';
import { BarType } from '@prisma/client';
import type { EventRecipeWithRelations } from './recipes.repository';

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
   * Validate recipe components
   */
  private validateComponents(
    components: Array<{ drinkId: number; percentage: number }>,
    hasIce: boolean,
  ): void {
    if (components.length === 0) {
      throw new BadRequestException('Recipe must have at least one component');
    }

    const totalPercentage = components.reduce((sum, c) => sum + c.percentage, 0);
    const maxPercentage = hasIce ? 100 : 100;

    if (totalPercentage > maxPercentage) {
      throw new BadRequestException(
        `Total percentage of components (${totalPercentage}%) exceeds maximum allowed (${maxPercentage}%)`,
      );
    }

    // Validate all drinkIds exist
    // This will be checked in the create/update methods
  }

  /**
   * Create a recipe for an event
   */
  async create(
    eventId: number,
    userId: number,
    dto: CreateRecipeDto,
  ): Promise<EventRecipeWithRelations> {
    await this.validateCanModify(eventId, userId);

    // Validate components
    this.validateComponents(dto.components, dto.hasIce);

    // Verify all drinks exist
    for (const component of dto.components) {
      const drink = await this.recipesRepository.findDrinkById(component.drinkId);
      if (!drink) {
        throw new NotFoundException(`Drink with ID ${component.drinkId} not found`);
      }
    }

    // Check if recipe with same cocktail name already exists for this event
    const existing = await this.recipesRepository.findByEventId(eventId);
    const normalizedName = dto.cocktailName.trim();
    const duplicate = existing.find((r) => r.cocktailName === normalizedName);
    if (duplicate) {
      throw new BadRequestException(
        `Recipe with cocktail name "${normalizedName}" already exists for this event`,
      );
    }

    return this.recipesRepository.create({
      eventId,
      cocktailName: normalizedName,
      glassVolume: dto.glassVolume,
      hasIce: dto.hasIce,
      salePrice: dto.salePrice,
      barTypes: dto.barTypes,
      components: dto.components,
    });
  }

  /**
   * Get all recipes for an event
   */
  async findAllByEvent(eventId: number): Promise<EventRecipeWithRelations[]> {
    await this.eventsService.findById(eventId); // Ensure event exists
    return this.recipesRepository.findByEventId(eventId);
  }

  /**
   * Get recipes for a specific bar type within an event
   */
  async findByBarType(eventId: number, barType: BarType): Promise<EventRecipeWithRelations[]> {
    await this.eventsService.findById(eventId); // Ensure event exists
    return this.recipesRepository.findByEventIdAndBarType(eventId, barType);
  }

  /**
   * Get a specific recipe
   */
  async findOne(eventId: number, recipeId: number): Promise<EventRecipeWithRelations> {
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
    cocktailName: string,
  ): Promise<EventRecipeWithRelations[]> {
    return this.recipesRepository.findByEventIdBarTypeAndCocktailName(eventId, barType, cocktailName);
  }

  /**
   * Update a recipe
   */
  async update(
    eventId: number,
    recipeId: number,
    userId: number,
    dto: UpdateRecipeDto,
  ): Promise<EventRecipeWithRelations> {
    await this.validateCanModify(eventId, userId);
    await this.findOne(eventId, recipeId); // Ensure recipe exists in event

    // Validate components if provided
    if (dto.components !== undefined) {
      this.validateComponents(dto.components, dto.hasIce ?? false);
    } else if (dto.hasIce !== undefined) {
      // If only hasIce is being updated, get current components to validate
      const current = await this.findOne(eventId, recipeId);
      this.validateComponents(current.components, dto.hasIce);
    }

    // Verify all drinks exist if components are being updated
    if (dto.components !== undefined) {
      for (const component of dto.components) {
        const drink = await this.recipesRepository.findDrinkById(component.drinkId);
        if (!drink) {
          throw new NotFoundException(`Drink with ID ${component.drinkId} not found`);
        }
      }
    }

    // Check for duplicate cocktail name if name is being updated
    if (dto.cocktailName !== undefined) {
      const existing = await this.recipesRepository.findByEventId(eventId);
      const normalizedName = dto.cocktailName.trim();
      const duplicate = existing.find((r) => r.cocktailName === normalizedName && r.id !== recipeId);
      if (duplicate) {
        throw new BadRequestException(
          `Recipe with cocktail name "${normalizedName}" already exists for this event`,
        );
      }
      dto.cocktailName = normalizedName;
    }

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
  ): Promise<EventRecipeWithRelations[]> {
    await this.validateCanModify(eventId, userId);

    const sourceRecipes = await this.findByBarType(eventId, fromBarType);

    const createdRecipes: EventRecipeWithRelations[] = [];

    for (const recipe of sourceRecipes) {
      // Check if recipe already exists for target bar type
      const existing = await this.recipesRepository.findByEventIdBarTypeAndCocktailName(
        eventId,
        toBarType,
        recipe.cocktailName,
      );

      if (existing.length === 0) {
        // Create new recipe with same data but different bar types
        const created = await this.recipesRepository.create({
          eventId,
          cocktailName: recipe.cocktailName,
          glassVolume: recipe.glassVolume,
          hasIce: recipe.hasIce,
          salePrice: recipe.salePrice,
          barTypes: [toBarType],
          components: recipe.components.map((c) => ({
            drinkId: c.drinkId,
            percentage: c.percentage,
          })),
        });
        createdRecipes.push(created);
      }
    }

    return createdRecipes;
  }
}
