import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockRepository } from './stock.repository';
import { BarsService } from '../bars/bars.service';
import { EventsService } from '../events/events.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { NotOwnerException } from '../common/exceptions';
import { BarType, BarStatus, OwnershipMode } from '@prisma/client';

describe('StockService', () => {
  let service: StockService;
  let stockRepository: jest.Mocked<StockRepository>;
  let barsService: jest.Mocked<BarsService>;
  let eventsService: jest.Mocked<EventsService>;
  let suppliersService: jest.Mocked<SuppliersService>;

  const mockEvent = {
    id: 1,
    name: 'Test Event',
    ownerId: 1,
    owner: { id: 1 },
  };

  const mockBar1 = { id: 1, eventId: 1, name: 'VIP Bar 1', type: BarType.VIP, status: BarStatus.open };
  const mockBar2 = { id: 2, eventId: 1, name: 'General Bar', type: BarType.general, status: BarStatus.open };

  const mockSupplier1 = { id: 1, name: 'Supplier 1', ownerId: 1 };
  const mockSupplier2 = { id: 2, name: 'Supplier 2', ownerId: 1 };

  beforeEach(async () => {
    const mockStockRepository = {
      findByBarId: jest.fn(),
      findByBarIdDrinkIdAndSupplierId: jest.fn(),
      findByDrinkIdAndBarIds: jest.fn(),
      upsert: jest.fn(),
      updateQuantity: jest.fn(),
      delete: jest.fn(),
      findDrinkById: jest.fn(),
      getStockSummaryByBar: jest.fn(),
      getStockBySupplier: jest.fn(),
      getConsignmentStock: jest.fn(),
      createConsignmentReturn: jest.fn(),
      getConsignmentReturnsByBar: jest.fn(),
    };

    const mockBarsService = {
      findOne: jest.fn(),
      findAllByEvent: jest.fn(),
    };

    const mockEventsService = {
      findByIdWithOwner: jest.fn(),
      isOwner: jest.fn(),
    };

    const mockSuppliersService = {
      validateOwnership: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: StockRepository, useValue: mockStockRepository },
        { provide: BarsService, useValue: mockBarsService },
        { provide: EventsService, useValue: mockEventsService },
        { provide: SuppliersService, useValue: mockSuppliersService },
      ],
    }).compile();

    service = module.get<StockService>(StockService);
    stockRepository = module.get(StockRepository);
    barsService = module.get(BarsService);
    eventsService = module.get(EventsService);
    suppliersService = module.get(SuppliersService);
  });

  describe('findAllByBar', () => {
    it('should return stock for a specific bar', async () => {
      const mockStock = [
        { barId: 1, drinkId: 1, supplierId: 1, quantity: 100, unitCost: 2500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
        { barId: 1, drinkId: 2, supplierId: 1, quantity: 50, unitCost: 3000, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      ];

      barsService.findOne.mockResolvedValue(mockBar1 as any);
      stockRepository.findByBarId.mockResolvedValue(mockStock as any);

      const result = await service.findAllByBar(1, 1);

      expect(result).toEqual(mockStock);
    });
  });

  describe('upsert', () => {
    it('should upsert stock for a bar with supplier', async () => {
      const dto = {
        drinkId: 1,
        supplierId: 1,
        quantity: 100,
        unitCost: 2500,
        currency: 'ARS',
        ownershipMode: OwnershipMode.purchased,
      };

      const expectedStock = {
        barId: 1,
        drinkId: 1,
        supplierId: 1,
        quantity: 100,
        unitCost: 2500,
        currency: 'ARS',
        ownershipMode: OwnershipMode.purchased,
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockBar1 as any);
      stockRepository.findDrinkById.mockResolvedValue({ id: 1 } as any);
      suppliersService.validateOwnership.mockResolvedValue(mockSupplier1 as any);
      stockRepository.upsert.mockResolvedValue(expectedStock as any);

      const result = await service.upsert(1, 1, 1, dto);

      expect(result.quantity).toBe(100);
      expect(result.supplierId).toBe(1);
    });

    it('should throw NotOwnerException when user is not owner', async () => {
      const dto = {
        drinkId: 1,
        supplierId: 1,
        quantity: 100,
        unitCost: 2500,
        ownershipMode: OwnershipMode.purchased,
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(false);

      await expect(service.upsert(1, 1, 2, dto)).rejects.toThrow(NotOwnerException);
    });
  });

  describe('same product from different suppliers in same bar', () => {
    it('should allow same product from two different suppliers in the same bar', async () => {
      // Same drink (id: 1) from two different suppliers in the same bar
      const stockFromSupplier1 = {
        barId: 1,
        drinkId: 1,
        supplierId: 1,
        quantity: 50,
        unitCost: 2500,
        currency: 'ARS',
        ownershipMode: OwnershipMode.purchased,
      };

      const stockFromSupplier2 = {
        barId: 1,
        drinkId: 1,
        supplierId: 2,
        quantity: 30,
        unitCost: 2400,
        currency: 'ARS',
        ownershipMode: OwnershipMode.consignment,
      };

      const mockBarStock = [stockFromSupplier1, stockFromSupplier2];

      barsService.findOne.mockResolvedValue(mockBar1 as any);
      stockRepository.findByBarId.mockResolvedValue(mockBarStock as any);

      const result = await service.findAllByBar(1, 1);

      // Both entries exist for the same drink
      expect(result.length).toBe(2);
      expect(result[0].drinkId).toBe(result[1].drinkId);
      expect(result[0].supplierId).not.toBe(result[1].supplierId);
      
      // Total quantity would be 80 (50 + 30)
      const totalQuantity = result.reduce((sum, s) => sum + s.quantity, 0);
      expect(totalQuantity).toBe(80);
    });
  });

  describe('consignment return', () => {
    it('should allow returning consignment stock within limits', async () => {
      const consignmentStock = {
        barId: 1,
        drinkId: 1,
        supplierId: 2,
        quantity: 30,
        unitCost: 2400,
        currency: 'ARS',
        ownershipMode: OwnershipMode.consignment,
      };

      const returnDto = {
        drinkId: 1,
        supplierId: 2,
        quantityReturned: 10,
        notes: 'End of event return',
      };

      const expectedReturn = {
        id: 1,
        stockBarId: 1,
        stockDrinkId: 1,
        stockSupplierId: 2,
        supplierId: 2,
        quantityReturned: 10,
        notes: 'End of event return',
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockBar1 as any);
      suppliersService.validateOwnership.mockResolvedValue(mockSupplier2 as any);
      stockRepository.findByBarIdDrinkIdAndSupplierId.mockResolvedValue(consignmentStock as any);
      stockRepository.updateQuantity.mockResolvedValue({ ...consignmentStock, quantity: 20 } as any);
      stockRepository.createConsignmentReturn.mockResolvedValue(expectedReturn as any);

      const result = await service.createConsignmentReturn(1, 1, 1, returnDto);

      expect(result.quantityReturned).toBe(10);
      expect(stockRepository.updateQuantity).toHaveBeenCalledWith(1, 1, 2, 20);
    });

    it('should reject over-return of consignment stock', async () => {
      const consignmentStock = {
        barId: 1,
        drinkId: 1,
        supplierId: 2,
        quantity: 10,
        unitCost: 2400,
        currency: 'ARS',
        ownershipMode: OwnershipMode.consignment,
      };

      const returnDto = {
        drinkId: 1,
        supplierId: 2,
        quantityReturned: 15, // More than available (10)
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockBar1 as any);
      suppliersService.validateOwnership.mockResolvedValue(mockSupplier2 as any);
      stockRepository.findByBarIdDrinkIdAndSupplierId.mockResolvedValue(consignmentStock as any);

      await expect(service.createConsignmentReturn(1, 1, 1, returnDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject return on purchased stock', async () => {
      const purchasedStock = {
        barId: 1,
        drinkId: 1,
        supplierId: 1,
        quantity: 50,
        unitCost: 2500,
        currency: 'ARS',
        ownershipMode: OwnershipMode.purchased, // Not consignment
      };

      const returnDto = {
        drinkId: 1,
        supplierId: 1,
        quantityReturned: 10,
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockBar1 as any);
      suppliersService.validateOwnership.mockResolvedValue(mockSupplier1 as any);
      stockRepository.findByBarIdDrinkIdAndSupplierId.mockResolvedValue(purchasedStock as any);

      await expect(service.createConsignmentReturn(1, 1, 1, returnDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getStockByDrinkAcrossEvent', () => {
    it('should return stock for a drink across all bars in event with supplier info', async () => {
      const mockBars = [mockBar1, mockBar2];
      const mockStocks = [
        { barId: 1, drinkId: 1, supplierId: 1, quantity: 100, bar: { id: 1, name: 'VIP Bar 1' }, supplier: { id: 1, name: 'Supplier 1' } },
        { barId: 2, drinkId: 1, supplierId: 1, quantity: 50, bar: { id: 2, name: 'General Bar' }, supplier: { id: 1, name: 'Supplier 1' } },
      ];

      barsService.findAllByEvent.mockResolvedValue(mockBars as any);
      stockRepository.findByDrinkIdAndBarIds.mockResolvedValue(mockStocks as any);

      const result = await service.getStockByDrinkAcrossEvent(1, 1);

      expect(result.length).toBe(2);
      expect(result[0].barName).toBe('VIP Bar 1');
      expect(result[0].quantity).toBe(100);
      expect(result[0].supplierName).toBe('Supplier 1');
      expect(result[1].barName).toBe('General Bar');
      expect(result[1].quantity).toBe(50);
    });
  });
});
