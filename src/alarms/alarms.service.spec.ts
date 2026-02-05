import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlarmsService } from './alarms.service';
import { AlarmsRepository } from './alarms.repository';
import { EventsService } from '../events/events.service';
import { AlertType, AlertStatus } from '@prisma/client';
import { NotOwnerException } from '../common/exceptions';

describe('AlarmsService', () => {
  let service: AlarmsService;
  let repository: jest.Mocked<AlarmsRepository>;
  let eventsService: jest.Mocked<EventsService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockEvent = {
    id: 1,
    name: 'Test Event',
    ownerId: 1,
    startedAt: new Date(),
    owner: { id: 1 },
  };

  const mockDrink = {
    id: 1,
    name: 'Vodka',
    brand: 'Test',
    volume: 750,
    value: 5000,
  };

  const mockThreshold = {
    id: 1,
    eventId: 1,
    drinkId: 1,
    lowerThreshold: 500,
    donationThreshold: 1000,
    depletionHorizonMin: 30,
  };

  const mockAlert = {
    id: 1,
    eventId: 1,
    barId: 1,
    drinkId: 1,
    type: AlertType.low_stock,
    status: AlertStatus.active,
    currentStock: 300,
    threshold: 500,
    suggestedDonors: [],
    externalNeeded: true,
    projectedMinutes: null,
    createdAt: new Date(),
    resolvedAt: null,
  };

  beforeEach(async () => {
    const mockRepository = {
      createThreshold: jest.fn(),
      findThresholdsByEvent: jest.fn(),
      findThresholdByEventAndDrink: jest.fn(),
      updateThreshold: jest.fn(),
      deleteThreshold: jest.fn(),
      createAlert: jest.fn(),
      findAlertsByEvent: jest.fn(),
      findAlertById: jest.fn(),
      findActiveAlertForBarDrink: jest.fn(),
      updateAlertStatus: jest.fn(),
      getTotalStockForBarDrink: jest.fn(),
      getBarsWithStockForDrink: jest.fn(),
      getConsumptionRate: jest.fn(),
      getDrinkById: jest.fn(),
      getBarWithEvent: jest.fn(),
    };

    const mockEventsService = {
      findById: jest.fn(),
      findByIdWithOwner: jest.fn(),
      isOwner: jest.fn(),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlarmsService,
        { provide: AlarmsRepository, useValue: mockRepository },
        { provide: EventsService, useValue: mockEventsService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<AlarmsService>(AlarmsService);
    repository = module.get(AlarmsRepository);
    eventsService = module.get(EventsService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('createThreshold', () => {
    it('should create a threshold', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.getDrinkById.mockResolvedValue(mockDrink as any);
      repository.findThresholdByEventAndDrink.mockResolvedValue(null);
      repository.createThreshold.mockResolvedValue(mockThreshold as any);

      const result = await service.createThreshold(1, 1, {
        drinkId: 1,
        lowerThreshold: 500,
        donationThreshold: 1000,
      });

      expect(result.lowerThreshold).toBe(500);
      expect(result.donationThreshold).toBe(1000);
    });

    it('should reject if donation threshold < lower threshold', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.getDrinkById.mockResolvedValue(mockDrink as any);

      await expect(
        service.createThreshold(1, 1, {
          drinkId: 1,
          lowerThreshold: 1000,
          donationThreshold: 500, // Less than lower
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if user is not owner', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(false);

      await expect(
        service.createThreshold(1, 2, {
          drinkId: 1,
          lowerThreshold: 500,
          donationThreshold: 1000,
        }),
      ).rejects.toThrow(NotOwnerException);
    });

    it('should reject if drink not found', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.getDrinkById.mockResolvedValue(null);

      await expect(
        service.createThreshold(1, 1, {
          drinkId: 999,
          lowerThreshold: 500,
          donationThreshold: 1000,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkThresholdsAfterSale', () => {
    it('should create alert when stock is below threshold', async () => {
      repository.findThresholdByEventAndDrink.mockResolvedValue(mockThreshold as any);
      repository.getTotalStockForBarDrink.mockResolvedValue(300); // Below 500 threshold
      repository.findActiveAlertForBarDrink.mockResolvedValue(null);
      repository.getBarsWithStockForDrink.mockResolvedValue([
        { id: 2, name: 'Bar B', totalStock: 1500 }, // Has surplus
      ]);
      repository.getDrinkById.mockResolvedValue(mockDrink as any);
      repository.createAlert.mockResolvedValue(mockAlert as any);

      await service.checkThresholdsAfterSale(1, 1, [1]);

      expect(repository.createAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 1,
          barId: 1,
          drinkId: 1,
          type: AlertType.low_stock,
          currentStock: 300,
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'alert.created',
        expect.objectContaining({ type: 'low_stock' }),
      );
    });

    it('should not create duplicate alert', async () => {
      repository.findThresholdByEventAndDrink.mockResolvedValue(mockThreshold as any);
      repository.getTotalStockForBarDrink.mockResolvedValue(300);
      repository.findActiveAlertForBarDrink.mockResolvedValue(mockAlert as any); // Already exists

      await service.checkThresholdsAfterSale(1, 1, [1]);

      expect(repository.createAlert).not.toHaveBeenCalled();
    });

    it('should mark externalNeeded when no donors available', async () => {
      repository.findThresholdByEventAndDrink.mockResolvedValue(mockThreshold as any);
      repository.getTotalStockForBarDrink.mockResolvedValue(300);
      repository.findActiveAlertForBarDrink.mockResolvedValue(null);
      repository.getBarsWithStockForDrink.mockResolvedValue([
        { id: 1, name: 'Bar A', totalStock: 300 }, // Same bar
        { id: 2, name: 'Bar B', totalStock: 800 }, // Below donation threshold
      ]);
      repository.getDrinkById.mockResolvedValue(mockDrink as any);
      repository.createAlert.mockResolvedValue({ ...mockAlert, externalNeeded: true } as any);

      await service.checkThresholdsAfterSale(1, 1, [1]);

      expect(repository.createAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          externalNeeded: true,
          suggestedDonors: [],
        }),
      );
    });

    it('should suggest donors with surplus stock', async () => {
      repository.findThresholdByEventAndDrink.mockResolvedValue(mockThreshold as any);
      repository.getTotalStockForBarDrink.mockResolvedValue(300);
      repository.findActiveAlertForBarDrink.mockResolvedValue(null);
      repository.getBarsWithStockForDrink.mockResolvedValue([
        { id: 1, name: 'Bar A', totalStock: 300 }, // Same bar (excluded)
        { id: 2, name: 'Bar B', totalStock: 1500 }, // Surplus: 1500 - 1000 = 500
        { id: 3, name: 'Bar C', totalStock: 1200 }, // Surplus: 1200 - 1000 = 200
      ]);
      repository.getDrinkById.mockResolvedValue(mockDrink as any);
      repository.createAlert.mockResolvedValue(mockAlert as any);

      await service.checkThresholdsAfterSale(1, 1, [1]);

      expect(repository.createAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          externalNeeded: false,
          suggestedDonors: expect.arrayContaining([
            expect.objectContaining({ barId: 2, availableSurplus: 500 }),
            expect.objectContaining({ barId: 3, availableSurplus: 200 }),
          ]),
        }),
      );
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge an active alert', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.findAlertById.mockResolvedValue({
        ...mockAlert,
        event: mockEvent,
      } as any);
      repository.updateAlertStatus.mockResolvedValue({
        ...mockAlert,
        status: AlertStatus.acknowledged,
      } as any);

      const result = await service.acknowledgeAlert(1, 1, 1);

      expect(result.status).toBe(AlertStatus.acknowledged);
    });

    it('should reject if alert is not active', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.findAlertById.mockResolvedValue({
        ...mockAlert,
        status: AlertStatus.resolved,
        event: mockEvent,
      } as any);

      await expect(service.acknowledgeAlert(1, 1, 1)).rejects.toThrow(BadRequestException);
    });
  });
});
