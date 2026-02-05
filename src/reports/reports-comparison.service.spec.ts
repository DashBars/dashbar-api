import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsRepository } from './reports.repository';
import { EventsService } from '../events/events.service';
import { NotOwnerException } from '../common/exceptions';

describe('ReportsService - Comparison', () => {
  let service: ReportsService;
  let repository: jest.Mocked<ReportsRepository>;
  let eventsService: jest.Mocked<EventsService>;

  const mockUser = { id: 1, email: 'owner@test.com', role: 'manager' };

  const createMockReport = (eventId: number, eventName: string, overrides = {}) => ({
    id: eventId,
    eventId,
    generatedAt: new Date(),
    totalRevenue: 500000,
    totalCOGS: 150000,
    grossProfit: 350000,
    totalUnitsSold: 250,
    totalOrderCount: 200,
    topProducts: [
      { cocktailId: 1, name: 'Gin Tonic', unitsSold: 100, revenue: 200000, sharePercent: 40 },
      { cocktailId: 2, name: 'Mojito', unitsSold: 80, revenue: 160000, sharePercent: 32 },
    ],
    peakHours: [
      { hour: '2024-01-15T01:00:00.000Z', units: 50, revenue: 100000, orderCount: 45 },
    ],
    timeSeries: [
      { timestamp: new Date('2024-01-15T22:00:00Z'), units: 30, amount: 60000 },
      { timestamp: new Date('2024-01-15T23:00:00Z'), units: 40, amount: 80000 },
    ],
    remainingStock: { totalValue: 50000, purchasedValue: 40000, consignmentValue: 10000, items: [] },
    consumptionByDrink: [],
    warnings: [],
    event: {
      id: eventId,
      name: eventName,
      ownerId: 1,
      startedAt: new Date('2024-01-15T18:00:00Z'),
      finishedAt: new Date('2024-01-16T02:00:00Z'), // 8 hours
    },
    ...overrides,
  });

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
      findEligibleEventsForComparison: jest.fn(),
      findReportsByEventIds: jest.fn(),
      validateEventsOwnership: jest.fn(),
      getEventsByIds: jest.fn(),
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

  describe('findEligibleForComparison', () => {
    it('should return eligible events for comparison', async () => {
      const eligibleEvents = [
        { eventId: 1, eventName: 'Event 1', startedAt: new Date(), finishedAt: new Date(), durationHours: 8, hasReport: true },
        { eventId: 2, eventName: 'Event 2', startedAt: new Date(), finishedAt: new Date(), durationHours: 6, hasReport: true },
      ];
      repository.findEligibleEventsForComparison.mockResolvedValue(eligibleEvents);

      const result = await service.findEligibleForComparison(1);

      expect(result).toHaveLength(2);
      expect(repository.findEligibleEventsForComparison).toHaveBeenCalledWith(1);
    });
  });

  describe('generateComparison', () => {
    it('should generate comparison for owned events', async () => {
      const report1 = createMockReport(1, 'Summer Festival');
      const report2 = createMockReport(2, 'Winter Party', {
        totalRevenue: 400000,
        totalCOGS: 100000,
        grossProfit: 300000,
        totalUnitsSold: 200,
        totalOrderCount: 160,
        event: {
          id: 2,
          name: 'Winter Party',
          ownerId: 1,
          startedAt: new Date('2024-02-15T20:00:00Z'),
          finishedAt: new Date('2024-02-16T02:00:00Z'), // 6 hours
        },
      });

      repository.validateEventsOwnership.mockResolvedValue(true);
      repository.findReportsByEventIds.mockResolvedValue([report1, report2] as any);

      const result = await service.generateComparison([1, 2], 1);

      expect(result.eventIds).toEqual([1, 2]);
      expect(result.eventComparison).toHaveLength(2);
      expect(result.crossEventProducts.length).toBeGreaterThan(0);
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should reject if user does not own all events', async () => {
      repository.validateEventsOwnership.mockResolvedValue(false);

      await expect(service.generateComparison([1, 2], 1)).rejects.toThrow(
        NotOwnerException,
      );
    });

    it('should reject if some events are missing reports', async () => {
      repository.validateEventsOwnership.mockResolvedValue(true);
      repository.findReportsByEventIds.mockResolvedValue([
        createMockReport(1, 'Event 1'),
      ] as any); // Only 1 report for 2 events

      await expect(service.generateComparison([1, 2], 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should calculate normalized metrics correctly', async () => {
      // Event 1: 8 hours, 500000 revenue -> 62500/hr
      const report1 = createMockReport(1, 'Event 1');
      // Event 2: 6 hours, 600000 revenue -> 100000/hr
      const report2 = createMockReport(2, 'Event 2', {
        totalRevenue: 600000,
        event: {
          id: 2,
          name: 'Event 2',
          ownerId: 1,
          startedAt: new Date('2024-02-15T20:00:00Z'),
          finishedAt: new Date('2024-02-16T02:00:00Z'), // 6 hours
        },
      });

      repository.validateEventsOwnership.mockResolvedValue(true);
      repository.findReportsByEventIds.mockResolvedValue([report1, report2] as any);

      const result = await service.generateComparison([1, 2], 1);

      const event1Row = result.eventComparison.find((e) => e.eventId === 1);
      const event2Row = result.eventComparison.find((e) => e.eventId === 2);

      expect(event1Row?.durationHours).toBe(8);
      expect(event1Row?.revenuePerHour).toBe(62500);

      expect(event2Row?.durationHours).toBe(6);
      expect(event2Row?.revenuePerHour).toBe(100000);
    });

    it('should identify products appearing in multiple events', async () => {
      const report1 = createMockReport(1, 'Event 1');
      const report2 = createMockReport(2, 'Event 2', {
        topProducts: [
          { cocktailId: 1, name: 'Gin Tonic', unitsSold: 120, revenue: 240000, sharePercent: 45 },
          { cocktailId: 3, name: 'Fernet', unitsSold: 60, revenue: 120000, sharePercent: 25 },
        ],
      });

      repository.validateEventsOwnership.mockResolvedValue(true);
      repository.findReportsByEventIds.mockResolvedValue([report1, report2] as any);

      const result = await service.generateComparison([1, 2], 1);

      // Gin Tonic appears in both events
      const ginTonic = result.crossEventProducts.find((p) => p.cocktailId === 1);
      expect(ginTonic?.eventsAppeared).toBe(2);
      expect(ginTonic?.byEvent).toHaveLength(2);
    });

    it('should detect peak time patterns', async () => {
      // Both events have peak at 01:00
      const report1 = createMockReport(1, 'Event 1');
      const report2 = createMockReport(2, 'Event 2');

      repository.validateEventsOwnership.mockResolvedValue(true);
      repository.findReportsByEventIds.mockResolvedValue([report1, report2] as any);

      const result = await service.generateComparison([1, 2], 1);

      const peakAt1AM = result.peakTimePatterns.find((p) => p.hourOfDay === 1);
      expect(peakAt1AM?.eventsWithPeak).toBe(2);
    });

    it('should generate consistent top product insight', async () => {
      const report1 = createMockReport(1, 'Event 1');
      const report2 = createMockReport(2, 'Event 2');

      repository.validateEventsOwnership.mockResolvedValue(true);
      repository.findReportsByEventIds.mockResolvedValue([report1, report2] as any);

      const result = await service.generateComparison([1, 2], 1);

      const productInsights = result.insights.filter(
        (i) => i.type === 'consistent_top_product',
      );
      expect(productInsights.length).toBeGreaterThan(0);
      expect(productInsights[0].message).toContain('Gin Tonic');
    });

    it('should generate peak time pattern insight', async () => {
      const report1 = createMockReport(1, 'Event 1');
      const report2 = createMockReport(2, 'Event 2');

      repository.validateEventsOwnership.mockResolvedValue(true);
      repository.findReportsByEventIds.mockResolvedValue([report1, report2] as any);

      const result = await service.generateComparison([1, 2], 1);

      const peakInsights = result.insights.filter(
        (i) => i.type === 'peak_time_pattern',
      );
      expect(peakInsights.length).toBeGreaterThan(0);
      expect(peakInsights[0].message).toContain('01:00');
    });

    it('should detect margin outliers', async () => {
      // Event 1: 70% margin (350000/500000)
      const report1 = createMockReport(1, 'Event 1');
      // Event 2: 25% margin (100000/400000) - outlier
      const report2 = createMockReport(2, 'Event 2', {
        totalRevenue: 400000,
        totalCOGS: 300000,
        grossProfit: 100000,
      });

      repository.validateEventsOwnership.mockResolvedValue(true);
      repository.findReportsByEventIds.mockResolvedValue([report1, report2] as any);

      const result = await service.generateComparison([1, 2], 1);

      const marginInsights = result.insights.filter(
        (i) => i.type === 'margin_outlier',
      );
      expect(marginInsights.length).toBeGreaterThan(0);
    });

    it('should detect volume outliers', async () => {
      // Event 1: 250 units / 8 hours = 31.25 units/hr
      const report1 = createMockReport(1, 'Event 1');
      // Event 2: 800 units / 6 hours = 133 units/hr - outlier (>2x)
      const report2 = createMockReport(2, 'Event 2', {
        totalUnitsSold: 800,
        event: {
          id: 2,
          name: 'Event 2',
          ownerId: 1,
          startedAt: new Date('2024-02-15T20:00:00Z'),
          finishedAt: new Date('2024-02-16T02:00:00Z'), // 6 hours
        },
      });

      repository.validateEventsOwnership.mockResolvedValue(true);
      repository.findReportsByEventIds.mockResolvedValue([report1, report2] as any);

      const result = await service.generateComparison([1, 2], 1);

      const volumeInsights = result.insights.filter(
        (i) => i.type === 'volume_outlier',
      );
      expect(volumeInsights.length).toBeGreaterThan(0);
      // Could be high or low volume depending on which event is the outlier
      const hasVolumeMessage = volumeInsights.some(
        (i) => i.message.includes('high volume') || i.message.includes('low volume'),
      );
      expect(hasVolumeMessage).toBe(true);
    });

    it('should include time series for each event', async () => {
      const report1 = createMockReport(1, 'Event 1');
      const report2 = createMockReport(2, 'Event 2');

      repository.validateEventsOwnership.mockResolvedValue(true);
      repository.findReportsByEventIds.mockResolvedValue([report1, report2] as any);

      const result = await service.generateComparison([1, 2], 1);

      expect(result.timeSeriesByEvent).toHaveLength(2);
      expect(result.timeSeriesByEvent[0].series).toBeDefined();
    });
  });
});
