import { Test, TestingModule } from '@nestjs/testing';
import { BarsService } from './bars.service';
import { BarsRepository } from './bars.repository';
import { EventsService } from '../events/events.service';
import { NotOwnerException } from '../common/exceptions';
import { BarType, BarStatus } from '@prisma/client';

describe('BarsService', () => {
  let service: BarsService;
  let barsRepository: jest.Mocked<BarsRepository>;
  let eventsService: jest.Mocked<EventsService>;

  const mockEvent = {
    id: 1,
    name: 'Test Event',
    description: null,
    startedAt: new Date('2030-01-01T00:00:00Z'),
    finishedAt: null,
    ownerId: 1,
    venueId: 1,
    owner: { id: 1 },
  };

  beforeEach(async () => {
    const mockBarsRepository = {
      create: jest.fn(),
      findByEventId: jest.fn(),
      findByEventIdAndBarId: jest.fn(),
      findByEventIdAndType: jest.fn(),
      findDistinctTypesByEventId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const mockEventsService = {
      findById: jest.fn(),
      findByIdWithOwner: jest.fn(),
      isOwner: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BarsService,
        { provide: BarsRepository, useValue: mockBarsRepository },
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get<BarsService>(BarsService);
    barsRepository = module.get(BarsRepository);
    eventsService = module.get(EventsService);
  });

  describe('create', () => {
    it('should create a bar under an event', async () => {
      const dto = {
        name: 'VIP Bar 1',
        type: BarType.VIP,
        status: BarStatus.closed,
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsRepository.create.mockResolvedValue({
        id: 1,
        eventId: 1,
        ...dto,
      });

      const result = await service.create(1, 1, dto);

      expect(result).toBeDefined();
      expect(result.name).toBe('VIP Bar 1');
      expect(result.type).toBe(BarType.VIP);
    });

    it('should throw NotOwnerException when user is not owner', async () => {
      const dto = {
        name: 'VIP Bar 1',
        type: BarType.VIP,
        status: BarStatus.closed,
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(false);

      await expect(service.create(1, 2, dto)).rejects.toThrow(NotOwnerException);
    });
  });

  describe('findAllByEvent', () => {
    it('should return multiple bars for the same event', async () => {
      const mockBars = [
        { id: 1, eventId: 1, name: 'VIP Bar 1', type: BarType.VIP },
        { id: 2, eventId: 1, name: 'VIP Bar 2', type: BarType.VIP },
        { id: 3, eventId: 1, name: 'General Bar', type: BarType.general },
      ];

      eventsService.findById.mockResolvedValue(mockEvent as any);
      barsRepository.findByEventId.mockResolvedValue(mockBars as any);

      const result = await service.findAllByEvent(1);

      expect(result).toEqual(mockBars);
      expect(result.length).toBe(3);
    });

    it('should return bars with same and different bar types', async () => {
      const mockBars = [
        { id: 1, eventId: 1, name: 'VIP Bar 1', type: BarType.VIP },
        { id: 2, eventId: 1, name: 'VIP Bar 2', type: BarType.VIP },
        { id: 3, eventId: 1, name: 'General Bar', type: BarType.general },
        { id: 4, eventId: 1, name: 'Backstage Bar', type: BarType.backstage },
      ];

      eventsService.findById.mockResolvedValue(mockEvent as any);
      barsRepository.findByEventId.mockResolvedValue(mockBars as any);

      const result = await service.findAllByEvent(1);

      const vipBars = result.filter((b) => b.type === BarType.VIP);
      const generalBars = result.filter((b) => b.type === BarType.general);
      const backstageBars = result.filter((b) => b.type === BarType.backstage);

      expect(vipBars.length).toBe(2);
      expect(generalBars.length).toBe(1);
      expect(backstageBars.length).toBe(1);
    });
  });

  describe('getBarTypesInEvent', () => {
    it('should return all distinct bar types used in an event', async () => {
      const mockTypes = [BarType.VIP, BarType.general, BarType.backstage];

      barsRepository.findDistinctTypesByEventId.mockResolvedValue(mockTypes);

      const result = await service.getBarTypesInEvent(1);

      expect(result).toContain(BarType.VIP);
      expect(result).toContain(BarType.general);
      expect(result).toContain(BarType.backstage);
    });
  });
});
