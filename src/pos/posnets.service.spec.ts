import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PosnetStatus } from '@prisma/client';
import { PosnetsService } from './posnets.service';
import { PosnetsRepository } from './posnets.repository';
import { EventsService } from '../events/events.service';
import { BarsService } from '../bars/bars.service';

describe('PosnetsService', () => {
  let service: PosnetsService;
  let repository: jest.Mocked<PosnetsRepository>;
  let eventsService: jest.Mocked<EventsService>;
  let barsService: jest.Mocked<BarsService>;
  let jwtService: jest.Mocked<JwtService>;

  const mockPosnet = {
    id: 1,
    code: 'POS-ABC123',
    name: 'POS Bar VIP 1',
    status: PosnetStatus.OPEN,
    enabled: true,
    traffic: 25,
    eventId: 1,
    barId: 1,
    authToken: 'hashedToken123',
    lastHeartbeatAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    bar: { id: 1, name: 'Bar VIP', type: 'VIP', status: 'open', eventId: 1 },
    event: { id: 1, name: 'Test Event' },
  };

  const mockEvent = {
    id: 1,
    name: 'Test Event',
    status: 'active',
    ownerId: 1,
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findByAuthToken: jest.fn(),
      findByEventId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateHeartbeat: jest.fn(),
      codeExists: jest.fn(),
      getActiveSession: jest.fn(),
    };

    const mockEventsService = {
      findById: jest.fn(),
      findByIdWithOwner: jest.fn(),
      isOwner: jest.fn(),
    };

    const mockBarsService = {
      findOne: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('pos-jwt-secret'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosnetsService,
        { provide: PosnetsRepository, useValue: mockRepository },
        { provide: EventsService, useValue: mockEventsService },
        { provide: BarsService, useValue: mockBarsService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PosnetsService>(PosnetsService);
    repository = module.get(PosnetsRepository);
    eventsService = module.get(EventsService);
    barsService = module.get(BarsService);
    jwtService = module.get(JwtService);
  });

  describe('create', () => {
    it('should create a new POS terminal', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockPosnet.bar as any);
      repository.codeExists.mockResolvedValue(false);
      repository.create.mockResolvedValue(mockPosnet as any);

      const result = await service.create(1, 1, { name: 'POS Bar VIP 1', barId: 1 });

      expect(result).toEqual(mockPosnet);
      expect(eventsService.findByIdWithOwner).toHaveBeenCalledWith(1);
      expect(barsService.findOne).toHaveBeenCalledWith(1, 1, 1);
      expect(repository.create).toHaveBeenCalled();
    });

    it('should generate unique code when not provided', async () => {
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      barsService.findOne.mockResolvedValue(mockPosnet.bar as any);
      repository.codeExists.mockResolvedValue(false);
      repository.create.mockResolvedValue(mockPosnet as any);

      await service.create(1, 1, { name: 'POS Bar VIP 1', barId: 1 });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: expect.stringMatching(/^POS-[A-F0-9]{6}$/),
        }),
      );
    });
  });

  describe('findByEvent', () => {
    it('should return all posnets for an event', async () => {
      eventsService.findById.mockResolvedValue(mockEvent as any);
      repository.findByEventId.mockResolvedValue([mockPosnet as any]);

      const result = await service.findByEvent(1, 1);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockPosnet);
    });
  });

  describe('findById', () => {
    it('should return a posnet by id', async () => {
      repository.findById.mockResolvedValue(mockPosnet as any);

      const result = await service.findById(1);

      expect(result).toEqual(mockPosnet);
    });

    it('should throw NotFoundException when posnet not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a posnet', async () => {
      repository.findById.mockResolvedValue(mockPosnet as any);
      eventsService.findByIdWithOwner.mockResolvedValue(mockEvent as any);
      eventsService.isOwner.mockReturnValue(true);
      const updatedPosnet = { ...mockPosnet, name: 'Updated Name' };
      repository.update.mockResolvedValue(updatedPosnet as any);

      const result = await service.update(1, 1, { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });
  });

  describe('login', () => {
    it('should return access token for valid code', async () => {
      repository.findByCode.mockResolvedValue(mockPosnet as any);
      jwtService.sign.mockReturnValue('mock-jwt-token');

      const result = await service.login({ code: 'POS-ABC123' });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.posnet).toEqual(mockPosnet);
    });

    it('should throw UnauthorizedException for invalid code', async () => {
      repository.findByCode.mockResolvedValue(null);

      await expect(service.login({ code: 'INVALID' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw ForbiddenException for disabled posnet', async () => {
      const { ForbiddenException } = require('@nestjs/common');
      const disabledPosnet = { ...mockPosnet, enabled: false };
      repository.findByCode.mockResolvedValue(disabledPosnet as any);

      await expect(service.login({ code: 'POS-ABC123' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('verifyPosToken', () => {
    it('should verify and return token payload', async () => {
      const payload = { posnetId: 1, eventId: 1, barId: 1, type: 'pos' };
      jwtService.verify.mockReturnValue(payload);
      repository.findById.mockResolvedValue(mockPosnet as any);

      const result = await service.verifyPosToken('valid-token');

      expect(result).toEqual(payload);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      try {
        await service.verifyPosToken('invalid-token');
        fail('Expected error to be thrown');
      } catch (error: any) {
        expect(error.message).toBe('Invalid or expired POS token');
      }
    });
  });

  describe('updateStatus', () => {
    it('should update posnet status', async () => {
      repository.findById.mockResolvedValue(mockPosnet as any);
      const updatedPosnet = { ...mockPosnet, status: PosnetStatus.CONGESTED };
      repository.update.mockResolvedValue(updatedPosnet as any);

      const result = await service.updateStatus(1, PosnetStatus.CONGESTED);

      expect(result.status).toBe(PosnetStatus.CONGESTED);
    });
  });

  describe('recordHeartbeat', () => {
    it('should update heartbeat timestamp', async () => {
      repository.findById.mockResolvedValue(mockPosnet as any);
      const updatedPosnet = { ...mockPosnet, lastHeartbeatAt: new Date() };
      repository.updateHeartbeat.mockResolvedValue(undefined);

      await service.recordHeartbeat(1);

      expect(repository.updateHeartbeat).toHaveBeenCalledWith(1);
    });
  });
});
