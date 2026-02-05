import { Test, TestingModule } from '@nestjs/testing';
import { ConsignmentService } from './consignment.service';
import { ConsignmentRepository } from './consignment.repository';
import { BarsService } from '../bars/bars.service';
import { EventsService } from '../events/events.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OwnershipMode } from '@prisma/client';

describe('ConsignmentService', () => {
  let service: ConsignmentService;
  let repository: jest.Mocked<ConsignmentRepository>;
  let barsService: jest.Mocked<BarsService>;
  let eventsService: jest.Mocked<EventsService>;

  const mockUser = { id: 1, email: 'admin@test.com', role: 'admin' };
  const mockEvent = { id: 1, name: 'Test Event', ownerId: mockUser.id };
  const mockBar = { id: 1, name: 'Bar Central', eventId: mockEvent.id };

  const mockConsignmentStock = [
    {
      barId: 1,
      drinkId: 1,
      supplierId: 1,
      quantity: 100,
      unitCost: 2500,
      currency: 'ARS',
      ownershipMode: OwnershipMode.consignment,
      receivedAt: new Date(),
      drink: { id: 1, name: 'Vodka', sku: 'DRINK-VODKA-001' },
      supplier: { id: 1, name: 'Supplier 1' },
      bar: { id: 1, name: 'Bar Central', eventId: 1 },
    },
    {
      barId: 1,
      drinkId: 2,
      supplierId: 2,
      quantity: 50,
      unitCost: 3000,
      currency: 'ARS',
      ownershipMode: OwnershipMode.consignment,
      receivedAt: new Date(),
      drink: { id: 2, name: 'Gin', sku: 'DRINK-GIN-001' },
      supplier: { id: 2, name: 'Supplier 2' },
      bar: { id: 1, name: 'Bar Central', eventId: 1 },
    },
  ];

  beforeEach(async () => {
    const mockRepository = {
      getConsignmentStockForBar: jest.fn(),
      getConsignmentStockForEvent: jest.fn(),
      getTotalInputs: jest.fn(),
      getTotalConsumption: jest.fn(),
      getTotalReturned: jest.fn(),
      getStock: jest.fn(),
      executeReturn: jest.fn(),
    };

    const mockBarsService = {
      findOne: jest.fn(),
    };

    const mockEventsService = {
      findByIdWithOwner: jest.fn(),
      isOwner: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsignmentService,
        { provide: ConsignmentRepository, useValue: mockRepository },
        { provide: BarsService, useValue: mockBarsService },
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get<ConsignmentService>(ConsignmentService);
    repository = module.get(ConsignmentRepository);
    barsService = module.get(BarsService);
    eventsService = module.get(EventsService);
  });

  describe('getReturnSummary', () => {
    it('should return consignment return summary for a bar', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockBar as any);
      repository.getConsignmentStockForBar.mockResolvedValue(mockConsignmentStock as any);
      repository.getTotalInputs.mockResolvedValue(150);
      repository.getTotalConsumption.mockResolvedValue(50);
      repository.getTotalReturned.mockResolvedValue(0);

      const result = await service.getReturnSummary(1, 1, mockUser.id);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        barId: 1,
        barName: 'Bar Central',
        supplierId: 1,
        supplierName: 'Supplier 1',
        drinkId: 1,
        drinkName: 'Vodka',
        drinkSku: 'DRINK-VODKA-001',
        currentStockQuantity: 100,
        totalReceived: 150,
        totalConsumed: 50,
        totalReturned: 0,
        quantityToReturn: 100, // System-determined: equals current stock
      });
    });

    it('should have quantityToReturn equal to currentStockQuantity', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockBar as any);
      repository.getConsignmentStockForBar.mockResolvedValue([mockConsignmentStock[0]] as any);
      repository.getTotalInputs.mockResolvedValue(200);
      repository.getTotalConsumption.mockResolvedValue(100);
      repository.getTotalReturned.mockResolvedValue(0);

      const result = await service.getReturnSummary(1, 1, mockUser.id);

      // Quantity to return is ALWAYS current stock - non-negotiable
      expect(result[0].quantityToReturn).toBe(result[0].currentStockQuantity);
      expect(result[0].quantityToReturn).toBe(100);
    });
  });

  describe('getEventReturnSummary', () => {
    it('should return event-wide summary grouped by supplier', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.getConsignmentStockForEvent.mockResolvedValue(mockConsignmentStock as any);
      repository.getTotalInputs.mockResolvedValue(100);
      repository.getTotalConsumption.mockResolvedValue(0);
      repository.getTotalReturned.mockResolvedValue(0);

      const result = await service.getEventReturnSummary(1, mockUser.id);

      expect(result.eventId).toBe(1);
      expect(result.eventName).toBe('Test Event');
      expect(result.bySupplier).toHaveLength(2); // 2 different suppliers
      expect(result.grandTotal).toBe(150); // 100 + 50
    });
  });

  describe('executeReturn', () => {
    it('should execute return with system-calculated quantity', async () => {
      const stock = {
        ...mockConsignmentStock[0],
        ownershipMode: OwnershipMode.consignment,
      };

      const mockReturn = {
        id: 1,
        stockBarId: 1,
        stockDrinkId: 1,
        stockSupplierId: 1,
        supplierId: 1,
        quantityReturned: 100,
        returnedAt: new Date(),
        performedById: mockUser.id,
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockBar as any);
      repository.getStock.mockResolvedValue(stock as any);
      repository.executeReturn.mockResolvedValue(mockReturn as any);

      const result = await service.executeReturn(1, 1, 1, 1, mockUser.id);

      expect(result.returnId).toBe(1);
      expect(result.quantityReturned).toBe(100); // System determined
      expect(result.performedById).toBe(mockUser.id);
      
      // Verify repository was called with system-calculated quantity
      expect(repository.executeReturn).toHaveBeenCalledWith(
        1, 1, 1, 100, mockUser.id, undefined
      );
    });

    it('should reject if stock is not consignment', async () => {
      const stock = {
        ...mockConsignmentStock[0],
        ownershipMode: OwnershipMode.purchased,
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockBar as any);
      repository.getStock.mockResolvedValue(stock as any);

      await expect(
        service.executeReturn(1, 1, 1, 1, mockUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if stock quantity is 0', async () => {
      const stock = {
        ...mockConsignmentStock[0],
        quantity: 0,
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockBar as any);
      repository.getStock.mockResolvedValue(stock as any);

      await expect(
        service.executeReturn(1, 1, 1, 1, mockUser.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if stock not found', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockBar as any);
      repository.getStock.mockResolvedValue(null);

      await expect(
        service.executeReturn(1, 1, 999, 1, mockUser.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('executeAllReturns', () => {
    it('should execute all pending returns for a bar', async () => {
      const mockReturn = {
        id: 1,
        stockBarId: 1,
        stockDrinkId: 1,
        stockSupplierId: 1,
        supplierId: 1,
        quantityReturned: 100,
        returnedAt: new Date(),
        performedById: mockUser.id,
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockBar as any);
      repository.getConsignmentStockForBar.mockResolvedValue(mockConsignmentStock as any);
      repository.getStock.mockResolvedValue(mockConsignmentStock[0] as any);
      repository.executeReturn.mockResolvedValue(mockReturn as any);

      const results = await service.executeAllReturns(1, 1, mockUser.id);

      expect(results.length).toBe(2); // 2 consignment items
      expect(repository.executeReturn).toHaveBeenCalledTimes(2);
    });

    it('should return empty array if no consignment stock', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockBar as any);
      repository.getConsignmentStockForBar.mockResolvedValue([]);

      const results = await service.executeAllReturns(1, 1, mockUser.id);

      expect(results).toEqual([]);
      expect(repository.executeReturn).not.toHaveBeenCalled();
    });
  });

  describe('authorization', () => {
    it('should reject if user is not event owner', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(false);

      await expect(
        service.getReturnSummary(1, 1, 999),
      ).rejects.toThrow();
    });
  });
});
