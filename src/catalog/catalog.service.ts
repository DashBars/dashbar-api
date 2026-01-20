import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogRepository } from './catalog.repository';
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
}

@Injectable()
export class CatalogService {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  /**
   * Get full catalog for POS
   */
  async getCatalog(eventId: number): Promise<CatalogResponse> {
    // Verify event exists
    const event = await this.catalogRepository.getEventById(eventId);
    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    // Get categories with cocktails
    const categories = await this.catalogRepository.getCategoriesWithCocktails(eventId);

    // Get event prices
    const eventPrices = await this.catalogRepository.getEventPrices(eventId);
    const priceMap = new Map(eventPrices.map((p) => [p.cocktailId, p.price]));

    // Get uncategorized cocktails
    const uncategorizedCocktails = await this.catalogRepository.getUncategorizedCocktails(eventId);

    // Transform categories
    const catalogCategories: CatalogCategory[] = categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      sortIndex: category.sortIndex,
      cocktails: category.cocktails
        .filter((cc) => (cc.cocktail as Cocktail).isActive)
        .map((cc) => this.transformCocktail(cc.cocktail as Cocktail, priceMap)),
    }));

    // Transform uncategorized
    const uncategorized: CatalogCocktail[] = uncategorizedCocktails.map((cocktail) =>
      this.transformCocktail(cocktail, priceMap),
    );

    return {
      eventId: event.id,
      eventName: event.name,
      categories: catalogCategories,
      uncategorized,
    };
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
