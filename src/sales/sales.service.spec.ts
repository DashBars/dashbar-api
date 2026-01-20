import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SalesService } from './sales.service';
import { SalesRepository } from './sales.repository';
import { BarsService } from '../bars/bars.service';
import { InsufficientStockException } from '../common/exceptions';
import { BarType, BarStatus, StockDepletionPolicy, OwnershipMode } from '@prisma/client';

describe('SalesService', () => {
  let service: SalesService;
  let salesRepository: jest.Mocked<SalesRepository>;
  let barsService: jest.Mocked<BarsService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockEvent = {
    id: 1,
    name: 'Test Event',
    ownerId: 1,
    stockDepletionPolicy: StockDepletionPolicy.cheapest_first,
  };

  const mockBar = {
    id: 1,
    eventId: 1,
    name: 'VIP Bar',
    type: BarType.VIP,
    status: BarStatus.open,
    event: mockEvent,
  };

  const mockCocktail = {
    id: 1,
    name: 'Screwdriver',
    price: 500,
    volume: 300, // 300ml
  };

  // Recipe: 40% vodka, 60% orange juice
  const mockEventRecipes = [
    { drinkId: 1, cocktailPercentage: 40, drink: { id: 1, name: 'Vodka' } },
    { drinkId: 2, cocktailPercentage: 60, drink: { id: 2, name: 'Orange Juice' } },
  ];

  // Stock with different costs for testing cheapest_first policy
  const mockVodkaStock = [
    { barId: 1, drinkId: 1, supplierId: 1, quantity: 500, unitCost: 3000, ownershipMode: OwnershipMode.purchased, supplier: { id: 1, name: 'Expensive Supplier' } },
    { barId: 1, drinkId: 1, supplierId: 2, quantity: 300, unitCost: 2000, ownershipMode: OwnershipMode.consignment, supplier: { id: 2, name: 'Cheap Supplier' } },
  ];

  const mockJuiceStock = [
    { barId: 1, drinkId: 2, supplierId: 3, quantity: 1000, unitCost: 500, ownershipMode: OwnershipMode.purchased, supplier: { id: 3, name: 'Juice Supplier' } },
  ];

  beforeEach(async () => {
    const mockSalesRepository = {
      getBarWithEvent: jest.fn(),
      getCocktailById: jest.fn(),
      getEventRecipes: jest.fn(),
      getBarRecipeOverrides: jest.fn(),
      getStockSortedByPolicy: jest.fn(),
      createSaleWithDepletion: jest.fn(),
      findByBarId: jest.fn(),
      findById: jest.fn(),
      getInventoryMovementsByBar: jest.fn(),
      getInventoryMovementsBySale: jest.fn(),
    };

    const mockBarsService = {
      findOne: jest.fn(),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: SalesRepository, useValue: mockSalesRepository },
        { provide: BarsService, useValue: mockBarsService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
    salesRepository = module.get(SalesRepository);
    barsService = module.get(BarsService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('createSale with base recipe (EventRecipe)', () => {
    it('should create sale and deplete stock using base recipe', async () => {
      const dto = { cocktailId: 1, quantity: 2 };

      salesRepository.getBarWithEvent.mockResolvedValue(mockBar as any);
      salesRepository.getCocktailById.mockResolvedValue(mockCocktail as any);
      salesRepository.getBarRecipeOverrides.mockResolvedValue([]); // No override
      salesRepository.getEventRecipes.mockResolvedValue(mockEventRecipes as any);
      
      // Stock sorted by cheapest_first
      salesRepository.getStockSortedByPolicy
        .mockResolvedValueOnce([mockVodkaStock[1], mockVodkaStock[0]] as any) // Vodka: cheap first
        .mockResolvedValueOnce(mockJuiceStock as any); // Juice

      salesRepository.createSaleWithDepletion.mockResolvedValue({
        id: 1,
        barId: 1,
        cocktailId: 1,
        quantity: 2,
        createdAt: new Date(),
      } as any);

      const result = await service.createSale(1, 1, dto);

      expect(result.id).toBe(1);
      expect(result.quantity).toBe(2);
      
      // Verify depletion calculation:
      // 2 cocktails * 300ml * 40% = 240ml vodka
      // 2 cocktails * 300ml * 60% = 360ml juice
      expect(salesRepository.createSaleWithDepletion).toHaveBeenCalledWith(
        1, // barId
        1, // cocktailId
        2, // quantity
        expect.arrayContaining([
          expect.objectContaining({ drinkId: 1, quantityToDeduct: 240 }), // Vodka
          expect.objectContaining({ drinkId: 2, quantityToDeduct: 360 }), // Juice
        ]),
      );
    });
  });

  describe('createSale with bar recipe override', () => {
    it('should use bar override recipe instead of base recipe', async () => {
      const dto = { cocktailId: 1, quantity: 1 };

      // VIP bar has stronger recipe: 50% vodka, 50% juice
      const vipOverride = [
        { drinkId: 1, cocktailPercentage: 50, drink: { id: 1, name: 'Vodka' } },
        { drinkId: 2, cocktailPercentage: 50, drink: { id: 2, name: 'Orange Juice' } },
      ];

      salesRepository.getBarWithEvent.mockResolvedValue(mockBar as any);
      salesRepository.getCocktailById.mockResolvedValue(mockCocktail as any);
      salesRepository.getBarRecipeOverrides.mockResolvedValue(vipOverride as any);
      // getEventRecipes should NOT be called since override exists
      
      salesRepository.getStockSortedByPolicy
        .mockResolvedValueOnce([mockVodkaStock[1], mockVodkaStock[0]] as any)
        .mockResolvedValueOnce(mockJuiceStock as any);

      salesRepository.createSaleWithDepletion.mockResolvedValue({
        id: 2,
        barId: 1,
        cocktailId: 1,
        quantity: 1,
        createdAt: new Date(),
      } as any);

      const result = await service.createSale(1, 1, dto);

      // Verify override recipe used:
      // 1 cocktail * 300ml * 50% = 150ml vodka
      // 1 cocktail * 300ml * 50% = 150ml juice
      expect(salesRepository.createSaleWithDepletion).toHaveBeenCalledWith(
        1,
        1,
        1,
        expect.arrayContaining([
          expect.objectContaining({ drinkId: 1, quantityToDeduct: 150 }),
          expect.objectContaining({ drinkId: 2, quantityToDeduct: 150 }),
        ]),
      );
    });
  });

  describe('cheapest_first depletion policy', () => {
    it('should deplete cheapest stock first', async () => {
      const dto = { cocktailId: 1, quantity: 1 };

      salesRepository.getBarWithEvent.mockResolvedValue(mockBar as any);
      salesRepository.getCocktailById.mockResolvedValue(mockCocktail as any);
      salesRepository.getBarRecipeOverrides.mockResolvedValue([]);
      salesRepository.getEventRecipes.mockResolvedValue([
        { drinkId: 1, cocktailPercentage: 100, drink: { id: 1, name: 'Vodka' } },
      ] as any);

      // Cheap supplier (id: 2) should be used first
      salesRepository.getStockSortedByPolicy.mockResolvedValue([
        mockVodkaStock[1], // Cheap: unitCost 2000
        mockVodkaStock[0], // Expensive: unitCost 3000
      ] as any);

      salesRepository.createSaleWithDepletion.mockResolvedValue({
        id: 3,
        barId: 1,
        cocktailId: 1,
        quantity: 1,
        createdAt: new Date(),
      } as any);

      await service.createSale(1, 1, dto);

      // Should deplete from cheap supplier (id: 2) first
      expect(salesRepository.createSaleWithDepletion).toHaveBeenCalledWith(
        1,
        1,
        1,
        expect.arrayContaining([
          expect.objectContaining({ supplierId: 2, quantityToDeduct: 300 }),
        ]),
      );
    });
  });

  describe('insufficient stock rejection', () => {
    it('should reject sale when stock is insufficient', async () => {
      const dto = { cocktailId: 1, quantity: 100 }; // Requires 12000ml vodka

      salesRepository.getBarWithEvent.mockResolvedValue(mockBar as any);
      salesRepository.getCocktailById.mockResolvedValue(mockCocktail as any);
      salesRepository.getBarRecipeOverrides.mockResolvedValue([]);
      salesRepository.getEventRecipes.mockResolvedValue([
        { drinkId: 1, cocktailPercentage: 40, drink: { id: 1, name: 'Vodka' } },
      ] as any);

      // Only 800ml available (500 + 300)
      salesRepository.getStockSortedByPolicy.mockResolvedValue(mockVodkaStock as any);

      await expect(service.createSale(1, 1, dto)).rejects.toThrow(
        InsufficientStockException,
      );
    });
  });

  describe('multi-item sale aggregation', () => {
    it('should correctly sum consumption when multiple lots are needed', async () => {
      const dto = { cocktailId: 1, quantity: 3 };

      salesRepository.getBarWithEvent.mockResolvedValue(mockBar as any);
      salesRepository.getCocktailById.mockResolvedValue(mockCocktail as any);
      salesRepository.getBarRecipeOverrides.mockResolvedValue([]);
      salesRepository.getEventRecipes.mockResolvedValue([
        { drinkId: 1, cocktailPercentage: 100, drink: { id: 1, name: 'Vodka' } },
      ] as any);

      // Need 900ml, have 300 from cheap + 500 from expensive
      salesRepository.getStockSortedByPolicy.mockResolvedValue([
        { barId: 1, drinkId: 1, supplierId: 2, quantity: 300, unitCost: 2000, supplier: { id: 2 } },
        { barId: 1, drinkId: 1, supplierId: 1, quantity: 600, unitCost: 3000, supplier: { id: 1 } },
      ] as any);

      salesRepository.createSaleWithDepletion.mockResolvedValue({
        id: 4,
        barId: 1,
        cocktailId: 1,
        quantity: 3,
        createdAt: new Date(),
      } as any);

      await service.createSale(1, 1, dto);

      // Should deplete 300 from cheap, 600 from expensive
      expect(salesRepository.createSaleWithDepletion).toHaveBeenCalledWith(
        1,
        1,
        3,
        [
          { barId: 1, drinkId: 1, supplierId: 2, quantityToDeduct: 300 },
          { barId: 1, drinkId: 1, supplierId: 1, quantityToDeduct: 600 },
        ],
      );
    });
  });

  describe('no recipe found', () => {
    it('should throw error when no recipe exists for cocktail', async () => {
      const dto = { cocktailId: 1, quantity: 1 };

      salesRepository.getBarWithEvent.mockResolvedValue(mockBar as any);
      salesRepository.getCocktailById.mockResolvedValue(mockCocktail as any);
      salesRepository.getBarRecipeOverrides.mockResolvedValue([]);
      salesRepository.getEventRecipes.mockResolvedValue([]);

      await expect(service.createSale(1, 1, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
