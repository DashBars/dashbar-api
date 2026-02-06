import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { RecipesRepository } from './recipes.repository';
import { EventsService } from '../events/events.service';
import { ProductsService } from '../products/products.service';
import { BarsService } from '../bars/bars.service';
import { CreateRecipeDto, UpdateRecipeDto } from './dto';
import { EventStartedException, NotOwnerException } from '../common/exceptions';
import { BarType } from '@prisma/client';
import type { EventRecipeWithRelations } from './recipes.repository';

@Injectable()
export class RecipesService {
  constructor(
    private readonly recipesRepository: RecipesRepository,
    private readonly eventsService: EventsService,
    private readonly productsService: ProductsService,
    private readonly barsService: BarsService,
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
   * Recipes require at least 2 components (single-ingredient items should use "venta directa" on stock)
   */
  private validateComponents(
    components: Array<{ drinkId: number; percentage: number }>,
    hasIce: boolean,
  ): void {
    if (components.length < 2) {
      throw new BadRequestException(
        'Las recetas requieren al menos 2 componentes. Para vender un insumo individual (ej: botella de agua), usá la opción "Venta directa" al asignar stock a la barra.',
      );
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

    // Check if recipe with same cocktail name has overlapping bar types
    const existing = await this.recipesRepository.findByEventId(eventId);
    const normalizedName = dto.cocktailName.trim();
    const requestedBarTypes = dto.barTypes ?? [];
    
    // Find recipes with the same name
    const sameNameRecipes = existing.filter((r) => r.cocktailName === normalizedName);
    
    // Helper to check if two recipes have identical configuration
    const areRecipesIdentical = (
      recipe: EventRecipeWithRelations,
      newRecipe: { glassVolume: number; hasIce: boolean; salePrice?: number; components: Array<{ drinkId: number; percentage: number }> }
    ): boolean => {
      // Check basic properties
      if (recipe.glassVolume !== newRecipe.glassVolume) return false;
      if (recipe.hasIce !== newRecipe.hasIce) return false;
      if ((recipe.salePrice || 0) !== (newRecipe.salePrice || 0)) return false;
      
      // Check components (same drinks with same percentages)
      if (recipe.components.length !== newRecipe.components.length) return false;
      
      const sortedExisting = [...recipe.components].sort((a, b) => a.drinkId - b.drinkId);
      const sortedNew = [...newRecipe.components].sort((a, b) => a.drinkId - b.drinkId);
      
      for (let i = 0; i < sortedExisting.length; i++) {
        if (sortedExisting[i].drinkId !== sortedNew[i].drinkId) return false;
        if (sortedExisting[i].percentage !== sortedNew[i].percentage) return false;
      }
      
      return true;
    };
    
    // Check if there's an identical recipe we can just add bar types to
    for (const recipe of sameNameRecipes) {
      if (areRecipesIdentical(recipe, dto)) {
        // Found identical recipe - add the new bar types to it
        const mergedBarTypes = [...new Set([...recipe.barTypes, ...requestedBarTypes])];
        return this.recipesRepository.update(recipe.id, { barTypes: mergedBarTypes });
      }
    }
    
    // Check for overlapping bar types (only if we're creating a new variant)
    for (const recipe of sameNameRecipes) {
      const existingBarTypes = recipe.barTypes; // Already BarType[] from repository mapping
      const overlapping = requestedBarTypes.filter((bt) => existingBarTypes.includes(bt));
      
      if (overlapping.length > 0) {
        throw new BadRequestException(
          `Ya existe una receta "${normalizedName}" para los tipos de barra: ${overlapping.join(', ')}. Editá la receta existente o elegí otros tipos de barra.`,
        );
      }
    }

    const recipe = await this.recipesRepository.create({
      eventId,
      cocktailName: normalizedName,
      glassVolume: dto.glassVolume,
      hasIce: dto.hasIce,
      salePrice: dto.salePrice ?? 0,
      barTypes: dto.barTypes ?? [],
      components: dto.components,
    });

    // If "producto final": create event product + one product per bar of selected types
    const salePrice = dto.salePrice ?? 0;
    const barTypes = dto.barTypes ?? [];
    if (salePrice > 0 && barTypes.length > 0) {
      const cocktail = await this.recipesRepository.findCocktailByName(normalizedName);
      if (cocktail) {
        await this.productsService.create(eventId, userId, {
          name: normalizedName,
          price: salePrice,
          cocktailIds: [cocktail.id],
        });
        const bars = await this.barsService.findAllByEvent(eventId, userId);
        for (const bar of bars.filter((b) => barTypes.includes(b.type))) {
          await this.productsService.create(eventId, userId, {
            name: normalizedName,
            price: salePrice,
            cocktailIds: [cocktail.id],
            barId: bar.id,
          });
        }
      }
    }

    return recipe;
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

    // Check for overlapping bar types if name or barTypes are being updated
    if (dto.cocktailName !== undefined || dto.barTypes !== undefined) {
      const existing = await this.recipesRepository.findByEventId(eventId);
      const currentRecipe = await this.findOne(eventId, recipeId);
      const normalizedName = dto.cocktailName?.trim() ?? currentRecipe.cocktailName;
      const requestedBarTypes = dto.barTypes ?? currentRecipe.barTypes; // Already BarType[] from repository mapping
      
      // Find recipes with the same name (excluding current recipe)
      const sameNameRecipes = existing.filter(
        (r) => r.cocktailName === normalizedName && r.id !== recipeId
      );
      
      // Check for overlapping bar types
      for (const recipe of sameNameRecipes) {
        const existingBarTypes = recipe.barTypes; // Already BarType[] from repository mapping
        const overlapping = requestedBarTypes.filter((bt) => existingBarTypes.includes(bt));
        
        if (overlapping.length > 0) {
          throw new BadRequestException(
            `Ya existe una receta "${normalizedName}" para los tipos de barra: ${overlapping.join(', ')}. Editá la receta existente o elegí otros tipos de barra.`,
          );
        }
      }
      
      if (dto.cocktailName !== undefined) {
        dto.cocktailName = normalizedName;
      }
    }

    const updated = await this.recipesRepository.update(recipeId, dto);
    const effectiveName = updated.cocktailName;
    const salePrice = dto.salePrice ?? 0;
    const barTypes = dto.barTypes ?? [];

    // Sync "producto final" products: remove any existing, then create if final product
    await this.productsService.deleteByEventIdAndName(eventId, effectiveName, userId);
    if (salePrice > 0 && barTypes.length > 0) {
      const cocktail = await this.recipesRepository.findCocktailByName(effectiveName);
      if (cocktail) {
        await this.productsService.create(eventId, userId, {
          name: effectiveName,
          price: salePrice,
          cocktailIds: [cocktail.id],
        });
        const bars = await this.barsService.findAllByEvent(eventId, userId);
        for (const bar of bars.filter((b) => barTypes.includes(b.type))) {
          await this.productsService.create(eventId, userId, {
            name: effectiveName,
            price: salePrice,
            cocktailIds: [cocktail.id],
            barId: bar.id,
          });
        }
      }
    }

    return updated;
  }

  /**
   * Delete a recipe
   */
  async delete(eventId: number, recipeId: number, userId: number): Promise<void> {
    await this.validateCanModify(eventId, userId);
    const recipe = await this.findOne(eventId, recipeId); // Ensure recipe exists in event

    // Remove any "producto final" products linked to this recipe name
    await this.productsService.deleteByEventIdAndName(eventId, recipe.cocktailName, userId);

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
          salePrice: recipe.salePrice || 0,
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
