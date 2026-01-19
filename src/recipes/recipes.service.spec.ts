import { Test, TestingModule } from '@nestjs/testing';
import { RecipesService } from './recipes.service';
import { RecipesRepository } from './recipes.repository';
import { EventsService } from '../events/events.service';
import { EventStartedException, NotOwnerException } from '../common/exceptions';
import { BarType } from '@prisma/client';

describe('RecipesService', () => {
  let service: RecipesService;
  let recipesRepository: jest.Mocked<RecipesRepository>;
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
    const mockRecipesRepository = {
      create: jest.fn(),
      findByEventId: jest.fn(),
      findByEventIdAndRecipeId: jest.fn(),
      findByEventIdAndBarType: jest.fn(),
      findByEventIdBarTypeAndCocktailId: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      findCocktailById: jest.fn(),
      findDrinkById: jest.fn(),
    };

    const mockEventsService = {
      findById: jest.fn(),
      findByIdWithOwner: jest.fn(),
      hasEventStarted: jest.fn(),
      isOwner: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipesService,
        { provide: RecipesRepository, useValue: mockRecipesRepository },
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get<RecipesService>(RecipesService);
    recipesRepository = module.get(RecipesRepository);
    eventsService = module.get(EventsService);
  });

  describe('create', () => {
    it('should create a recipe before event starts', async () => {
      const dto = {
        barType: BarType.VIP,
        cocktailId: 1,
        drinkId: 1,
        cocktailPercentage: 50,
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      eventsService.hasEventStarted.mockReturnValue(false);
      recipesRepository.findCocktailById.mockResolvedValue({ id: 1 } as any);
      recipesRepository.findDrinkById.mockResolvedValue({ id: 1 } as any);
      recipesRepository.create.mockResolvedValue({
        id: 1,
        ...dto,
        eventId: 1,
      } as any);

      const result = await service.create(1, 1, dto);

      expect(result).toBeDefined();
      expect(recipesRepository.create).toHaveBeenCalled();
    });

    it('should throw EventStartedException when event has started', async () => {
      const dto = {
        barType: BarType.VIP,
        cocktailId: 1,
        drinkId: 1,
        cocktailPercentage: 50,
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockStartedEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      eventsService.hasEventStarted.mockReturnValue(true);

      await expect(service.create(1, 1, dto)).rejects.toThrow(EventStartedException);
    });

    it('should throw NotOwnerException when user is not owner', async () => {
      const dto = {
        barType: BarType.VIP,
        cocktailId: 1,
        drinkId: 1,
        cocktailPercentage: 50,
      };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(false);

      await expect(service.create(1, 2, dto)).rejects.toThrow(NotOwnerException);
    });
  });

  describe('findByBarType', () => {
    it('should return recipes for a specific bar type', async () => {
      const mockRecipes = [
        { id: 1, eventId: 1, barType: BarType.VIP, cocktailId: 1, drinkId: 1 },
        { id: 2, eventId: 1, barType: BarType.VIP, cocktailId: 1, drinkId: 2 },
      ];

      eventsService.findById.mockResolvedValue(mockEvent as any);
      recipesRepository.findByEventIdAndBarType.mockResolvedValue(mockRecipes as any);

      const result = await service.findByBarType(1, BarType.VIP);

      expect(result).toEqual(mockRecipes);
    });

    it('should return different recipes for different bar types', async () => {
      const vipRecipes = [{ id: 1, barType: BarType.VIP }];
      const generalRecipes = [{ id: 2, barType: BarType.general }];

      eventsService.findById.mockResolvedValue(mockEvent as any);
      recipesRepository.findByEventIdAndBarType
        .mockResolvedValueOnce(vipRecipes as any)
        .mockResolvedValueOnce(generalRecipes as any);

      const vipResult = await service.findByBarType(1, BarType.VIP);
      const generalResult = await service.findByBarType(1, BarType.general);

      expect(vipResult).toEqual(vipRecipes);
      expect(generalResult).toEqual(generalRecipes);
    });
  });

  describe('update', () => {
    it('should update a recipe before event starts', async () => {
      const dto = { cocktailPercentage: 60 };
      const existingRecipe = { id: 1, eventId: 1, barType: BarType.VIP };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      eventsService.hasEventStarted.mockReturnValue(false);
      recipesRepository.findByEventIdAndRecipeId.mockResolvedValue(existingRecipe as any);
      recipesRepository.update.mockResolvedValue({
        ...existingRecipe,
        ...dto,
      } as any);

      const result = await service.update(1, 1, 1, dto);

      expect(result.cocktailPercentage).toBe(60);
    });

    it('should throw EventStartedException when updating after event starts', async () => {
      const dto = { cocktailPercentage: 60 };

      eventsService.findByIdWithOwner.mockResolvedValue(mockStartedEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      eventsService.hasEventStarted.mockReturnValue(true);

      await expect(service.update(1, 1, 1, dto)).rejects.toThrow(EventStartedException);
    });
  });

  describe('delete', () => {
    it('should delete a recipe before event starts', async () => {
      const existingRecipe = { id: 1, eventId: 1, barType: BarType.VIP };

      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      eventsService.hasEventStarted.mockReturnValue(false);
      recipesRepository.findByEventIdAndRecipeId.mockResolvedValue(existingRecipe as any);
      recipesRepository.delete.mockResolvedValue(undefined);

      await expect(service.delete(1, 1, 1)).resolves.not.toThrow();
    });

    it('should throw EventStartedException when deleting after event starts', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockStartedEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      eventsService.hasEventStarted.mockReturnValue(true);

      await expect(service.delete(1, 1, 1)).rejects.toThrow(EventStartedException);
    });
  });
});
