import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CatalogProductComponent {
  drinkId: number;
  drinkName: string;
  drinkBrand: string;
  percentage: number;
}

export interface CatalogProduct {
  id: number;
  name: string;
  price: number;
  isCombo: boolean;
  barId: number | null;
  // Recipe details
  glassVolume?: number;
  hasIce?: boolean;
  components?: CatalogProductComponent[];
}

@Injectable()
export class CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all active categories with their cocktails for an event
   */
  async getCategoriesWithCocktails(eventId: number) {
    return this.prisma.category.findMany({
      where: {
        eventId,
        isActive: true,
      },
      include: {
        cocktails: {
          include: {
            cocktail: true,
          },
          orderBy: { sortIndex: 'asc' },
        },
      },
      orderBy: { sortIndex: 'asc' },
    });
  }

  /**
   * Get prices for catalog: event-level (barId null) and optionally bar overrides (barId set).
   * When barId is provided, returns both so service can merge (bar override wins).
   */
  async getEventPrices(eventId: number, barId?: number) {
    if (barId == null) {
      return this.prisma.eventPrice.findMany({
        where: { eventId, barId: null },
      });
    }
    return this.prisma.eventPrice.findMany({
      where: { eventId, OR: [{ barId: null }, { barId }] },
    });
  }

  /**
   * Get all active cocktails for an event
   */
  async getActiveCocktails(eventId?: number) {
    return this.prisma.cocktail.findMany({
      where: { 
        isActive: true,
        // Filter by eventId if provided, otherwise include legacy global cocktails
        ...(eventId != null ? { eventId } : {}),
      },
    });
  }

  /**
   * Get cocktails that are not in any category for this event
   */
  async getUncategorizedCocktails(eventId: number) {
    // Get all cocktail IDs in categories for this event
    const categorizedCocktails = await this.prisma.cocktailCategory.findMany({
      where: {
        category: {
          eventId,
          isActive: true,
        },
      },
      select: { cocktailId: true },
    });

    const categorizedIds = categorizedCocktails.map((c) => c.cocktailId);

    // Get all active cocktails for this event not in any category
    return this.prisma.cocktail.findMany({
      where: {
        isActive: true,
        eventId, // Only cocktails scoped to this event
        id: categorizedIds.length > 0 ? { notIn: categorizedIds } : undefined,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get event by ID
   */
  async getEventById(eventId: number) {
    return this.prisma.event.findUnique({
      where: { id: eventId },
    });
  }

  /**
   * Get bar by ID with its type
   */
  async getBarById(barId: number) {
    return this.prisma.bar.findUnique({
      where: { id: barId },
      select: { id: true, name: true, type: true },
    });
  }

  /**
   * Get cocktail names that have recipes assigned to a specific bar type
   */
  async getCocktailNamesForBarType(eventId: number, barType: string): Promise<string[]> {
    const recipes = await this.prisma.eventRecipe.findMany({
      where: {
        eventId,
        barTypes: {
          some: {
            barType: barType as any,
          },
        },
      },
      select: {
        cocktailName: true,
      },
    });
    return recipes.map(r => r.cocktailName);
  }

  /**
   * Get products available for a specific bar.
   * Returns products that either:
   * - Are bar-specific (barId matches), OR
   * - Are event-wide AND have a recipe assigned to this bar's type
   * Includes recipe details (components with percentages) for each product.
   */
  async getProductsForBar(eventId: number, barId: number): Promise<CatalogProduct[]> {
    // First, get the bar's type
    const bar = await this.prisma.bar.findUnique({
      where: { id: barId },
      select: { type: true },
    });
    
    if (!bar) {
      return [];
    }
    
    const barType = bar.type;

    // Get recipes that are assigned to this bar type (to filter products)
    const recipesForBarType = await this.prisma.eventRecipe.findMany({
      where: {
        eventId,
        barTypes: {
          some: {
            barType: barType as any,
          },
        },
      },
      include: {
        components: {
          include: {
            drink: {
              select: {
                id: true,
                name: true,
                brand: true,
              },
            },
          },
        },
      },
    });

    // Create a set of cocktail names allowed for this bar type
    const allowedCocktailNames = new Set(
      recipesForBarType.map(r => r.cocktailName.toLowerCase())
    );
    
    // Create a map of recipe name -> recipe details for this bar type
    const recipeMap = new Map(
      recipesForBarType.map(r => [r.cocktailName.toLowerCase(), r])
    );

    // Get ALL recipe names for this event (regardless of bar type)
    // This is needed to distinguish "no recipe at all" (direct sale item)
    // from "has recipe but not for this bar type" (should be excluded)
    const allEventRecipes = await this.prisma.eventRecipe.findMany({
      where: { eventId },
      select: { cocktailName: true },
    });
    const allRecipeNames = new Set(
      allEventRecipes.map(r => r.cocktailName.toLowerCase())
    );

    // Get bar-specific products first
    const barProducts = await this.prisma.eventProduct.findMany({
      where: { eventId, barId },
      select: {
        id: true,
        name: true,
        price: true,
        isCombo: true,
        barId: true,
      },
      orderBy: { name: 'asc' },
    });

    // Get event-wide products
    const barProductNames = barProducts.map(p => p.name);
    
    const eventWideProducts = await this.prisma.eventProduct.findMany({
      where: { 
        eventId, 
        barId: null,
        // Exclude products that have a bar-specific override for this bar
        name: barProductNames.length > 0 ? { notIn: barProductNames } : undefined,
      },
      select: {
        id: true,
        name: true,
        price: true,
        isCombo: true,
        barId: true,
      },
      orderBy: { name: 'asc' },
    });

    // Combine and filter products
    const allProducts = [...barProducts, ...eventWideProducts];
    
    // Filter: only include products that either:
    // 1. Are bar-specific (already filtered by barId), OR
    // 2. Have a recipe assigned to this bar type, OR
    // 3. Don't have any recipe in the entire event (direct sale items)
    const filteredProducts = allProducts.filter(product => {
      // Bar-specific products are always included
      if (product.barId === barId) {
        return true;
      }
      
      const productNameLower = product.name.toLowerCase();
      
      // Check if there's ANY recipe for this product in the event
      const hasAnyRecipe = allRecipeNames.has(productNameLower);
      
      // If no recipe exists anywhere in the event, it's a direct sale item - include it
      if (!hasAnyRecipe) {
        return true;
      }
      
      // Recipe exists — only include if it's assigned to THIS bar type
      return allowedCocktailNames.has(productNameLower);
    });

    // Sort and enrich products with recipe details
    return filteredProducts
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(product => {
        const recipe = recipeMap.get(product.name.toLowerCase());
        if (recipe) {
          return {
            ...product,
            glassVolume: recipe.glassVolume,
            hasIce: recipe.hasIce,
            components: recipe.components.map(c => ({
              drinkId: c.drinkId,
              drinkName: c.drink.name,
              drinkBrand: c.drink.brand,
              percentage: c.percentage,
            })),
          };
        }
        return product;
      });
  }

  /**
   * Get all products for an event (no bar filtering)
   * Includes recipe details (components with percentages) for each product.
   */
  async getAllEventProducts(eventId: number): Promise<CatalogProduct[]> {
    const products = await this.prisma.eventProduct.findMany({
      where: { eventId, barId: null },
      select: {
        id: true,
        name: true,
        price: true,
        isCombo: true,
        barId: true,
      },
      orderBy: { name: 'asc' },
    });

    // Get recipes for these products to include components
    const productNames = products.map(p => p.name);
    const recipes = await this.prisma.eventRecipe.findMany({
      where: {
        eventId,
        cocktailName: { in: productNames },
      },
      include: {
        components: {
          include: {
            drink: {
              select: {
                id: true,
                name: true,
                brand: true,
              },
            },
          },
        },
      },
    });

    // Create a map of recipe name -> recipe details
    const recipeMap = new Map(recipes.map(r => [r.cocktailName.toLowerCase(), r]));

    // Enrich products with recipe details
    return products.map(product => {
      const recipe = recipeMap.get(product.name.toLowerCase());
      if (recipe) {
        return {
          ...product,
          glassVolume: recipe.glassVolume,
          hasIce: recipe.hasIce,
          components: recipe.components.map(c => ({
            drinkId: c.drinkId,
            drinkName: c.drink.name,
            drinkBrand: c.drink.brand,
            percentage: c.percentage,
          })),
        };
      }
      return product;
    });
  }
}
