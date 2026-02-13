import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SalesRepository } from './sales.repository';
import { BarsService } from '../bars/bars.service';
import { CreateSaleDto } from './dto';
import { InsufficientStockException, NotOwnerException } from '../common/exceptions';
import { Sale, InventoryMovement, Stock, StockDepletionPolicy } from '@prisma/client';

interface RecipeComponent {
  drinkId: number;
  drinkName: string;
  cocktailPercentage: number;
}

interface DrinkConsumption {
  drinkId: number;
  drinkName: string;
  totalMlRequired: number;
}

/** Whether the sale targets "venta directa" or "para recetas" stock pool */
type StockPoolType = 'direct' | 'recipe';

export interface StockDepletion {
  barId: number;
  drinkId: number;
  supplierId: number;
  sellAsWholeUnit: boolean;
  quantityToDeduct: number;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly salesRepository: SalesRepository,
    private readonly barsService: BarsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a sale with automatic stock depletion
   */
  async createSale(
    eventId: number,
    barId: number,
    dto: CreateSaleDto,
  ): Promise<Sale & { depletions: StockDepletion[] }> {
    // 1. Get bar with event
    const bar = await this.salesRepository.getBarWithEvent(barId);
    if (!bar || bar.eventId !== eventId) {
      throw new NotFoundException(`Bar with ID ${barId} not found in event ${eventId}`);
    }

    // 2. Get cocktail
    const cocktail = await this.salesRepository.getCocktailById(dto.cocktailId);
    if (!cocktail) {
      throw new NotFoundException(`Cocktail with ID ${dto.cocktailId} not found`);
    }

    // 3. Resolve recipe (bar override > barType recipe)
    const recipeResult = await this.resolveRecipe(bar.id, bar.type, bar.eventId, cocktail.name);
    if (recipeResult.components.length === 0) {
      throw new BadRequestException(
        `No recipe found for cocktail "${cocktail.name}" in this bar`,
      );
    }

    // Determine stock pool: direct sale = single component at 100% (whole unit)
    // recipe = multi-component or < 100% (fractional ingredients)
    const isDirectSale =
      recipeResult.components.length === 1 &&
      recipeResult.components[0].cocktailPercentage === 100;
    const stockPool: StockPoolType = isDirectSale ? 'direct' : 'recipe';

    // 4. Calculate consumption per drink using glassVolume from recipe
    const consumption = this.calculateConsumption(
      recipeResult.components,
      recipeResult.glassVolume,
      dto.quantity,
    );

    // 5. Plan depletions according to event's policy
    const depletions = await this.planDepletions(
      barId,
      consumption,
      bar.event.stockDepletionPolicy,
      stockPool,
    );

    // 6. Execute sale with depletions (transactional)
    const sale = await this.salesRepository.createSaleWithDepletion(
      barId,
      dto.cocktailId,
      dto.quantity,
      depletions,
    );

    // 7. Emit sale.created event for real-time dashboard
    this.eventEmitter.emit('sale.created', {
      eventId,
      barId,
      sale: {
        id: sale.id,
        cocktailId: sale.cocktailId,
        quantity: sale.quantity,
        createdAt: sale.createdAt,
      },
      depletions,
    });

    return { ...sale, depletions };
  }

  /**
   * Resolve recipe for a cocktail in a bar
   * Priority: BarRecipeOverride > EventRecipe by barType
   * Returns recipe components and glass volume
   */
  private async resolveRecipe(
    barId: number,
    barType: string,
    eventId: number,
    cocktailName: string,
  ): Promise<{ components: RecipeComponent[]; glassVolume: number }> {
    // First, check for bar-specific overrides
    // Note: BarRecipeOverride still uses cocktailId, so we need to find cocktail by name first
    const cocktail = await this.salesRepository.getCocktailByName(cocktailName);
    if (cocktail) {
      const overrides = await this.salesRepository.getBarRecipeOverrides(barId, cocktail.id);

      if (overrides.length > 0) {
        // For overrides, use cocktail volume as glass volume
        return {
          components: overrides.map((o) => ({
            drinkId: o.drinkId,
            drinkName: (o as any).drink?.name || `Drink ${o.drinkId}`,
            cocktailPercentage: o.cocktailPercentage,
          })),
          glassVolume: cocktail.volume,
        };
      }
    }

    // Fall back to event recipe by bar type
    const eventRecipes = await this.salesRepository.getEventRecipes(eventId, barType, cocktailName);

    if (eventRecipes.length === 0) {
      return { components: [], glassVolume: cocktail?.volume || 200 };
    }

    // Use the first recipe found (should be unique per event + cocktailName)
    const recipe = eventRecipes[0];

    return {
      components: recipe.components.map((c) => ({
        drinkId: c.drinkId,
        drinkName: (c as any).drink?.name || `Drink ${c.drinkId}`,
        cocktailPercentage: c.percentage,
      })),
      glassVolume: recipe.glassVolume,
    };
  }

  /**
   * Calculate total drink consumption for a sale
   * @param recipe Recipe components with percentages
   * @param cocktailVolume Volume of one cocktail in ml
   * @param quantity Number of cocktails sold
   */
  private calculateConsumption(
    recipe: RecipeComponent[],
    cocktailVolume: number,
    quantity: number,
  ): DrinkConsumption[] {
    return recipe.map((component) => ({
      drinkId: component.drinkId,
      drinkName: component.drinkName,
      totalMlRequired: Math.ceil(
        (cocktailVolume * component.cocktailPercentage * quantity) / 100,
      ),
    }));
  }

  /**
   * Plan stock depletions according to the event's policy.
   * Respects stock pools: direct sales deplete from sellAsWholeUnit=true,
   * recipe sales deplete from sellAsWholeUnit=false.
   * @returns List of depletions to execute
   * @throws InsufficientStockException if not enough stock
   */
  private async planDepletions(
    barId: number,
    consumption: DrinkConsumption[],
    policy: StockDepletionPolicy,
    stockPool: StockPoolType,
  ): Promise<StockDepletion[]> {
    const depletions: StockDepletion[] = [];
    const targetSellAsWholeUnit = stockPool === 'direct';

    for (const item of consumption) {
      // Get stock sorted by policy, filtered by the correct pool
      const stocks = await this.salesRepository.getStockSortedByPolicy(
        barId,
        item.drinkId,
        policy,
        targetSellAsWholeUnit,
      );

      // Calculate total available in the target pool
      const totalAvailable = stocks.reduce((sum, s) => sum + s.quantity, 0);

      if (totalAvailable < item.totalMlRequired) {
        throw new InsufficientStockException(
          item.drinkId,
          item.totalMlRequired,
          totalAvailable,
        );
      }

      // Distribute depletion across stock lots (following policy order)
      let remaining = item.totalMlRequired;

      for (const stock of stocks) {
        if (remaining <= 0) break;

        const toDeduct = Math.min(stock.quantity, remaining);
        remaining -= toDeduct;

        depletions.push({
          barId,
          drinkId: item.drinkId,
          supplierId: stock.supplierId,
          sellAsWholeUnit: stock.sellAsWholeUnit,
          quantityToDeduct: toDeduct,
        });
      }
    }

    return depletions;
  }

  /**
   * Get all sales for a bar
   */
  async findAllByBar(eventId: number, barId: number, userId: number): Promise<Sale[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.salesRepository.findByBarId(barId);
  }

  /**
   * Get a specific sale
   */
  async findOne(eventId: number, barId: number, saleId: number, userId: number): Promise<Sale> {
    await this.barsService.findOne(eventId, barId, userId);

    const sale = await this.salesRepository.findById(saleId);

    if (!sale || (sale as any).bar?.id !== barId) {
      throw new NotFoundException(`Sale with ID ${saleId} not found in bar ${barId}`);
    }

    return sale;
  }

  /**
   * Get inventory movements for a bar
   */
  async getInventoryMovements(
    eventId: number,
    barId: number,
    userId: number,
  ): Promise<InventoryMovement[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.salesRepository.getInventoryMovementsByBar(barId);
  }

  /**
   * Get inventory movements for a global inventory item
   */
  async getGlobalInventoryMovements(
    globalInventoryId: number,
    userId: number,
  ): Promise<InventoryMovement[]> {
    // Ensure the global inventory entry belongs to this user (tenant safety)
    const inv = await (this as any).salesRepository['prisma'].globalInventory.findUnique({
      where: { id: globalInventoryId },
      select: { ownerId: true },
    });

    if (!inv || inv.ownerId !== userId) {
      throw new NotOwnerException();
    }

    return this.salesRepository.getInventoryMovementsByGlobalInventory(globalInventoryId);
  }

  /**
   * Get inventory movements for a specific sale
   */
  async getSaleMovements(
    eventId: number,
    barId: number,
    saleId: number,
    userId: number,
  ): Promise<InventoryMovement[]> {
    await this.findOne(eventId, barId, saleId, userId); // Validates sale exists in bar
    return this.salesRepository.getInventoryMovementsBySale(saleId);
  }
}
