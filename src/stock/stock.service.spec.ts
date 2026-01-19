import { Test, TestingModule } from '@nestjs/testing';
import { StockService } from './stock.service';
import { StockRepository } from './stock.repository';
import { BarsService } from '../bars/bars.service';
import { EventsService } from '../events/events.service';
import { NotOwnerException } from '../common/exceptions';
import { BarType, BarStatus } from '@prisma/client';

describe('StockService', () => {
  let service: StockService;
  let stockRepository: jest.Mocked<StockRepository>;
  let barsService: jest.Mocked<BarsService>;
  let eventsService: jest.Mocked<EventsService>;

  const mockEvent = {
    id: 1,
    name: 'Test Event',
    ownerId: 1,
    owner: { id: 1 },
  };

  const mockBar1 = { id: 1, eventId: 1, name: 'VIP Bar 1', type: BarType.VIP, status: BarStatus.open };
  const mockBar2 = { id: 2, eventId: 1, name: 'General Bar', type: BarType.general, status: BarStatus.open };

  beforeEach(async () => {
    const mockStockRepository = {
      findByBarId: jest.fn(),
      findByDrinkIdAndBarIds: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      findDrinkById: jest.fn(),
    };

    const mockBarsService = {
      findOne: jest.fn(),
      findAllByEvent: jest.fn(),
    };

    const mockEventsService = {
      findByIdWithOwner: jest.fn(),
      isOwner: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: StockRepository, useValue: mockStockRepository },
        { provide: BarsService, useValue: mockBarsService },
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get<StockService>(StockService);
    stockRepository = module.get(StockRepository);
    barsService = module.get(BarsService);
    eventsService = module.get(EventsService);
  });

  describe('findAllByBar', () => {
    it('should return stock for a specific bar', async () => {
      const mockStock = [
        { barId: 1, drinkId: 1, amount: 100 },
        { barId: 1, drinkId: 2, amount: 50 },
      ];

      barsService.findOne.mockResolvedValue(mockBar1 as any);
      stockRepository.findByBarId.mockResolvedValue(mockStock as any);

      const result = await service.findAllByBar(1, 1);

      expect(result).toEqual(mockStock);
    });
  });

  describe('upsert', () => {
    it('should upsert stock for a bar', async () => {
      const dto = { drinkId: 1, amount: 100 };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockBar1 as any);
      stockRepository.findDrinkById.mockResolvedValue({ id: 1 } as any);
      stockRepository.upsert.mockResolvedValue({
        barId: 1,
        drinkId: 1,
        amount: 100,
      } as any);

      const result = await service.upsert(1, 1, 1, dto);

      expect(result.amount).toBe(100);
    });

    it('should throw NotOwnerException when user is not owner', async () => {
      const dto = { drinkId: 1, amount: 100 };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(false);

      await expect(service.upsert(1, 1, 2, dto)).rejects.toThrow(NotOwnerException);
    });
  });

  describe('independent stock per bar', () => {
    it('should allow different stock levels for same product in different bars', async () => {
      // Bar 1 has 100 units of drink 1
      const bar1Stock = [{ barId: 1, drinkId: 1, amount: 100 }];
      // Bar 2 has 50 units of drink 1
      const bar2Stock = [{ barId: 2, drinkId: 1, amount: 50 }];

      barsService.findOne
        .mockResolvedValueOnce(mockBar1 as any)
        .mockResolvedValueOnce(mockBar2 as any);
      stockRepository.findByBarId
        .mockResolvedValueOnce(bar1Stock as any)
        .mockResolvedValueOnce(bar2Stock as any);

      const result1 = await service.findAllByBar(1, 1);
      const result2 = await service.findAllByBar(1, 2);

      expect(result1[0].amount).toBe(100);
      expect(result2[0].amount).toBe(50);
      expect(result1[0].drinkId).toBe(result2[0].drinkId);
    });
  });

  describe('getStockByDrinkAcrossEvent', () => {
    it('should return stock for a drink across all bars in event', async () => {
      const mockBars = [mockBar1, mockBar2];
      const mockStocks = [
        { barId: 1, drinkId: 1, amount: 100, bar: { id: 1, name: 'VIP Bar 1' } },
        { barId: 2, drinkId: 1, amount: 50, bar: { id: 2, name: 'General Bar' } },
      ];

      barsService.findAllByEvent.mockResolvedValue(mockBars as any);
      stockRepository.findByDrinkIdAndBarIds.mockResolvedValue(mockStocks as any);

      const result = await service.getStockByDrinkAcrossEvent(1, 1);

      expect(result.length).toBe(2);
      expect(result[0].barName).toBe('VIP Bar 1');
      expect(result[0].amount).toBe(100);
      expect(result[1].barName).toBe('General Bar');
      expect(result[1].amount).toBe(50);
    });
  });
});
