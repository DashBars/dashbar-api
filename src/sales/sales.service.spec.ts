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

  // Recipe: 40% vodka, 60% orange juice (getEventRecipes returns recipe with components array)
  const mockEventRecipes = [
    {
      glassVolume: 300,
      components: [
        { drinkId: 1, percentage: 40, drink: { id: 1, name: 'Vodka' } },
        { drinkId: 2, percentage: 60, drink: { id: 2, name: 'Orange Juice' } },
      ],
    },
  ];

  // Stock with different costs for testing cheapest_first policy
  // sellAsWholeUnit=false because these are recipe ingredient stocks
  const mockVodkaStock = [
    { barId: 1, drinkId: 1, supplierId: 1, quantity: 500, unitCost: 3000, ownershipMode: OwnershipMode.purchased, sellAsWholeUnit: false, supplier: { id: 1, name: 'Expensive Supplier' } },
    { barId: 1, drinkId: 1, supplierId: 2, quantity: 300, unitCost: 2000, ownershipMode: OwnershipMode.consignment, sellAsWholeUnit: false, supplier: { id: 2, name: 'Cheap Supplier' } },
  ];

  const mockJuiceStock = [
    { barId: 1, drinkId: 2, supplierId: 3, quantity: 1000, unitCost: 500, ownershipMode: OwnershipMode.purchased, sellAsWholeUnit: false, supplier: { id: 3, name: 'Juice Supplier' } },
  ];

  beforeEach(async () => {
    const mockSalesRepository = {
      getBarWithEvent: jest.fn(),
      getCocktailById: jest.fn(),
      getCocktailByName: jest.fn(),
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
      salesRepository.getCocktailByName.mockResolvedValue(mockCocktail as any);
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
      salesRepository.getCocktailByName.mockResolvedValue(mockCocktail as any);
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
      salesRepository.getCocktailByName.mockResolvedValue(mockCocktail as any);
      salesRepository.getBarRecipeOverrides.mockResolvedValue([]);
      salesRepository.getEventRecipes.mockResolvedValue([{
        glassVolume: 300,
        components: [{ drinkId: 1, percentage: 100, drink: { id: 1, name: 'Vodka' } }],
      }] as any);

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
      salesRepository.getCocktailByName.mockResolvedValue(mockCocktail as any);
      salesRepository.getBarRecipeOverrides.mockResolvedValue([]);
      salesRepository.getEventRecipes.mockResolvedValue([{
        glassVolume: 300,
        components: [{ drinkId: 1, percentage: 40, drink: { id: 1, name: 'Vodka' } }],
      }] as any);

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
      salesRepository.getCocktailByName.mockResolvedValue(mockCocktail as any);
      salesRepository.getBarRecipeOverrides.mockResolvedValue([]);
      salesRepository.getEventRecipes.mockResolvedValue([{
        glassVolume: 300,
        components: [{ drinkId: 1, percentage: 100, drink: { id: 1, name: 'Vodka' } }],
      }] as any);

      // Need 900ml, have 300 from cheap + 500 from expensive
      salesRepository.getStockSortedByPolicy.mockResolvedValue([
        { barId: 1, drinkId: 1, supplierId: 2, quantity: 300, unitCost: 2000, sellAsWholeUnit: false, supplier: { id: 2 } },
        { barId: 1, drinkId: 1, supplierId: 1, quantity: 600, unitCost: 3000, sellAsWholeUnit: false, supplier: { id: 1 } },
      ] as any);

      salesRepository.createSaleWithDepletion.mockResolvedValue({
        id: 4,
        barId: 1,
        cocktailId: 1,
        quantity: 3,
        createdAt: new Date(),
      } as any);

      await service.createSale(1, 1, dto);

      // Should deplete 300 from cheap, 600 from expensive (recipe pool)
      expect(salesRepository.createSaleWithDepletion).toHaveBeenCalledWith(
        1,
        1,
        3,
        [
          { barId: 1, drinkId: 1, supplierId: 2, sellAsWholeUnit: false, quantityToDeduct: 300 },
          { barId: 1, drinkId: 1, supplierId: 1, sellAsWholeUnit: false, quantityToDeduct: 600 },
        ],
      );
    });
  });

  describe('no recipe found', () => {
    it('should throw error when no recipe exists for cocktail', async () => {
      const dto = { cocktailId: 1, quantity: 1 };

      salesRepository.getBarWithEvent.mockResolvedValue(mockBar as any);
      salesRepository.getCocktailById.mockResolvedValue(mockCocktail as any);
      salesRepository.getCocktailByName.mockResolvedValue(mockCocktail as any);
      salesRepository.getBarRecipeOverrides.mockResolvedValue([]);
      salesRepository.getEventRecipes.mockResolvedValue([]);

      await expect(service.createSale(1, 1, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('direct sale item with auto-generated 100% recipe', () => {
    it('should deplete stock using auto-generated 100% recipe for direct sale item', async () => {
      // Simulate a direct sale item (e.g., Coca Cola bottle)
      // Auto-generated recipe: 100% Coca Cola, glassVolume = 1000ml (bottle size)
      const cocaCocktail = {
        id: 10,
        name: 'Coca Cola',
        price: 500,
        volume: 1000, // 1L bottle
      };

      const dto = { cocktailId: 10, quantity: 1 };

      salesRepository.getBarWithEvent.mockResolvedValue(mockBar as any);
      salesRepository.getCocktailById.mockResolvedValue(cocaCocktail as any);
      salesRepository.getCocktailByName.mockResolvedValue(cocaCocktail as any);
      salesRepository.getBarRecipeOverrides.mockResolvedValue([]);
      // Auto-generated recipe has a single component with 100% of the drink
      salesRepository.getEventRecipes.mockResolvedValue([{
        glassVolume: 1000,
        components: [{ drinkId: 5, percentage: 100, drink: { id: 5, name: 'Coca Cola' } }],
      }] as any);

      // Stock in ml: 10 bottles of 1L = 10000ml (direct sale pool)
      salesRepository.getStockSortedByPolicy.mockResolvedValue([
        { barId: 1, drinkId: 5, supplierId: 1, quantity: 10000, unitCost: 500, sellAsWholeUnit: true, supplier: { id: 1 } },
      ] as any);

      salesRepository.createSaleWithDepletion.mockResolvedValue({
        id: 10,
        barId: 1,
        cocktailId: 10,
        quantity: 1,
        createdAt: new Date(),
      } as any);

      await service.createSale(1, 1, dto);

      // 1 sale of 1000ml bottle * 100% = 1000ml deducted from direct sale pool
      expect(salesRepository.createSaleWithDepletion).toHaveBeenCalledWith(
        1,
        10,
        1,
        expect.arrayContaining([
          expect.objectContaining({ drinkId: 5, quantityToDeduct: 1000, sellAsWholeUnit: true }),
        ]),
      );
    });

    it('should correctly deplete when selling multiple units of a direct sale item', async () => {
      // 5 units of Coca Cola 200ml cans
      const canCocktail = {
        id: 11,
        name: 'Coca Cola Lata',
        price: 300,
        volume: 200, // 200ml can
      };

      const dto = { cocktailId: 11, quantity: 5 };

      salesRepository.getBarWithEvent.mockResolvedValue(mockBar as any);
      salesRepository.getCocktailById.mockResolvedValue(canCocktail as any);
      salesRepository.getCocktailByName.mockResolvedValue(canCocktail as any);
      salesRepository.getBarRecipeOverrides.mockResolvedValue([]);
      salesRepository.getEventRecipes.mockResolvedValue([{
        glassVolume: 200,
        components: [{ drinkId: 6, percentage: 100, drink: { id: 6, name: 'Coca Cola Lata' } }],
      }] as any);

      // 10 cans of 200ml = 2000ml (direct sale pool)
      salesRepository.getStockSortedByPolicy.mockResolvedValue([
        { barId: 1, drinkId: 6, supplierId: 1, quantity: 2000, unitCost: 200, sellAsWholeUnit: true, supplier: { id: 1 } },
      ] as any);

      salesRepository.createSaleWithDepletion.mockResolvedValue({
        id: 11,
        barId: 1,
        cocktailId: 11,
        quantity: 5,
        createdAt: new Date(),
      } as any);

      await service.createSale(1, 1, dto);

      // 5 cans * 200ml * 100% = 1000ml
      expect(salesRepository.createSaleWithDepletion).toHaveBeenCalledWith(
        1,
        11,
        5,
        expect.arrayContaining([
          expect.objectContaining({ drinkId: 6, quantityToDeduct: 1000 }),
        ]),
      );
    });
  });

  describe('separated stock pools: recipe sale uses recipe stock only', () => {
    it('should deplete only from recipe stock (sellAsWholeUnit=false) when selling a cocktail', async () => {
      // Scenario: Coca Cola exists as both direct sale AND recipe ingredient.
      // Cuba Libre recipe should only consume from the recipe pool (sellAsWholeUnit=false).
      const cubaLibreCocktail = {
        id: 20,
        name: 'Cuba Libre',
        price: 800,
        volume: 300, // 300ml glass
      };

      const dto = { cocktailId: 20, quantity: 2 };

      salesRepository.getBarWithEvent.mockResolvedValue(mockBar as any);
      salesRepository.getCocktailById.mockResolvedValue(cubaLibreCocktail as any);
      salesRepository.getCocktailByName.mockResolvedValue(cubaLibreCocktail as any);
      salesRepository.getBarRecipeOverrides.mockResolvedValue([]);
      // Cuba Libre: 40% Ron + 60% Coca Cola
      salesRepository.getEventRecipes.mockResolvedValue([{
        glassVolume: 300,
        components: [
          { drinkId: 7, percentage: 40, drink: { id: 7, name: 'Ron' } },
          { drinkId: 5, percentage: 60, drink: { id: 5, name: 'Coca Cola' } },
        ],
      }] as any);

      // Only recipe stock (sellAsWholeUnit=false) should be returned
      // Ron stock: 5 bottles of 750ml = 3750ml (recipe pool)
      // Coca Cola stock: 10 bottles of 1L = 10000ml (recipe pool)
      salesRepository.getStockSortedByPolicy
        .mockResolvedValueOnce([
          { barId: 1, drinkId: 7, supplierId: 1, quantity: 3750, unitCost: 5000, sellAsWholeUnit: false, supplier: { id: 1 } },
        ] as any) // Ron (recipe pool)
        .mockResolvedValueOnce([
          { barId: 1, drinkId: 5, supplierId: 2, quantity: 10000, unitCost: 500, sellAsWholeUnit: false, supplier: { id: 2 } },
        ] as any); // Coca Cola (recipe pool)

      salesRepository.createSaleWithDepletion.mockResolvedValue({
        id: 20,
        barId: 1,
        cocktailId: 20,
        quantity: 2,
        createdAt: new Date(),
      } as any);

      await service.createSale(1, 1, dto);

      // 2 Cuba Libres:
      // Ron: 300ml * 40% * 2 = 240ml
      // Coca Cola: 300ml * 60% * 2 = 360ml
      expect(salesRepository.createSaleWithDepletion).toHaveBeenCalledWith(
        1,
        20,
        2,
        expect.arrayContaining([
          expect.objectContaining({ drinkId: 7, quantityToDeduct: 240 }), // Ron
          expect.objectContaining({ drinkId: 5, quantityToDeduct: 360 }), // Coca Cola from shared pool
        ]),
      );
    });
  });
});
