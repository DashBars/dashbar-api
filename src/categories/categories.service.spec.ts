import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesRepository } from './categories.repository';
import { EventsService } from '../events/events.service';
import { NotOwnerException, EventStartedException } from '../common/exceptions';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let repository: jest.Mocked<CategoriesRepository>;
  let eventsService: jest.Mocked<EventsService>;

  const mockEvent = {
    id: 1,
    name: 'Test Event',
    ownerId: 1,
    startedAt: new Date('2030-01-01'),
    owner: { id: 1 },
  };

  const mockStartedEvent = {
    ...mockEvent,
    startedAt: new Date('2020-01-01'), // In the past
  };

  const mockCategory = {
    id: 1,
    eventId: 1,
    name: 'Alcoholic',
    description: 'Alcoholic beverages',
    sortIndex: 0,
    isActive: true,
    cocktails: [],
  };

  const mockCocktail = {
    id: 1,
    name: 'Gin Tonic',
    price: 1600,
    volume: 400,
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findByEventId: jest.fn(),
      findById: jest.fn(),
      findByEventIdAndCategoryId: jest.fn(),
      findByEventIdAndName: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      assignCocktails: jest.fn(),
      addCocktailToCategory: jest.fn(),
      removeCocktailFromCategory: jest.fn(),
      findCocktailById: jest.fn(),
      getNextSortIndex: jest.fn(),
    };

    const mockEventsService = {
      findById: jest.fn(),
      findByIdWithOwner: jest.fn(),
      isOwner: jest.fn(),
      hasEventStarted: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: CategoriesRepository, useValue: mockRepository },
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    repository = module.get(CategoriesRepository);
    eventsService = module.get(EventsService);
  });

  describe('create', () => {
    it('should create a category', async () => {
      const dto = { name: 'Alcoholic', description: 'Alcoholic beverages' };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      eventsService.hasEventStarted.mockReturnValue(false);
      repository.findByEventIdAndName.mockResolvedValue(null);
      repository.getNextSortIndex.mockResolvedValue(0);
      repository.create.mockResolvedValue(mockCategory as any);

      const result = await service.create(1, 1, dto);

      expect(result.name).toBe('Alcoholic');
      expect(repository.create).toHaveBeenCalledWith({
        eventId: 1,
        name: 'Alcoholic',
        description: 'Alcoholic beverages',
        sortIndex: 0,
        isActive: true,
      });
    });

    it('should reject duplicate category name', async () => {
      const dto = { name: 'Alcoholic' };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      eventsService.hasEventStarted.mockReturnValue(false);
      repository.findByEventIdAndName.mockResolvedValue(mockCategory as any);

      await expect(service.create(1, 1, dto)).rejects.toThrow(ConflictException);
    });

    it('should reject if user is not owner', async () => {
      const dto = { name: 'Alcoholic' };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(false);

      await expect(service.create(1, 2, dto)).rejects.toThrow(NotOwnerException);
    });

    it('should reject if event has started', async () => {
      const dto = { name: 'Alcoholic' };

      eventsService.findByIdWithOwner.mockResolvedValue(mockStartedEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      eventsService.hasEventStarted.mockReturnValue(true);

      await expect(service.create(1, 1, dto)).rejects.toThrow(EventStartedException);
    });
  });

  describe('findAllByEvent', () => {
    it('should return all categories for an event', async () => {
      const categories = [mockCategory, { ...mockCategory, id: 2, name: 'Non-Alcoholic' }];

      eventsService.findById.mockResolvedValue(mockEvent as any);
      repository.findByEventId.mockResolvedValue(categories as any);

      const result = await service.findAllByEvent(1);

      expect(result.length).toBe(2);
    });
  });

  describe('assignCocktails', () => {
    it('should assign cocktails to a category', async () => {
      const dto = { cocktails: [{ cocktailId: 1, sortIndex: 0 }] };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      eventsService.hasEventStarted.mockReturnValue(false);
      repository.findByEventIdAndCategoryId.mockResolvedValue(mockCategory as any);
      repository.findCocktailById.mockResolvedValue(mockCocktail as any);
      repository.assignCocktails.mockResolvedValue([
        { categoryId: 1, cocktailId: 1, sortIndex: 0, cocktail: mockCocktail },
      ] as any);

      const result = await service.assignCocktails(1, 1, 1, dto);

      expect(result.length).toBe(1);
    });

    it('should reject if cocktail not found', async () => {
      const dto = { cocktails: [{ cocktailId: 999, sortIndex: 0 }] };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      eventsService.hasEventStarted.mockReturnValue(false);
      repository.findByEventIdAndCategoryId.mockResolvedValue(mockCategory as any);
      repository.findCocktailById.mockResolvedValue(null);

      await expect(service.assignCocktails(1, 1, 1, dto)).rejects.toThrow(NotFoundException);
    });
  });
});
