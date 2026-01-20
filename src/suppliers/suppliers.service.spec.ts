import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SuppliersRepository } from './suppliers.repository';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let repository: jest.Mocked<SuppliersRepository>;

  const mockSupplier1 = {
    id: 1,
    name: 'Supplier 1',
    description: 'Test supplier 1',
    email: 'supplier1@test.com',
    phone: '+54 11 1111-1111',
    ownerId: 1,
  };

  const mockSupplier2 = {
    id: 2,
    name: 'Supplier 2',
    description: 'Test supplier 2',
    email: 'supplier2@test.com',
    phone: '+54 11 2222-2222',
    ownerId: 1,
  };

  const mockSupplierOtherOwner = {
    id: 3,
    name: 'Other Owner Supplier',
    description: 'Belongs to another tenant',
    email: 'other@test.com',
    phone: '+54 11 3333-3333',
    ownerId: 2, // Different owner
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findByOwnerId: jest.fn(),
      findById: jest.fn(),
      findByIdAndOwnerId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: SuppliersRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<SuppliersService>(SuppliersService);
    repository = module.get(SuppliersRepository);
  });

  describe('create', () => {
    it('should create a supplier for the current user', async () => {
      const dto = {
        name: 'New Supplier',
        description: 'A new supplier',
        email: 'new@supplier.com',
        phone: '+54 11 4444-4444',
      };

      const expectedSupplier = {
        id: 4,
        ...dto,
        ownerId: 1,
      };

      repository.create.mockResolvedValue(expectedSupplier as any);

      const result = await service.create(1, dto);

      expect(result.name).toBe('New Supplier');
      expect(result.ownerId).toBe(1);
      expect(repository.create).toHaveBeenCalledWith({
        name: dto.name,
        description: dto.description,
        email: dto.email,
        phone: dto.phone,
        owner: { connect: { id: 1 } },
      });
    });
  });

  describe('findAllByOwner', () => {
    it('should return all suppliers for the current user', async () => {
      const mockSuppliers = [mockSupplier1, mockSupplier2];
      repository.findByOwnerId.mockResolvedValue(mockSuppliers as any);

      const result = await service.findAllByOwner(1);

      expect(result.length).toBe(2);
      expect(repository.findByOwnerId).toHaveBeenCalledWith(1);
    });

    it('should return empty array if user has no suppliers', async () => {
      repository.findByOwnerId.mockResolvedValue([]);

      const result = await service.findAllByOwner(999);

      expect(result.length).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should return a supplier by ID for the owner', async () => {
      repository.findByIdAndOwnerId.mockResolvedValue(mockSupplier1 as any);

      const result = await service.findOne(1, 1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Supplier 1');
    });

    it('should throw NotFoundException if supplier not found', async () => {
      repository.findByIdAndOwnerId.mockResolvedValue(null);

      await expect(service.findOne(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('should not return supplier from another tenant', async () => {
      // User 1 trying to access supplier owned by user 2
      repository.findByIdAndOwnerId.mockResolvedValue(null);

      await expect(service.findOne(3, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateOwnership', () => {
    it('should return supplier if user is owner', async () => {
      repository.findById.mockResolvedValue(mockSupplier1 as any);

      const result = await service.validateOwnership(1, 1);

      expect(result.id).toBe(1);
    });

    it('should throw NotFoundException if supplier does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.validateOwnership(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      repository.findById.mockResolvedValue(mockSupplierOtherOwner as any);

      await expect(service.validateOwnership(3, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update a supplier', async () => {
      const dto = { name: 'Updated Supplier' };
      const updatedSupplier = { ...mockSupplier1, name: 'Updated Supplier' };

      repository.findByIdAndOwnerId.mockResolvedValue(mockSupplier1 as any);
      repository.update.mockResolvedValue(updatedSupplier as any);

      const result = await service.update(1, 1, dto);

      expect(result.name).toBe('Updated Supplier');
    });

    it('should throw NotFoundException when updating non-existent supplier', async () => {
      repository.findByIdAndOwnerId.mockResolvedValue(null);

      await expect(service.update(999, 1, { name: 'Test' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete a supplier', async () => {
      repository.findByIdAndOwnerId.mockResolvedValue(mockSupplier1 as any);
      repository.delete.mockResolvedValue(undefined);

      await expect(service.delete(1, 1)).resolves.not.toThrow();
      expect(repository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when deleting non-existent supplier', async () => {
      repository.findByIdAndOwnerId.mockResolvedValue(null);

      await expect(service.delete(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('tenant isolation', () => {
    it('should ensure supplier data is isolated by tenant', async () => {
      // User 1 can see their suppliers
      repository.findByOwnerId.mockImplementation((ownerId) => {
        if (ownerId === 1) return Promise.resolve([mockSupplier1, mockSupplier2] as any);
        if (ownerId === 2) return Promise.resolve([mockSupplierOtherOwner] as any);
        return Promise.resolve([]);
      });

      const user1Suppliers = await service.findAllByOwner(1);
      const user2Suppliers = await service.findAllByOwner(2);

      expect(user1Suppliers.length).toBe(2);
      expect(user2Suppliers.length).toBe(1);
      
      // Verify no cross-contamination
      expect(user1Suppliers.every(s => s.ownerId === 1)).toBe(true);
      expect(user2Suppliers.every(s => s.ownerId === 2)).toBe(true);
    });
  });
});
