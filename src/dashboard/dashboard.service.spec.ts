import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';
import { EventsService } from '../events/events.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let repository: jest.Mocked<DashboardRepository>;
  let eventsService: jest.Mocked<EventsService>;

  const mockEvent = {
    id: 1,
    name: 'Test Event',
    ownerId: 1,
    startedAt: new Date('2026-01-01T18:00:00Z'),
    finishedAt: null,
    owner: { id: 1 },
  };

  const mockBar = {
    id: 5,
    name: 'VIP Bar',
    eventId: 1,
    event: mockEvent,
  };

  const mockSalesTotals = {
    totalAmount: 125000,
    totalUnits: 85,
    orderCount: 42,
  };

  const mockConsumptionByDrink = [
    { drinkId: 1, name: 'Vodka', totalMl: 12000 },
    { drinkId: 2, name: 'Orange Juice', totalMl: 8500 },
  ];

  const mockTimeSeries = [
    { timestamp: new Date('2026-01-01T18:00:00Z'), units: 12, amount: 19200 },
    { timestamp: new Date('2026-01-01T18:05:00Z'), units: 8, amount: 12800 },
    { timestamp: new Date('2026-01-01T18:10:00Z'), units: 15, amount: 24000 },
  ];

  const mockTopProducts = [
    { cocktailId: 1, name: 'Gin Tonic', units: 45, amount: 72000 },
    { cocktailId: 2, name: 'Mojito', units: 32, amount: 57600 },
  ];

  beforeEach(async () => {
    const mockRepository = {
      getSalesTotals: jest.fn(),
      getConsumptionByDrink: jest.fn(),
      getTotalConsumption: jest.fn(),
      getTimeSeriesSales: jest.fn(),
      getTopProducts: jest.fn(),
      getBarWithEvent: jest.fn(),
      getCocktailWithPrice: jest.fn(),
      getDrinkById: jest.fn(),
    };

    const mockEventsService = {
      findById: jest.fn(),
      findByIdWithOwner: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: DashboardRepository, useValue: mockRepository },
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    repository = module.get(DashboardRepository);
    eventsService = module.get(EventsService);
  });

  describe('getTotals', () => {
    it('should return dashboard totals for an event', async () => {
      eventsService.findById.mockResolvedValue(mockEvent as any);
      repository.getSalesTotals.mockResolvedValue(mockSalesTotals);
      repository.getConsumptionByDrink.mockResolvedValue(mockConsumptionByDrink);
      repository.getTotalConsumption.mockResolvedValue(20500);

      const result = await service.getTotals(1);

      expect(result.sales.totalAmount).toBe(125000);
      expect(result.sales.totalUnits).toBe(85);
      expect(result.sales.orderCount).toBe(42);
      expect(result.consumption.totalMl).toBe(20500);
      expect(result.consumption.byDrink.length).toBe(2);
    });

    it('should return totals for a specific bar', async () => {
      eventsService.findById.mockResolvedValue(mockEvent as any);
      repository.getBarWithEvent.mockResolvedValue(mockBar as any);
      repository.getSalesTotals.mockResolvedValue(mockSalesTotals);
      repository.getConsumptionByDrink.mockResolvedValue(mockConsumptionByDrink);
      repository.getTotalConsumption.mockResolvedValue(20500);

      const result = await service.getTotals(1, 5);

      expect(repository.getSalesTotals).toHaveBeenCalledWith(1, 5, null, null);
      expect(result.sales.totalAmount).toBe(125000);
    });

    it('should throw NotFoundException if bar not in event', async () => {
      eventsService.findById.mockResolvedValue(mockEvent as any);
      repository.getBarWithEvent.mockResolvedValue({
        ...mockBar,
        event: { ...mockEvent, id: 999 },
      } as any);

      await expect(service.getTotals(1, 5)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTimeSeries', () => {
    it('should return time-series data with default bucket', async () => {
      eventsService.findById.mockResolvedValue(mockEvent as any);
      repository.getTimeSeriesSales.mockResolvedValue(mockTimeSeries);

      const result = await service.getTimeSeries(1);

      expect(result.bucketSize).toBe('5m');
      expect(result.series.length).toBe(3);
      expect(result.series[0].units).toBe(12);
    });

    it('should use custom bucket size', async () => {
      eventsService.findById.mockResolvedValue(mockEvent as any);
      repository.getTimeSeriesSales.mockResolvedValue(mockTimeSeries);

      await service.getTimeSeries(1, null, '15m');

      expect(repository.getTimeSeriesSales).toHaveBeenCalledWith(
        1,
        null,
        '15m',
        expect.any(Date),
        expect.any(Date),
        null,
      );
    });

    it('should filter by cocktailId', async () => {
      eventsService.findById.mockResolvedValue(mockEvent as any);
      repository.getTimeSeriesSales.mockResolvedValue([mockTimeSeries[0]]);

      await service.getTimeSeries(1, null, '5m', null, null, 1);

      expect(repository.getTimeSeriesSales).toHaveBeenCalledWith(
        1,
        null,
        '5m',
        expect.any(Date),
        expect.any(Date),
        1,
      );
    });

    it('should return time-series for a specific bar', async () => {
      eventsService.findById.mockResolvedValue(mockEvent as any);
      repository.getBarWithEvent.mockResolvedValue(mockBar as any);
      repository.getTimeSeriesSales.mockResolvedValue(mockTimeSeries);

      const result = await service.getTimeSeries(1, 5);

      expect(repository.getTimeSeriesSales).toHaveBeenCalledWith(
        1,
        5,
        '5m',
        expect.any(Date),
        expect.any(Date),
        null,
      );
      expect(result.series.length).toBe(3);
    });
  });

  describe('getTopProducts', () => {
    it('should return top products for an event', async () => {
      eventsService.findById.mockResolvedValue(mockEvent as any);
      repository.getTopProducts.mockResolvedValue(mockTopProducts);

      const result = await service.getTopProducts(1);

      expect(result.products.length).toBe(2);
      expect(result.products[0].name).toBe('Gin Tonic');
      expect(result.products[0].units).toBe(45);
    });

    it('should use custom limit', async () => {
      eventsService.findById.mockResolvedValue(mockEvent as any);
      repository.getTopProducts.mockResolvedValue([mockTopProducts[0]]);

      await service.getTopProducts(1, null, 5);

      expect(repository.getTopProducts).toHaveBeenCalledWith(1, null, 5, null, null);
    });

    it('should return top products for a specific bar', async () => {
      eventsService.findById.mockResolvedValue(mockEvent as any);
      repository.getBarWithEvent.mockResolvedValue(mockBar as any);
      repository.getTopProducts.mockResolvedValue(mockTopProducts);

      const result = await service.getTopProducts(1, 5);

      expect(repository.getTopProducts).toHaveBeenCalledWith(1, 5, 10, null, null);
      expect(result.products.length).toBe(2);
    });
  });

  describe('buildSaleCreatedPayload', () => {
    it('should build correct payload with resolved price', async () => {
      const mockCocktail = {
        id: 1,
        name: 'Gin Tonic',
        price: 1500,
        resolvedPrice: 1600, // Event price
      };

      repository.getCocktailWithPrice.mockResolvedValue(mockCocktail as any);

      const event = {
        eventId: 1,
        barId: 5,
        sale: {
          id: 100,
          cocktailId: 1,
          quantity: 3,
          createdAt: new Date(),
        },
        depletions: [],
      };

      const result = await service.buildSaleCreatedPayload(event);

      expect(result.type).toBe('sale:created');
      expect(result.data.cocktailName).toBe('Gin Tonic');
      expect(result.data.totalAmount).toBe(4800); // 1600 * 3
    });
  });

  describe('validateEventAccess', () => {
    it('should return true for event owner', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);

      const result = await service.validateEventAccess(1, 1);

      expect(result).toBe(true);
    });

    it('should return false for non-owner', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);

      const result = await service.validateEventAccess(1, 999);

      expect(result).toBe(false);
    });
  });
});
