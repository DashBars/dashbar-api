import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlarmsRepository } from './alarms.repository';
import { EventsService } from '../events/events.service';
import { CreateThresholdDto, UpdateThresholdDto } from './dto';
import { NotOwnerException } from '../common/exceptions';
import {
  StockThreshold,
  StockAlert,
  AlertType,
  AlertStatus,
} from '@prisma/client';
import {
  DonorSuggestion,
  AlertCreatedEvent,
} from './interfaces/alarm.interface';

@Injectable()
export class AlarmsService {
  constructor(
    private readonly repository: AlarmsRepository,
    private readonly eventsService: EventsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ============= THRESHOLD MANAGEMENT =============

  /**
   * Create a threshold for an event and drink
   */
  async createThreshold(
    eventId: number,
    userId: number,
    dto: CreateThresholdDto,
  ): Promise<StockThreshold> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    // Validate drink exists
    const drink = await this.repository.getDrinkById(dto.drinkId);
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${dto.drinkId} not found`);
    }

    // Validate thresholds
    if (dto.donationThreshold < dto.lowerThreshold) {
      throw new BadRequestException(
        'Donation threshold must be greater than or equal to lower threshold',
      );
    }

    // Check if threshold already exists
    const existing = await this.repository.findThresholdByEventAndDrink(
      eventId,
      dto.drinkId,
    );
    if (existing) {
      throw new BadRequestException(
        `Threshold already exists for drink ${dto.drinkId} in this event`,
      );
    }

    return this.repository.createThreshold({
      eventId,
      drinkId: dto.drinkId,
      lowerThreshold: dto.lowerThreshold,
      donationThreshold: dto.donationThreshold,
      depletionHorizonMin: dto.depletionHorizonMin,
    });
  }

  /**
   * Get all thresholds for an event
   */
  async findAllThresholds(eventId: number): Promise<StockThreshold[]> {
    await this.eventsService.findById(eventId);
    return this.repository.findThresholdsByEvent(eventId);
  }

  /**
   * Get a specific threshold
   */
  async findThreshold(eventId: number, drinkId: number): Promise<StockThreshold> {
    const threshold = await this.repository.findThresholdByEventAndDrink(
      eventId,
      drinkId,
    );

    if (!threshold) {
      throw new NotFoundException(
        `Threshold for drink ${drinkId} not found in event ${eventId}`,
      );
    }

    return threshold;
  }

  /**
   * Update a threshold
   */
  async updateThreshold(
    eventId: number,
    drinkId: number,
    userId: number,
    dto: UpdateThresholdDto,
  ): Promise<StockThreshold> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const existing = await this.findThreshold(eventId, drinkId);

    // Validate thresholds
    const newLower = dto.lowerThreshold ?? existing.lowerThreshold;
    const newDonation = dto.donationThreshold ?? existing.donationThreshold;

    if (newDonation < newLower) {
      throw new BadRequestException(
        'Donation threshold must be greater than or equal to lower threshold',
      );
    }

    return this.repository.updateThreshold(eventId, drinkId, dto);
  }

  /**
   * Delete a threshold
   */
  async deleteThreshold(
    eventId: number,
    drinkId: number,
    userId: number,
  ): Promise<void> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.findThreshold(eventId, drinkId);
    await this.repository.deleteThreshold(eventId, drinkId);
  }

  // ============= ALERT MANAGEMENT =============

  /**
   * Get all alerts for an event
   */
  async findAllAlerts(
    eventId: number,
    status?: AlertStatus,
  ): Promise<StockAlert[]> {
    await this.eventsService.findById(eventId);
    return this.repository.findAlertsByEvent(eventId, status);
  }

  /**
   * Get a specific alert
   */
  async findAlert(eventId: number, alertId: number): Promise<StockAlert> {
    const alert = await this.repository.findAlertById(alertId);

    if (!alert || (alert as any).event?.id !== eventId) {
      throw new NotFoundException(`Alert with ID ${alertId} not found in event ${eventId}`);
    }

    return alert;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(
    eventId: number,
    alertId: number,
    userId: number,
  ): Promise<StockAlert> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const alert = await this.findAlert(eventId, alertId);

    if (alert.status !== AlertStatus.active) {
      throw new BadRequestException('Alert is not in active status');
    }

    return this.repository.updateAlertStatus(alertId, AlertStatus.acknowledged);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: number): Promise<StockAlert> {
    return this.repository.updateAlertStatus(
      alertId,
      AlertStatus.resolved,
      new Date(),
    );
  }

  // ============= ALERT DETECTION =============

  /**
   * Check thresholds after a sale and create alerts if needed
   */
  async checkThresholdsAfterSale(
    eventId: number,
    barId: number,
    drinkIds: number[],
  ): Promise<void> {
    const uniqueDrinkIds = [...new Set(drinkIds)];

    for (const drinkId of uniqueDrinkIds) {
      const threshold = await this.repository.findThresholdByEventAndDrink(
        eventId,
        drinkId,
      );

      if (!threshold) continue;

      const currentStock = await this.repository.getTotalStockForBarDrink(
        barId,
        drinkId,
      );

      // Check for low stock
      if (currentStock < threshold.lowerThreshold) {
        await this.createLowStockAlert(
          eventId,
          barId,
          drinkId,
          currentStock,
          threshold,
        );
      }

      // Check for projected depletion
      if (threshold.depletionHorizonMin) {
        const rate = await this.repository.getConsumptionRate(
          barId,
          drinkId,
          30, // 30 minute window
        );

        if (rate > 0) {
          const minutesToDepletion = currentStock / rate;

          if (minutesToDepletion < threshold.depletionHorizonMin) {
            await this.createProjectedDepletionAlert(
              eventId,
              barId,
              drinkId,
              currentStock,
              threshold,
              Math.round(minutesToDepletion),
            );
          }
        }
      }
    }
  }

  /**
   * Force check all thresholds for an event
   */
  async forceCheckThresholds(eventId: number, userId: number): Promise<StockAlert[]> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const thresholds = await this.repository.findThresholdsByEvent(eventId);
    const barsWithStock = new Map<number, Map<number, number>>();

    // Get all bars in event
    const bars = await this.repository.getBarsWithStockForDrink(eventId, 0);

    const createdAlerts: StockAlert[] = [];

    for (const threshold of thresholds) {
      const barsForDrink = await this.repository.getBarsWithStockForDrink(
        eventId,
        threshold.drinkId,
      );

      for (const bar of barsForDrink) {
        if (bar.totalStock < threshold.lowerThreshold) {
          const alert = await this.createLowStockAlert(
            eventId,
            bar.id,
            threshold.drinkId,
            bar.totalStock,
            threshold,
          );
          if (alert) createdAlerts.push(alert);
        }
      }
    }

    return createdAlerts;
  }

  /**
   * Create a low stock alert
   */
  private async createLowStockAlert(
    eventId: number,
    barId: number,
    drinkId: number,
    currentStock: number,
    threshold: StockThreshold,
  ): Promise<StockAlert | null> {
    // Check if there's already an active alert for this bar/drink
    const existing = await this.repository.findActiveAlertForBarDrink(
      barId,
      drinkId,
      AlertType.low_stock,
    );

    if (existing) return null; // Don't create duplicate alerts

    // Find donor bars
    const neededQty = threshold.lowerThreshold - currentStock;
    const { donors, externalNeeded } = await this.findDonorBars(
      eventId,
      barId,
      drinkId,
      neededQty,
      threshold.donationThreshold,
    );

    const drink = await this.repository.getDrinkById(drinkId);

    const alert = await this.repository.createAlert({
      eventId,
      barId,
      drinkId,
      type: AlertType.low_stock,
      currentStock,
      threshold: threshold.lowerThreshold,
      suggestedDonors: donors,
      externalNeeded,
    });

    // Emit event for WebSocket broadcast
    this.eventEmitter.emit('alert.created', {
      eventId,
      barId,
      alertId: alert.id,
      drinkId,
      drinkName: drink?.name ?? 'Unknown',
      type: 'low_stock',
      currentStock,
      threshold: threshold.lowerThreshold,
      suggestedDonors: donors,
      externalNeeded,
      createdAt: alert.createdAt,
    } as AlertCreatedEvent);

    return alert;
  }

  /**
   * Create a projected depletion alert
   */
  private async createProjectedDepletionAlert(
    eventId: number,
    barId: number,
    drinkId: number,
    currentStock: number,
    threshold: StockThreshold,
    projectedMinutes: number,
  ): Promise<StockAlert | null> {
    // Check if there's already an active alert for this bar/drink
    const existing = await this.repository.findActiveAlertForBarDrink(
      barId,
      drinkId,
      AlertType.projected_depletion,
    );

    if (existing) return null;

    const neededQty = threshold.lowerThreshold;
    const { donors, externalNeeded } = await this.findDonorBars(
      eventId,
      barId,
      drinkId,
      neededQty,
      threshold.donationThreshold,
    );

    const drink = await this.repository.getDrinkById(drinkId);

    const alert = await this.repository.createAlert({
      eventId,
      barId,
      drinkId,
      type: AlertType.projected_depletion,
      currentStock,
      threshold: threshold.depletionHorizonMin!,
      suggestedDonors: donors,
      externalNeeded,
      projectedMinutes,
    });

    this.eventEmitter.emit('alert.created', {
      eventId,
      barId,
      alertId: alert.id,
      drinkId,
      drinkName: drink?.name ?? 'Unknown',
      type: 'projected_depletion',
      currentStock,
      threshold: threshold.depletionHorizonMin!,
      suggestedDonors: donors,
      externalNeeded,
      projectedMinutes,
      createdAt: alert.createdAt,
    } as AlertCreatedEvent);

    return alert;
  }

  /**
   * Find donor bars that can contribute stock
   */
  private async findDonorBars(
    eventId: number,
    excludeBarId: number,
    drinkId: number,
    neededQty: number,
    donationThreshold: number,
  ): Promise<{ donors: DonorSuggestion[]; externalNeeded: boolean }> {
    const bars = await this.repository.getBarsWithStockForDrink(eventId, drinkId);
    const donors: DonorSuggestion[] = [];

    for (const bar of bars) {
      if (bar.id === excludeBarId) continue;

      const surplus = bar.totalStock - donationThreshold;
      if (surplus > 0) {
        donors.push({
          barId: bar.id,
          barName: bar.name,
          availableSurplus: surplus,
          suggestedQuantity: Math.min(surplus, neededQty),
        });
      }
    }

    // Sort by available surplus descending
    donors.sort((a, b) => b.availableSurplus - a.availableSurplus);

    return {
      donors,
      externalNeeded: donors.length === 0,
    };
  }
}
