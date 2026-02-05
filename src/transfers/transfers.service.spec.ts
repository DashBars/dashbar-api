import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TransfersService } from './transfers.service';
import { TransfersRepository } from './transfers.repository';
import { EventsService } from '../events/events.service';
import { AlarmsService } from '../alarms/alarms.service';
import { TransferStatus } from '@prisma/client';
import { NotOwnerException } from '../common/exceptions';

describe('TransfersService', () => {
  let service: TransfersService;
  let repository: jest.Mocked<TransfersRepository>;
  let eventsService: jest.Mocked<EventsService>;
  let alarmsService: jest.Mocked<AlarmsService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockEvent = {
    id: 1,
    name: 'Test Event',
    ownerId: 1,
    startedAt: new Date(),
    owner: { id: 1 },
  };

  const mockBar1 = {
    id: 1,
    name: 'Bar A',
    eventId: 1,
    event: mockEvent,
  };

  const mockBar2 = {
    id: 2,
    name: 'Bar B',
    eventId: 1,
    event: mockEvent,
  };

  const mockTransfer = {
    id: 1,
    eventId: 1,
    receiverBarId: 1,
    donorBarId: 2,
    drinkId: 1,
    quantity: 200,
    status: TransferStatus.requested,
    alertId: null,
    requestedAt: new Date(),
    approvedAt: null,
    completedAt: null,
    notes: null,
    receiverBar: mockBar1,
    donorBar: mockBar2,
    event: mockEvent,
  };

  const mockStockLots = [
    { barId: 2, drinkId: 1, supplierId: 1, quantity: 500 },
    { barId: 2, drinkId: 1, supplierId: 2, quantity: 300 },
  ];

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByEvent: jest.fn(),
      updateStatus: jest.fn(),
      getStockForBarDrink: jest.fn(),
      getTotalStock: jest.fn(),
      getBarWithEvent: jest.fn(),
      completeTransfer: jest.fn(),
    };

    const mockEventsService = {
      findById: jest.fn(),
      findByIdWithOwner: jest.fn(),
      isOwner: jest.fn(),
    };

    const mockAlarmsService = {
      resolveAlert: jest.fn(),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransfersService,
        { provide: TransfersRepository, useValue: mockRepository },
        { provide: EventsService, useValue: mockEventsService },
        { provide: AlarmsService, useValue: mockAlarmsService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<TransfersService>(TransfersService);
    repository = module.get(TransfersRepository);
    eventsService = module.get(EventsService);
    alarmsService = module.get(AlarmsService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('createTransfer', () => {
    it('should create a transfer request', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.getBarWithEvent.mockResolvedValueOnce(mockBar1 as any);
      repository.getBarWithEvent.mockResolvedValueOnce(mockBar2 as any);
      repository.getTotalStock.mockResolvedValue(500); // Donor has enough
      repository.create.mockResolvedValue(mockTransfer as any);

      const result = await service.createTransfer(1, 1, {
        receiverBarId: 1,
        donorBarId: 2,
        drinkId: 1,
        quantity: 200,
      });

      expect(result.status).toBe(TransferStatus.requested);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'transfer.status_changed',
        expect.objectContaining({ status: TransferStatus.requested }),
      );
    });

    it('should reject if donor does not have enough stock', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.getBarWithEvent.mockResolvedValueOnce(mockBar1 as any);
      repository.getBarWithEvent.mockResolvedValueOnce(mockBar2 as any);
      repository.getTotalStock.mockResolvedValue(100); // Not enough

      await expect(
        service.createTransfer(1, 1, {
          receiverBarId: 1,
          donorBarId: 2,
          drinkId: 1,
          quantity: 200,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if receiver and donor are the same', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.getBarWithEvent.mockResolvedValue(mockBar1 as any);

      await expect(
        service.createTransfer(1, 1, {
          receiverBarId: 1,
          donorBarId: 1, // Same bar
          drinkId: 1,
          quantity: 200,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if user is not owner', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(false);

      await expect(
        service.createTransfer(1, 2, {
          receiverBarId: 1,
          donorBarId: 2,
          drinkId: 1,
          quantity: 200,
        }),
      ).rejects.toThrow(NotOwnerException);
    });
  });

  describe('approveTransfer', () => {
    it('should approve a requested transfer', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.findById.mockResolvedValue(mockTransfer as any);
      repository.getTotalStock.mockResolvedValue(500); // Still has enough
      repository.updateStatus.mockResolvedValue({
        ...mockTransfer,
        status: TransferStatus.approved,
        approvedAt: new Date(),
      } as any);

      const result = await service.approveTransfer(1, 1, 1);

      expect(result.status).toBe(TransferStatus.approved);
    });

    it('should reject if transfer is not in requested status', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.findById.mockResolvedValue({
        ...mockTransfer,
        status: TransferStatus.completed,
      } as any);

      await expect(service.approveTransfer(1, 1, 1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('completeTransfer', () => {
    it('should complete an approved transfer', async () => {
      const approvedTransfer = {
        ...mockTransfer,
        status: TransferStatus.approved,
        approvedAt: new Date(),
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.findById.mockResolvedValue(approvedTransfer as any);
      repository.getStockForBarDrink.mockResolvedValue(mockStockLots as any);
      repository.completeTransfer.mockResolvedValue({
        ...approvedTransfer,
        status: TransferStatus.completed,
        completedAt: new Date(),
      } as any);

      const result = await service.completeTransfer(1, 1, 1);

      expect(result.status).toBe(TransferStatus.completed);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'transfer.completed',
        expect.objectContaining({ transferId: 1 }),
      );
    });

    it('should reject if transfer is not approved', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.findById.mockResolvedValue(mockTransfer as any); // Still requested

      await expect(service.completeTransfer(1, 1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should reject if donor no longer has enough stock', async () => {
      const approvedTransfer = {
        ...mockTransfer,
        status: TransferStatus.approved,
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.findById.mockResolvedValue(approvedTransfer as any);
      repository.getStockForBarDrink.mockResolvedValue([
        { barId: 2, drinkId: 1, supplierId: 1, quantity: 50 }, // Not enough
      ] as any);

      await expect(service.completeTransfer(1, 1, 1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectTransfer', () => {
    it('should reject a requested transfer', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.findById.mockResolvedValue(mockTransfer as any);
      repository.updateStatus.mockResolvedValue({
        ...mockTransfer,
        status: TransferStatus.rejected,
      } as any);

      const result = await service.rejectTransfer(1, 1, 1);

      expect(result.status).toBe(TransferStatus.rejected);
    });
  });

  describe('cancelTransfer', () => {
    it('should cancel a requested transfer', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.findById.mockResolvedValue(mockTransfer as any);
      repository.updateStatus.mockResolvedValue({
        ...mockTransfer,
        status: TransferStatus.cancelled,
      } as any);

      const result = await service.cancelTransfer(1, 1, 1);

      expect(result.status).toBe(TransferStatus.cancelled);
    });

    it('should reject cancellation of completed transfer', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      repository.findById.mockResolvedValue({
        ...mockTransfer,
        status: TransferStatus.completed,
      } as any);

      await expect(service.cancelTransfer(1, 1, 1)).rejects.toThrow(BadRequestException);
    });
  });
});
