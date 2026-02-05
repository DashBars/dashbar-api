import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DashboardGateway } from './dashboard.gateway';
import { DashboardService } from './dashboard.service';
import { AlarmsService } from '../alarms/alarms.service';
import { WsException } from '@nestjs/websockets';

describe('DashboardGateway', () => {
  let gateway: DashboardGateway;
  let dashboardService: jest.Mocked<DashboardService>;
  let jwtService: jest.Mocked<JwtService>;
  let alarmsService: jest.Mocked<AlarmsService>;

  const mockClient = {
    id: 'test-client-id',
    handshake: {
      auth: { token: 'valid-token' },
      headers: {},
    },
    userId: undefined as number | undefined,
    subscribedEvents: new Set<number>(),
    subscribedBars: new Set<number>(),
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };

  beforeEach(async () => {
    const mockDashboardService = {
      validateEventAccess: jest.fn(),
      getEventIdForBar: jest.fn(),
      buildSaleCreatedPayload: jest.fn(),
      buildConsumptionPayload: jest.fn(),
    };

    const mockJwtService = {
      verify: jest.fn(),
    };

    const mockAlarmsService = {
      checkThresholdsAfterSale: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardGateway,
        { provide: DashboardService, useValue: mockDashboardService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AlarmsService, useValue: mockAlarmsService },
      ],
    }).compile();

    gateway = module.get<DashboardGateway>(DashboardGateway);
    dashboardService = module.get(DashboardService);
    jwtService = module.get(JwtService);
    alarmsService = module.get(AlarmsService);

    // Reset mock client state
    mockClient.userId = undefined;
    mockClient.subscribedEvents = new Set();
    mockClient.subscribedBars = new Set();
    mockClient.join.mockClear();
    mockClient.leave.mockClear();
    mockClient.emit.mockClear();
    mockClient.disconnect.mockClear();
  });

  describe('handleConnection', () => {
    it('should authenticate client with valid JWT', async () => {
      jwtService.verify.mockReturnValue({ sub: 1 });

      await gateway.handleConnection(mockClient as any);

      expect(mockClient.userId).toBe(1);
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect client with invalid JWT', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await gateway.handleConnection(mockClient as any);

      expect(mockClient.emit).toHaveBeenCalledWith('error', { message: 'Authentication failed' });
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should disconnect client without token', async () => {
      const clientNoToken = {
        ...mockClient,
        handshake: { auth: {}, headers: {} },
      };

      await gateway.handleConnection(clientNoToken as any);

      expect(clientNoToken.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleSubscribeEvent', () => {
    beforeEach(() => {
      mockClient.userId = 1;
    });

    it('should allow subscription for authorized user', async () => {
      dashboardService.validateEventAccess.mockResolvedValue(true);

      const result = await gateway.handleSubscribeEvent(mockClient as any, { eventId: 1 });

      expect(mockClient.join).toHaveBeenCalledWith('event:1');
      expect(mockClient.subscribedEvents.has(1)).toBe(true);
      expect(result).toEqual({ success: true, room: 'event:1' });
    });

    it('should reject subscription for unauthorized user', async () => {
      dashboardService.validateEventAccess.mockResolvedValue(false);

      await expect(
        gateway.handleSubscribeEvent(mockClient as any, { eventId: 1 }),
      ).rejects.toThrow(WsException);

      expect(mockClient.join).not.toHaveBeenCalled();
    });

    it('should reject if not authenticated', async () => {
      mockClient.userId = undefined;

      await expect(
        gateway.handleSubscribeEvent(mockClient as any, { eventId: 1 }),
      ).rejects.toThrow(WsException);
    });
  });

  describe('handleUnsubscribeEvent', () => {
    beforeEach(() => {
      mockClient.userId = 1;
      mockClient.subscribedEvents.add(1);
    });

    it('should unsubscribe from event', async () => {
      const result = await gateway.handleUnsubscribeEvent(mockClient as any, { eventId: 1 });

      expect(mockClient.leave).toHaveBeenCalledWith('event:1');
      expect(mockClient.subscribedEvents.has(1)).toBe(false);
      expect(result).toEqual({ success: true });
    });
  });

  describe('handleSubscribeBar', () => {
    beforeEach(() => {
      mockClient.userId = 1;
    });

    it('should allow subscription for authorized user', async () => {
      dashboardService.getEventIdForBar.mockResolvedValue(1);
      dashboardService.validateEventAccess.mockResolvedValue(true);

      const result = await gateway.handleSubscribeBar(mockClient as any, { barId: 5 });

      expect(mockClient.join).toHaveBeenCalledWith('bar:5');
      expect(mockClient.subscribedBars.has(5)).toBe(true);
      expect(result).toEqual({ success: true, room: 'bar:5' });
    });

    it('should reject if bar not found', async () => {
      dashboardService.getEventIdForBar.mockResolvedValue(null);

      await expect(
        gateway.handleSubscribeBar(mockClient as any, { barId: 999 }),
      ).rejects.toThrow(WsException);
    });

    it('should reject for unauthorized user', async () => {
      dashboardService.getEventIdForBar.mockResolvedValue(1);
      dashboardService.validateEventAccess.mockResolvedValue(false);

      await expect(
        gateway.handleSubscribeBar(mockClient as any, { barId: 5 }),
      ).rejects.toThrow(WsException);
    });
  });

  describe('handleUnsubscribeBar', () => {
    beforeEach(() => {
      mockClient.userId = 1;
      mockClient.subscribedBars.add(5);
    });

    it('should unsubscribe from bar', async () => {
      const result = await gateway.handleUnsubscribeBar(mockClient as any, { barId: 5 });

      expect(mockClient.leave).toHaveBeenCalledWith('bar:5');
      expect(mockClient.subscribedBars.has(5)).toBe(false);
      expect(result).toEqual({ success: true });
    });
  });

  describe('handleSaleCreated', () => {
    it('should broadcast to event and bar rooms', async () => {
      const mockServer = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      };
      (gateway as any).server = mockServer;

      const salePayload = {
        type: 'sale:created',
        eventId: 1,
        barId: 5,
        data: { saleId: 100, cocktailId: 1, cocktailName: 'Gin Tonic', quantity: 2, totalAmount: 3200, createdAt: new Date() },
      };
      const consumptionPayload = {
        type: 'consumption:updated',
        eventId: 1,
        barId: 5,
        data: { saleId: 100, depletions: [] },
      };

      dashboardService.buildSaleCreatedPayload.mockResolvedValue(salePayload as any);
      dashboardService.buildConsumptionPayload.mockResolvedValue(consumptionPayload as any);

      await gateway.handleSaleCreated({
        eventId: 1,
        barId: 5,
        sale: { id: 100, cocktailId: 1, quantity: 2, createdAt: new Date() },
        depletions: [],
      });

      // Should broadcast to event room
      expect(mockServer.to).toHaveBeenCalledWith('event:1');
      expect(mockServer.to).toHaveBeenCalledWith('bar:5');
      expect(mockServer.emit).toHaveBeenCalledWith('sale:created', salePayload);
      expect(mockServer.emit).toHaveBeenCalledWith('consumption:updated', consumptionPayload);
    });
  });
});
