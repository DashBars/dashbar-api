import { Test, TestingModule } from '@nestjs/testing';
import { PricesService } from './prices.service';
import { PricesRepository } from './prices.repository';
import { EventsService } from '../events/events.service';
import { BarsService } from '../bars/bars.service';
import { NotOwnerException } from '../common/exceptions';

describe('PricesService', () => {
  let service: PricesService;
  let pricesRepository: jest.Mocked<PricesRepository>;
  let eventsService: jest.Mocked<EventsService>;

  const mockEvent = {
    id: 1,
    name: 'Test Event',
    description: null,
    startedAt: new Date('2030-01-01T00:00:00Z'), // Future date
    finishedAt: null,
    ownerId: 1,
    venueId: 1,
    owner: { id: 1 },
  };

  const mockStartedEvent = {
    ...mockEvent,
    startedAt: new Date('2020-01-01T00:00:00Z'), // Past date
  };

  beforeEach(async () => {
    const mockPricesRepository = {
      findById: jest.fn(),
      findByEventIdAndPriceId: jest.fn(),
      findByEventId: jest.fn(),
      findByEventIdAndCocktailId: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findCocktailById: jest.fn(),
    };

    const mockEventsService = {
      findById: jest.fn(),
      findByIdWithOwner: jest.fn(),
      isOwner: jest.fn(),
    };

    const mockBarsService = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricesService,
        { provide: PricesRepository, useValue: mockPricesRepository },
        { provide: EventsService, useValue: mockEventsService },
        { provide: BarsService, useValue: mockBarsService },
      ],
    }).compile();

    service = module.get<PricesService>(PricesService);
    pricesRepository = module.get(PricesRepository);
    eventsService = module.get(EventsService);
  });

  describe('upsert', () => {
    it('should create/update a price before event starts', async () => {
      const dto = { cocktailId: 1, price: 1000 };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      pricesRepository.findCocktailById.mockResolvedValue({ id: 1 } as any);
      pricesRepository.upsert.mockResolvedValue({
        id: 1,
        eventId: 1,
        ...dto,
      } as any);

      const result = await service.upsert(1, 1, dto);

      expect(result).toBeDefined();
      expect(result.price).toBe(1000);
    });

    it('should create/update a price when event has started', async () => {
      const dto = { cocktailId: 1, price: 1000 };

      eventsService.findByIdWithOwner.mockResolvedValue(mockStartedEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      pricesRepository.findCocktailById.mockResolvedValue({ id: 1 } as any);
      pricesRepository.upsert.mockResolvedValue({
        id: 1,
        eventId: 1,
        ...dto,
      } as any);

      const result = await service.upsert(1, 1, dto);

      expect(result).toBeDefined();
      expect(result.price).toBe(1000);
    });

    it('should throw NotOwnerException when user is not owner', async () => {
      const dto = { cocktailId: 1, price: 1000 };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(false);

      await expect(service.upsert(1, 2, dto)).rejects.toThrow(NotOwnerException);
    });
  });

  describe('findAllByEvent', () => {
    it('should return all prices for an event (shared across all bars)', async () => {
      const mockPrices = [
        { id: 1, eventId: 1, cocktailId: 1, price: 1000 },
        { id: 2, eventId: 1, cocktailId: 2, price: 1500 },
      ];

      eventsService.findById.mockResolvedValue(mockEvent as any);
      pricesRepository.findByEventId.mockResolvedValue(mockPrices as any);

      const result = await service.findAllByEvent(1);

      expect(result).toEqual(mockPrices);
      expect(result.length).toBe(2);
    });
  });

  describe('update', () => {
    it('should update a price before event starts', async () => {
      const dto = { price: 1200 };
      const existingPrice = { id: 1, eventId: 1, cocktailId: 1, price: 1000 };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      pricesRepository.findByEventIdAndPriceId.mockResolvedValue(existingPrice as any);
      pricesRepository.update.mockResolvedValue({
        ...existingPrice,
        ...dto,
      } as any);

      const result = await service.update(1, 1, 1, dto);

      expect(result.price).toBe(1200);
    });

    it('should update a price when event has started', async () => {
      const dto = { price: 1200 };
      const existingPrice = { id: 1, eventId: 1, cocktailId: 1, price: 1000 };

      eventsService.findByIdWithOwner.mockResolvedValue(mockStartedEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      pricesRepository.findByEventIdAndPriceId.mockResolvedValue(existingPrice as any);
      pricesRepository.update.mockResolvedValue({
        ...existingPrice,
        ...dto,
      } as any);

      const result = await service.update(1, 1, 1, dto);

      expect(result.price).toBe(1200);
    });
  });

  describe('delete', () => {
    it('should delete a price before event starts', async () => {
      const existingPrice = { id: 1, eventId: 1, cocktailId: 1, price: 1000 };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      pricesRepository.findByEventIdAndPriceId.mockResolvedValue(existingPrice as any);
      pricesRepository.delete.mockResolvedValue(undefined);

      await expect(service.delete(1, 1, 1)).resolves.not.toThrow();
    });

    it('should delete a price when event has started', async () => {
      const existingPrice = { id: 1, eventId: 1, cocktailId: 1, price: 1000 };

      eventsService.findByIdWithOwner.mockResolvedValue(mockStartedEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      pricesRepository.findByEventIdAndPriceId.mockResolvedValue(existingPrice as any);
      pricesRepository.delete.mockResolvedValue(undefined);

      await expect(service.delete(1, 1, 1)).resolves.not.toThrow();
    });
  });
});
