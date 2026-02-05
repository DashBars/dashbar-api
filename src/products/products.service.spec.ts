import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';
import { EventsService } from '../events/events.service';
import { BarsService } from '../bars/bars.service';
import { NotOwnerException } from '../common/exceptions';

describe('ProductsService', () => {
  let service: ProductsService;
  let repository: ProductsRepository;
  let eventsService: EventsService;
  let barsService: BarsService;

  const mockRepository = {
    findByEventIdAndProductId: jest.fn(),
    findByEventId: jest.fn(),
    findByEventIdAndBarId: jest.fn(),
    create: jest.fn(),
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: ProductsRepository, useValue: mockRepository },
        { provide: EventsService, useValue: mockEventsService },
        { provide: BarsService, useValue: mockBarsService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    repository = module.get<ProductsRepository>(ProductsRepository);
    eventsService = module.get<EventsService>(EventsService);
    barsService = module.get<BarsService>(BarsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const eventId = 1;
    const userId = 1;
    const createDto = {
      name: 'Combo Coca + Sprite',
      price: 5000,
      cocktailIds: [1, 2],
    };

    it('should create a product successfully', async () => {
      const mockEvent = { id: eventId, ownerId: userId };
      const mockProduct = { id: 1, ...createDto, eventId, isCombo: true };

      mockEventsService.findByIdWithOwner.mockResolvedValue(mockEvent);
      mockEventsService.isOwner.mockReturnValue(true);
      mockRepository.findCocktailById.mockResolvedValue({ id: 1 });
      mockRepository.create.mockResolvedValue(mockProduct);

      const result = await service.create(eventId, userId, createDto);

      expect(result).toEqual(mockProduct);
      expect(mockEventsService.findByIdWithOwner).toHaveBeenCalledWith(eventId);
      expect(mockRepository.create).toHaveBeenCalledWith({
        eventId,
        name: createDto.name,
        price: createDto.price,
        cocktailIds: createDto.cocktailIds,
        barId: undefined,
      });
    });

    it('should throw NotOwnerException if user is not the owner', async () => {
      const mockEvent = { id: eventId, ownerId: 2 };

      mockEventsService.findByIdWithOwner.mockResolvedValue(mockEvent);
      mockEventsService.isOwner.mockReturnValue(false);

      await expect(service.create(eventId, userId, createDto)).rejects.toThrow(NotOwnerException);
    });

    it('should throw NotFoundException if cocktail does not exist', async () => {
      const mockEvent = { id: eventId, ownerId: userId };

      mockEventsService.findByIdWithOwner.mockResolvedValue(mockEvent);
      mockEventsService.isOwner.mockReturnValue(true);
      mockRepository.findCocktailById.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);

      await expect(service.create(eventId, userId, createDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return a product', async () => {
      const mockProduct = { id: 1, name: 'Test Product', eventId: 1 };

      mockRepository.findByEventIdAndProductId.mockResolvedValue(mockProduct);

      const result = await service.findOne(1, 1);

      expect(result).toEqual(mockProduct);
    });

    it('should throw NotFoundException if product does not exist', async () => {
      mockRepository.findByEventIdAndProductId.mockResolvedValue(null);

      await expect(service.findOne(1, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const eventId = 1;
    const productId = 1;
    const userId = 1;
    const updateDto = { name: 'Updated Name', price: 6000 };

    it('should update a product successfully', async () => {
      const mockEvent = { id: eventId, ownerId: userId };
      const mockProduct = { id: productId, name: 'Old Name', eventId };
      const mockUpdatedProduct = { ...mockProduct, ...updateDto };

      mockEventsService.findByIdWithOwner.mockResolvedValue(mockEvent);
      mockEventsService.isOwner.mockReturnValue(true);
      mockRepository.findByEventIdAndProductId.mockResolvedValue(mockProduct);
      mockRepository.update.mockResolvedValue(mockUpdatedProduct);

      const result = await service.update(eventId, productId, userId, updateDto);

      expect(result).toEqual(mockUpdatedProduct);
      expect(mockRepository.update).toHaveBeenCalledWith(productId, updateDto);
    });

    it('should throw NotOwnerException if user is not the owner', async () => {
      const mockEvent = { id: eventId, ownerId: 2 };

      mockEventsService.findByIdWithOwner.mockResolvedValue(mockEvent);
      mockEventsService.isOwner.mockReturnValue(false);

      await expect(service.update(eventId, productId, userId, updateDto)).rejects.toThrow(NotOwnerException);
    });
  });

  describe('delete', () => {
    const eventId = 1;
    const productId = 1;
    const userId = 1;

    it('should delete a product successfully', async () => {
      const mockEvent = { id: eventId, ownerId: userId };
      const mockProduct = { id: productId, name: 'Test Product', eventId };

      mockEventsService.findByIdWithOwner.mockResolvedValue(mockEvent);
      mockEventsService.isOwner.mockReturnValue(true);
      mockRepository.findByEventIdAndProductId.mockResolvedValue(mockProduct);
      mockRepository.delete.mockResolvedValue(undefined);

      await service.delete(eventId, productId, userId);

      expect(mockRepository.delete).toHaveBeenCalledWith(productId);
    });
  });
});
