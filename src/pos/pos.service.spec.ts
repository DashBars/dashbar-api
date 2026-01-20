import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { POSService } from './pos.service';
import { CatalogService, CatalogResponse } from '../catalog/catalog.service';
import { SalesService } from '../sales/sales.service';
import { BarsService } from '../bars/bars.service';
import { BarType, BarStatus } from '@prisma/client';

describe('POSService', () => {
  let service: POSService;
  let catalogService: jest.Mocked<CatalogService>;
  let salesService: jest.Mocked<SalesService>;
  let barsService: jest.Mocked<BarsService>;

  const mockBar = {
    id: 1,
    name: 'Bar Principal',
    type: BarType.general,
    status: BarStatus.open,
    eventId: 1,
  };

  const mockCatalog: CatalogResponse = {
    eventId: 1,
    eventName: 'Test Event',
    categories: [
      {
        id: 1,
        name: 'Alcoholic',
        description: 'Bebidas con alcohol',
        sortIndex: 0,
        cocktails: [
          {
            id: 1,
            name: 'Gin Tonic',
            description: 'Gin premium con tónica',
            imageUrl: null,
            sku: 'GT001',
            price: 2000,
            volume: 400,
            isCombo: false,
          },
          {
            id: 2,
            name: 'Cuba Libre',
            description: 'Ron con coca cola',
            imageUrl: null,
            sku: 'CUBA001',
            price: 1500,
            volume: 350,
            isCombo: false,
          },
        ],
      },
      {
        id: 2,
        name: 'Non-Alcoholic',
        description: 'Bebidas sin alcohol',
        sortIndex: 1,
        cocktails: [
          {
            id: 3,
            name: 'Agua Mineral',
            description: 'Agua mineral 500ml',
            imageUrl: null,
            sku: 'AGUA001',
            price: 500,
            volume: 500,
            isCombo: false,
          },
        ],
      },
    ],
    uncategorized: [],
  };

  beforeEach(async () => {
    const mockCatalogService = {
      getCatalog: jest.fn(),
    };

    const mockSalesService = {
      createSale: jest.fn(),
    };

    const mockBarsService = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        POSService,
        { provide: CatalogService, useValue: mockCatalogService },
        { provide: SalesService, useValue: mockSalesService },
        { provide: BarsService, useValue: mockBarsService },
      ],
    }).compile();

    service = module.get<POSService>(POSService);
    catalogService = module.get(CatalogService);
    salesService = module.get(SalesService);
    barsService = module.get(BarsService);
  });

  describe('getCatalog', () => {
    it('should return catalog from CatalogService', async () => {
      catalogService.getCatalog.mockResolvedValue(mockCatalog);

      const result = await service.getCatalog(1);

      expect(result).toEqual(mockCatalog);
      expect(catalogService.getCatalog).toHaveBeenCalledWith(1);
    });
  });

  describe('checkout', () => {
    it('should process checkout with multiple items and return receipt', async () => {
      barsService.findOne.mockResolvedValue(mockBar);
      catalogService.getCatalog.mockResolvedValue(mockCatalog);
      salesService.createSale.mockResolvedValue({
        id: 1,
        barId: 1,
        cocktailId: 1,
        quantity: 2,
        createdAt: new Date(),
        depletions: [],
      } as any);

      const dto = {
        barId: 1,
        items: [
          { cocktailId: 1, quantity: 2 }, // Gin Tonic x 2 = 4000
          { cocktailId: 2, quantity: 1 }, // Cuba Libre x 1 = 1500
        ],
      };

      const result = await service.checkout(1, dto);

      expect(result.orderId).toMatch(/^POS-/);
      expect(result.eventId).toBe(1);
      expect(result.barId).toBe(1);
      expect(result.barName).toBe('Bar Principal');
      expect(result.lines).toHaveLength(2);
      expect(result.itemCount).toBe(3); // 2 + 1
      expect(result.subtotal).toBe(5500); // 4000 + 1500
      expect(result.total).toBe(5500);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should calculate totals server-side correctly', async () => {
      barsService.findOne.mockResolvedValue(mockBar);
      catalogService.getCatalog.mockResolvedValue(mockCatalog);
      salesService.createSale.mockResolvedValue({
        id: 1,
        barId: 1,
        cocktailId: 1,
        quantity: 3,
        createdAt: new Date(),
        depletions: [],
      } as any);

      const dto = {
        barId: 1,
        items: [
          { cocktailId: 1, quantity: 3 }, // Gin Tonic @ 2000 x 3 = 6000
          { cocktailId: 3, quantity: 5 }, // Agua Mineral @ 500 x 5 = 2500
        ],
      };

      const result = await service.checkout(1, dto);

      expect(result.lines[0].unitPrice).toBe(2000);
      expect(result.lines[0].lineTotal).toBe(6000);
      expect(result.lines[1].unitPrice).toBe(500);
      expect(result.lines[1].lineTotal).toBe(2500);
      expect(result.itemCount).toBe(8);
      expect(result.total).toBe(8500);
    });

    it('should throw NotFoundException when bar not found', async () => {
      barsService.findOne.mockRejectedValue(
        new NotFoundException('Bar with ID 999 not found in event 1'),
      );

      const dto = {
        barId: 999,
        items: [{ cocktailId: 1, quantity: 1 }],
      };

      await expect(service.checkout(1, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when cocktail not in catalog', async () => {
      barsService.findOne.mockResolvedValue(mockBar);
      catalogService.getCatalog.mockResolvedValue(mockCatalog);

      const dto = {
        barId: 1,
        items: [{ cocktailId: 999, quantity: 1 }],
      };

      await expect(service.checkout(1, dto)).rejects.toThrow(BadRequestException);
      await expect(service.checkout(1, dto)).rejects.toThrow(
        'Cocktail with ID 999 not found in catalog',
      );
    });

    it('should create individual sales for each item', async () => {
      barsService.findOne.mockResolvedValue(mockBar);
      catalogService.getCatalog.mockResolvedValue(mockCatalog);
      salesService.createSale.mockResolvedValue({
        id: 1,
        barId: 1,
        cocktailId: 1,
        quantity: 1,
        createdAt: new Date(),
        depletions: [],
      } as any);

      const dto = {
        barId: 1,
        items: [
          { cocktailId: 1, quantity: 2 },
          { cocktailId: 2, quantity: 3 },
        ],
      };

      await service.checkout(1, dto);

      expect(salesService.createSale).toHaveBeenCalledTimes(2);
      expect(salesService.createSale).toHaveBeenNthCalledWith(1, 1, 1, {
        cocktailId: 1,
        quantity: 2,
      });
      expect(salesService.createSale).toHaveBeenNthCalledWith(2, 1, 1, {
        cocktailId: 2,
        quantity: 3,
      });
    });

    it('should propagate stock errors from SalesService', async () => {
      barsService.findOne.mockResolvedValue(mockBar);
      catalogService.getCatalog.mockResolvedValue(mockCatalog);
      salesService.createSale.mockRejectedValue(
        new Error('Insufficient stock for drink 1'),
      );

      const dto = {
        barId: 1,
        items: [{ cocktailId: 1, quantity: 100 }],
      };

      await expect(service.checkout(1, dto)).rejects.toThrow('Insufficient stock');
    });

    it('should include cocktail names from catalog in receipt lines', async () => {
      barsService.findOne.mockResolvedValue(mockBar);
      catalogService.getCatalog.mockResolvedValue(mockCatalog);
      salesService.createSale.mockResolvedValue({
        id: 1,
        barId: 1,
        cocktailId: 1,
        quantity: 1,
        createdAt: new Date(),
        depletions: [],
      } as any);

      const dto = {
        barId: 1,
        items: [
          { cocktailId: 1, quantity: 1 },
          { cocktailId: 2, quantity: 1 },
        ],
      };

      const result = await service.checkout(1, dto);

      expect(result.lines[0].name).toBe('Gin Tonic');
      expect(result.lines[1].name).toBe('Cuba Libre');
    });

    it('should include uncategorized cocktails in price lookup', async () => {
      const catalogWithUncategorized: CatalogResponse = {
        ...mockCatalog,
        uncategorized: [
          {
            id: 10,
            name: 'Special Drink',
            description: 'A special drink',
            imageUrl: null,
            sku: 'SPEC001',
            price: 3000,
            volume: 300,
            isCombo: false,
          },
        ],
      };

      barsService.findOne.mockResolvedValue(mockBar);
      catalogService.getCatalog.mockResolvedValue(catalogWithUncategorized);
      salesService.createSale.mockResolvedValue({
        id: 1,
        barId: 1,
        cocktailId: 10,
        quantity: 1,
        createdAt: new Date(),
        depletions: [],
      } as any);

      const dto = {
        barId: 1,
        items: [{ cocktailId: 10, quantity: 2 }],
      };

      const result = await service.checkout(1, dto);

      expect(result.lines[0].name).toBe('Special Drink');
      expect(result.lines[0].unitPrice).toBe(3000);
      expect(result.lines[0].lineTotal).toBe(6000);
    });
  });
});
