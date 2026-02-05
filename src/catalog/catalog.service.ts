import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogRepository, CatalogProduct } from './catalog.repository';
import { Cocktail } from '@prisma/client';

interface CatalogCocktail {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sku: string | null;
  price: number; // Resolved price (EventPrice or base price)
  volume: number;
  isCombo: boolean;
}

interface CatalogCategory {
  id: number;
  name: string;
  description: string | null;
  sortIndex: number;
  cocktails: CatalogCocktail[];
}

export interface CatalogResponse {
  eventId: number;
  eventName: string;
  categories: CatalogCategory[];
  uncategorized: CatalogCocktail[];
  // New: products for POS (filtered by bar)
  products?: CatalogProduct[];
}

@Injectable()
export class CatalogService {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  /**
   * Get full catalog for POS. When barId is provided, returns products filtered for that bar.
   * Products come from EventProduct (created when recipes are marked as "producto final").
   * If no EventProducts exist, falls back to cocktails filtered by recipe bar types.
   */
  async getCatalog(eventId: number, barId?: number): Promise<CatalogResponse> {
    const event = await this.catalogRepository.getEventById(eventId);
    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    // Get products for the bar (or all event products if no barId)
    const products = barId != null
      ? await this.catalogRepository.getProductsForBar(eventId, barId)
      : await this.catalogRepository.getAllEventProducts(eventId);

    // Get bar type for filtering cocktails
    let barType: string | null = null;
    let allowedCocktailNames: Set<string> | null = null;
    
    if (barId != null) {
      const bar = await this.catalogRepository.getBarById(barId);
      if (bar) {
        barType = bar.type;
        // Get cocktail names that have recipes for this bar type
        const names = await this.catalogRepository.getCocktailNamesForBarType(eventId, barType);
        if (names.length > 0) {
          allowedCocktailNames = new Set(names.map(n => n.toLowerCase()));
        }
      }
    }

    // Get categories for backwards compatibility
    const categories = await this.catalogRepository.getCategoriesWithCocktails(eventId);
    const eventPrices = await this.catalogRepository.getEventPrices(eventId, barId);
    const priceMap = this.buildPriceMap(eventPrices, barId);

    const uncategorizedCocktails = await this.catalogRepository.getUncategorizedCocktails(eventId);

    // Transform categories - filter cocktails by bar type if applicable
    const catalogCategories: CatalogCategory[] = categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      sortIndex: category.sortIndex,
      cocktails: category.cocktails
        .filter((cc) => {
          const cocktail = cc.cocktail as Cocktail;
          if (!cocktail.isActive) return false;
          // If we have bar type filtering, only include cocktails with matching recipes
          if (allowedCocktailNames !== null) {
            return allowedCocktailNames.has(cocktail.name.toLowerCase());
          }
          return true;
        })
        .map((cc) => this.transformCocktail(cc.cocktail as Cocktail, priceMap)),
    }));

    // Transform uncategorized - also filter by bar type if applicable
    const uncategorized: CatalogCocktail[] = uncategorizedCocktails
      .filter((cocktail) => {
        if (allowedCocktailNames !== null) {
          return allowedCocktailNames.has(cocktail.name.toLowerCase());
        }
        return true;
      })
      .map((cocktail) => this.transformCocktail(cocktail, priceMap));

    return {
      eventId: event.id,
      eventName: event.name,
      categories: catalogCategories,
      uncategorized,
      products, // EventProducts filtered by bar
    };
  }

  /**
   * Build cocktailId -> price map: bar override wins, then event-level, then base price not used here (handled in transform).
   */
  private buildPriceMap(
    eventPrices: Array<{ cocktailId: number; barId: number | null; price: number }>,
    barId?: number,
  ): Map<number, number> {
    const map = new Map<number, number>();
    const barOverrides = barId != null
      ? eventPrices.filter((p) => p.barId === barId)
      : [];
    const eventLevel = eventPrices.filter((p) => p.barId == null);
    for (const p of barOverrides) {
      map.set(p.cocktailId, p.price);
    }
    for (const p of eventLevel) {
      if (!map.has(p.cocktailId)) {
        map.set(p.cocktailId, p.price);
      }
    }
    return map;
  }

  /**
   * Transform a cocktail to catalog format with resolved price
   */
  private transformCocktail(
    cocktail: Cocktail,
    priceMap: Map<number, number>,
  ): CatalogCocktail {
    return {
      id: cocktail.id,
      name: cocktail.name,
      description: cocktail.description,
      imageUrl: cocktail.imageUrl,
      sku: cocktail.sku,
      price: priceMap.get(cocktail.id) ?? cocktail.price, // EventPrice or base price
      volume: cocktail.volume,
      isCombo: cocktail.isCombo,
    };
  }

  /**
   * Get catalog summary (counts only)
   */
  async getCatalogSummary(eventId: number): Promise<{
    eventId: number;
    categoryCount: number;
    productCount: number;
    comboCount: number;
  }> {
    const catalog = await this.getCatalog(eventId);

    let productCount = 0;
    let comboCount = 0;

    for (const category of catalog.categories) {
      for (const cocktail of category.cocktails) {
        productCount++;
        if (cocktail.isCombo) comboCount++;
      }
    }

    for (const cocktail of catalog.uncategorized) {
      productCount++;
      if (cocktail.isCombo) comboCount++;
    }

    return {
      eventId,
      categoryCount: catalog.categories.length,
      productCount,
      comboCount,
    };
  }
}
