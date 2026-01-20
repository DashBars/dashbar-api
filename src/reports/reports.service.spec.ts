import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsRepository } from './reports.repository';
import { EventsService } from '../events/events.service';
import { NotOwnerException } from '../common/exceptions';

describe('ReportsService', () => {
  let service: ReportsService;
  let repository: jest.Mocked<ReportsRepository>;
  let eventsService: jest.Mocked<EventsService>;

  const mockUser = { id: 1, email: 'owner@test.com', role: 'manager' };

  const mockEvent = {
    id: 1,
    name: 'Test Event',
    ownerId: 1,
    startedAt: new Date('2024-01-15T18:00:00Z'),
    finishedAt: new Date('2024-01-16T04:00:00Z'),
    owner: mockUser,
    bars: [{ id: 1, name: 'Bar A' }],
  };

  const mockReport = {
    id: 1,
    eventId: 1,
    generatedAt: new Date(),
    totalRevenue: 500000,
    totalCOGS: 150000,
    grossProfit: 350000,
    totalUnitsSold: 250,
    totalOrderCount: 200,
    topProducts: [
      { cocktailId: 1, name: 'Gin Tonic', unitsSold: 100, revenue: 200000, sharePercent: 40 },
    ],
    peakHours: [
      { hour: '2024-01-15T23:00:00Z', units: 50, revenue: 100000, orderCount: 45 },
    ],
    timeSeries: [],
    remainingStock: { totalValue: 50000, purchasedValue: 40000, consignmentValue: 10000, items: [] },
    consumptionByDrink: [],
    warnings: [],
  };

  beforeEach(async () => {
    const mockRepository = {
      upsertReport: jest.fn(),
      findByEventId: jest.fn(),
      findByOwnerId: jest.fn(),
      getEventWithOwner: jest.fn(),
      getSalesTotals: jest.fn(),
      getTopProducts: jest.fn(),
      getTimeSeriesByHour: jest.fn(),
      getPeakHours: jest.fn(),
      getRemainingStock: jest.fn(),
      getConsumptionWithCost: jest.fn(),
    };

    const mockEventsService = {
      findById: jest.fn(),
      findByIdWithOwner: jest.fn(),
      isOwner: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ReportsRepository, useValue: mockRepository },
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    repository = module.get(ReportsRepository);
    eventsService = module.get(EventsService);
  });

  describe('generateReport', () => {
    it('should generate a report for an event', async () => {
      repository.getEventWithOwner.mockResolvedValue(mockEvent as any);
      repository.getSalesTotals.mockResolvedValue({
        totalRevenue: 500000,
        totalUnits: 250,
        orderCount: 200,
      });
      repository.getTopProducts.mockResolvedValue([
        { cocktailId: 1, name: 'Gin Tonic', unitsSold: 100, revenue: 200000, sharePercent: 40 },
      ]);
      repository.getTimeSeriesByHour.mockResolvedValue([]);
      repository.getPeakHours.mockResolvedValue([
        { hour: '2024-01-15T23:00:00Z', units: 50, revenue: 100000, orderCount: 45 },
      ]);
      repository.getRemainingStock.mockResolvedValue([]);
      repository.getConsumptionWithCost.mockResolvedValue([
        { drinkId: 1, drinkName: 'Gin', totalMl: 10000, totalCost: 150000, bySupplier: [] },
      ]);
      repository.upsertReport.mockResolvedValue(mockReport as any);

      const result = await service.generateReport(1, 1);

      expect(result.totalRevenue).toBe(500000);
      expect(result.totalCOGS).toBe(150000);
      expect(result.grossProfit).toBe(350000);
      expect(repository.upsertReport).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          totalRevenue: 500000,
          totalCOGS: 150000,
          grossProfit: 350000,
        }),
      );
    });

    it('should reject if user is not owner', async () => {
      repository.getEventWithOwner.mockResolvedValue({
        ...mockEvent,
        ownerId: 2, // Different owner
      } as any);

      await expect(service.generateReport(1, 1)).rejects.toThrow(NotOwnerException);
    });

    it('should reject if event not found', async () => {
      repository.getEventWithOwner.mockResolvedValue(null);

      await expect(service.generateReport(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('should add warning if event has not finished', async () => {
      repository.getEventWithOwner.mockResolvedValue({
        ...mockEvent,
        finishedAt: null, // Event not finished
      } as any);
      repository.getSalesTotals.mockResolvedValue({ totalRevenue: 0, totalUnits: 0, orderCount: 0 });
      repository.getTopProducts.mockResolvedValue([]);
      repository.getTimeSeriesByHour.mockResolvedValue([]);
      repository.getPeakHours.mockResolvedValue([]);
      repository.getRemainingStock.mockResolvedValue([]);
      repository.getConsumptionWithCost.mockResolvedValue([]);
      repository.upsertReport.mockResolvedValue({ ...mockReport, warnings: ['Event has not finished yet. Report may be incomplete.'] } as any);

      await service.generateReport(1, 1);

      expect(repository.upsertReport).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          warnings: expect.arrayContaining(['Event has not finished yet. Report may be incomplete.']),
        }),
      );
    });

    it('should add warning if consumption has missing cost data', async () => {
      repository.getEventWithOwner.mockResolvedValue(mockEvent as any);
      repository.getSalesTotals.mockResolvedValue({ totalRevenue: 100000, totalUnits: 50, orderCount: 40 });
      repository.getTopProducts.mockResolvedValue([]);
      repository.getTimeSeriesByHour.mockResolvedValue([]);
      repository.getPeakHours.mockResolvedValue([]);
      repository.getRemainingStock.mockResolvedValue([]);
      repository.getConsumptionWithCost.mockResolvedValue([
        {
          drinkId: 1,
          drinkName: 'Vodka',
          totalMl: 5000,
          totalCost: 0,
          bySupplier: [{ supplierId: 1, supplierName: 'Supplier A', quantity: 5000, unitCost: 0, cost: 0, ownershipMode: 'purchased' as const }],
        },
      ]);
      repository.upsertReport.mockResolvedValue(mockReport as any);

      await service.generateReport(1, 1);

      expect(repository.upsertReport).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          warnings: expect.arrayContaining([
            expect.stringContaining('Missing unit cost'),
          ]),
        }),
      );
    });
  });

  describe('findByEvent', () => {
    it('should return report data for an event', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.findByEventId.mockResolvedValue(mockReport as any);

      const result = await service.findByEvent(1, 1);

      expect(result.summary.totalRevenue).toBe(500000);
      expect(result.summary.grossProfit).toBe(350000);
      expect(result.summary.marginPercent).toBe(70);
    });

    it('should reject if user is not owner', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(false);

      await expect(service.findByEvent(1, 2)).rejects.toThrow(NotOwnerException);
    });

    it('should reject if report not found', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.findByEventId.mockResolvedValue(null);

      await expect(service.findByEvent(1, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllByOwner', () => {
    it('should return all reports for a user', async () => {
      repository.findByOwnerId.mockResolvedValue([mockReport as any]);

      const result = await service.findAllByOwner(1);

      expect(result).toHaveLength(1);
      expect(result[0].eventId).toBe(1);
    });

    it('should return empty array if no reports', async () => {
      repository.findByOwnerId.mockResolvedValue([]);

      const result = await service.findAllByOwner(1);

      expect(result).toHaveLength(0);
    });
  });

  describe('hasReport', () => {
    it('should return true if report exists', async () => {
      repository.findByEventId.mockResolvedValue(mockReport as any);

      const result = await service.hasReport(1);

      expect(result).toBe(true);
    });

    it('should return false if report does not exist', async () => {
      repository.findByEventId.mockResolvedValue(null);

      const result = await service.hasReport(1);

      expect(result).toBe(false);
    });
  });
});
