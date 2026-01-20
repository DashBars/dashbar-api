import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogRepository } from './catalog.repository';

describe('CatalogService', () => {
  let service: CatalogService;
  let repository: jest.Mocked<CatalogRepository>;

  const mockEvent = {
    id: 1,
    name: 'Test Event',
  };

  const mockCocktail1 = {
    id: 1,
    name: 'Gin Tonic',
    description: 'Classic gin and tonic',
    imageUrl: 'https://example.com/gin-tonic.jpg',
    sku: 'GT001',
    price: 1500, // Base price
    volume: 400,
    isActive: true,
    isCombo: false,
  };

  const mockCocktail2 = {
    id: 2,
    name: 'Screwdriver',
    description: 'Vodka and orange juice',
    imageUrl: null,
    sku: 'SD001',
    price: 1200,
    volume: 300,
    isActive: true,
    isCombo: false,
  };

  const mockCategory = {
    id: 1,
    eventId: 1,
    name: 'Alcoholic',
    description: 'Alcoholic drinks',
    sortIndex: 0,
    isActive: true,
    cocktails: [
      { categoryId: 1, cocktailId: 1, sortIndex: 0, cocktail: mockCocktail1 },
    ],
  };

  const mockEventPrices = [
    { id: 1, eventId: 1, cocktailId: 1, price: 1600 }, // Override price for Gin Tonic
  ];

  beforeEach(async () => {
    const mockRepository = {
      getEventById: jest.fn(),
      getCategoriesWithCocktails: jest.fn(),
      getEventPrices: jest.fn(),
      getUncategorizedCocktails: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: CatalogRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
    repository = module.get(CatalogRepository);
  });

  describe('getCatalog', () => {
    it('should return full catalog with resolved prices', async () => {
      repository.getEventById.mockResolvedValue(mockEvent as any);
      repository.getCategoriesWithCocktails.mockResolvedValue([mockCategory] as any);
      repository.getEventPrices.mockResolvedValue(mockEventPrices as any);
      repository.getUncategorizedCocktails.mockResolvedValue([mockCocktail2] as any);

      const result = await service.getCatalog(1);

      expect(result.eventId).toBe(1);
      expect(result.eventName).toBe('Test Event');
      expect(result.categories.length).toBe(1);
      expect(result.categories[0].name).toBe('Alcoholic');
      expect(result.categories[0].cocktails.length).toBe(1);
      
      // Gin Tonic should have EventPrice (1600) instead of base price (1500)
      expect(result.categories[0].cocktails[0].price).toBe(1600);
      
      // Uncategorized
      expect(result.uncategorized.length).toBe(1);
      expect(result.uncategorized[0].name).toBe('Screwdriver');
      // Screwdriver uses base price (no EventPrice)
      expect(result.uncategorized[0].price).toBe(1200);
    });

    it('should throw NotFoundException for non-existent event', async () => {
      repository.getEventById.mockResolvedValue(null);

      await expect(service.getCatalog(999)).rejects.toThrow(NotFoundException);
    });

    it('should handle empty catalog', async () => {
      repository.getEventById.mockResolvedValue(mockEvent as any);
      repository.getCategoriesWithCocktails.mockResolvedValue([]);
      repository.getEventPrices.mockResolvedValue([]);
      repository.getUncategorizedCocktails.mockResolvedValue([]);

      const result = await service.getCatalog(1);

      expect(result.categories.length).toBe(0);
      expect(result.uncategorized.length).toBe(0);
    });

    it('should filter out inactive cocktails from categories', async () => {
      const inactiveCocktail = { ...mockCocktail1, isActive: false };
      const categoryWithInactive = {
        ...mockCategory,
        cocktails: [
          { categoryId: 1, cocktailId: 1, sortIndex: 0, cocktail: inactiveCocktail },
        ],
      };

      repository.getEventById.mockResolvedValue(mockEvent as any);
      repository.getCategoriesWithCocktails.mockResolvedValue([categoryWithInactive] as any);
      repository.getEventPrices.mockResolvedValue([]);
      repository.getUncategorizedCocktails.mockResolvedValue([]);

      const result = await service.getCatalog(1);

      expect(result.categories[0].cocktails.length).toBe(0);
    });
  });

  describe('getCatalogSummary', () => {
    it('should return catalog summary with counts', async () => {
      const comboCategory = {
        ...mockCategory,
        cocktails: [
          { categoryId: 1, cocktailId: 1, sortIndex: 0, cocktail: mockCocktail1 },
          { categoryId: 1, cocktailId: 3, sortIndex: 1, cocktail: { ...mockCocktail2, id: 3, isCombo: true, isActive: true } },
        ],
      };

      repository.getEventById.mockResolvedValue(mockEvent as any);
      repository.getCategoriesWithCocktails.mockResolvedValue([comboCategory] as any);
      repository.getEventPrices.mockResolvedValue([]);
      repository.getUncategorizedCocktails.mockResolvedValue([]);

      const result = await service.getCatalogSummary(1);

      expect(result.eventId).toBe(1);
      expect(result.categoryCount).toBe(1);
      expect(result.productCount).toBe(2);
      expect(result.comboCount).toBe(1);
    });
  });
});
