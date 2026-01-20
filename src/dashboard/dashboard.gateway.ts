import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DashboardService } from './dashboard.service';
import { SaleCreatedEvent } from './interfaces/dashboard-events.interface';
import { AlarmsService } from '../alarms/alarms.service';
import { AlertCreatedEvent } from '../alarms/interfaces/alarm.interface';
import { TransferStatusEvent } from '../transfers/transfers.service';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  subscribedEvents: Set<number>;
  subscribedBars: Set<number>;
}

@WebSocketGateway({
  namespace: '/dashboard',
  cors: {
    origin: '*',
  },
})
export class DashboardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DashboardGateway.name);

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => AlarmsService))
    private readonly alarmsService: AlarmsService,
  ) {}

  /**
   * Handle new connection - validate JWT
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        throw new WsException('Missing authentication token');
      }

      const payload = this.jwtService.verify(token);
      client.userId = payload.sub;
      client.subscribedEvents = new Set();
      client.subscribedBars = new Set();

      this.logger.log(`Client connected: ${client.id}, userId: ${client.userId}`);
    } catch (error: any) {
      this.logger.warn(`Client rejected: ${client.id}, reason: ${error?.message || 'Unknown'}`);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  /**
   * Handle disconnection
   */
  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Subscribe to event-wide updates
   */
  @SubscribeMessage('subscribe:event')
  async handleSubscribeEvent(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { eventId: number },
  ) {
    if (!client.userId) {
      throw new WsException('Not authenticated');
    }

    const { eventId } = data;

    // Validate access
    const hasAccess = await this.dashboardService.validateEventAccess(eventId, client.userId);
    if (!hasAccess) {
      throw new WsException('Access denied to this event');
    }

    const room = `event:${eventId}`;
    await client.join(room);
    client.subscribedEvents.add(eventId);

    this.logger.log(`Client ${client.id} subscribed to event ${eventId}`);

    return { success: true, room };
  }

  /**
   * Unsubscribe from event
   */
  @SubscribeMessage('unsubscribe:event')
  async handleUnsubscribeEvent(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { eventId: number },
  ) {
    const { eventId } = data;
    const room = `event:${eventId}`;

    await client.leave(room);
    client.subscribedEvents.delete(eventId);

    this.logger.log(`Client ${client.id} unsubscribed from event ${eventId}`);

    return { success: true };
  }

  /**
   * Subscribe to bar-specific updates
   */
  @SubscribeMessage('subscribe:bar')
  async handleSubscribeBar(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { barId: number },
  ) {
    if (!client.userId) {
      throw new WsException('Not authenticated');
    }

    const { barId } = data;

    // Get event ID for bar and validate access
    const eventId = await this.dashboardService.getEventIdForBar(barId);
    if (!eventId) {
      throw new WsException('Bar not found');
    }

    const hasAccess = await this.dashboardService.validateEventAccess(eventId, client.userId);
    if (!hasAccess) {
      throw new WsException('Access denied to this bar');
    }

    const room = `bar:${barId}`;
    await client.join(room);
    client.subscribedBars.add(barId);

    this.logger.log(`Client ${client.id} subscribed to bar ${barId}`);

    return { success: true, room };
  }

  /**
   * Unsubscribe from bar
   */
  @SubscribeMessage('unsubscribe:bar')
  async handleUnsubscribeBar(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { barId: number },
  ) {
    const { barId } = data;
    const room = `bar:${barId}`;

    await client.leave(room);
    client.subscribedBars.delete(barId);

    this.logger.log(`Client ${client.id} unsubscribed from bar ${barId}`);

    return { success: true };
  }

  /**
   * Handle sale.created event from EventEmitter
   */
  @OnEvent('sale.created')
  async handleSaleCreated(data: SaleCreatedEvent) {
    this.logger.log(`Broadcasting sale created: eventId=${data.eventId}, barId=${data.barId}`);

    // Build payloads
    const [salePayload, consumptionPayload] = await Promise.all([
      this.dashboardService.buildSaleCreatedPayload(data),
      this.dashboardService.buildConsumptionPayload(data),
    ]);

    // Broadcast to event room
    this.server.to(`event:${data.eventId}`).emit('sale:created', salePayload);
    this.server.to(`event:${data.eventId}`).emit('consumption:updated', consumptionPayload);

    // Broadcast to bar room
    this.server.to(`bar:${data.barId}`).emit('sale:created', salePayload);
    this.server.to(`bar:${data.barId}`).emit('consumption:updated', consumptionPayload);

    // Check thresholds for affected drinks
    try {
      await this.alarmsService.checkThresholdsAfterSale(
        data.eventId,
        data.barId,
        data.depletions.map((d) => d.drinkId),
      );
    } catch (error: any) {
      this.logger.error(`Error checking thresholds: ${error?.message}`);
    }
  }

  /**
   * Handle alert.created event from EventEmitter
   */
  @OnEvent('alert.created')
  handleAlertCreated(data: AlertCreatedEvent) {
    this.logger.log(`Broadcasting alert created: eventId=${data.eventId}, barId=${data.barId}, type=${data.type}`);

    // Broadcast to event room
    this.server.to(`event:${data.eventId}`).emit('alert:created', data);

    // Broadcast to specific bar room
    this.server.to(`bar:${data.barId}`).emit('alert:created', data);
  }

  /**
   * Handle transfer.status_changed event from EventEmitter
   */
  @OnEvent('transfer.status_changed')
  handleTransferStatusChanged(data: TransferStatusEvent) {
    this.logger.log(`Broadcasting transfer status changed: transferId=${data.transferId}, status=${data.status}`);

    // Broadcast to event room
    this.server.to(`event:${data.eventId}`).emit('transfer:updated', data);

    // Broadcast to receiver bar room
    this.server.to(`bar:${data.receiverBarId}`).emit('transfer:updated', data);

    // Broadcast to donor bar room
    this.server.to(`bar:${data.donorBarId}`).emit('transfer:updated', data);
  }
}
