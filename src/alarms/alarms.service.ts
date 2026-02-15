import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlarmsRepository } from './alarms.repository';
import { EventsService } from '../events/events.service';
import { BarsService } from '../bars/bars.service';
import { CreateThresholdDto, UpdateThresholdDto } from './dto';
import { NotOwnerException } from '../common/exceptions';
import {
  StockThreshold,
  StockAlert,
  AlertType,
  AlertStatus,
  BarStatus,
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
    private readonly barsService: BarsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Helpers ──

  /**
   * Build a descriptive label for the stock type.
   */
  private stockTypeLabel(sellAsWholeUnit: boolean): string {
    return sellAsWholeUnit ? 'venta directa' : 'recetas';
  }

  /**
   * Convert raw stock quantity (always stored in ml) to units (bottles/cans).
   * Stock.quantity is stored in ml regardless of sellAsWholeUnit flag.
   */
  private toUnits(rawQty: number, drinkVolume: number, _sellAsWholeUnit: boolean): number {
    return drinkVolume > 0 ? Math.floor(rawQty / drinkVolume) : 0;
  }

  // ============= THRESHOLD MANAGEMENT =============

  async createThreshold(
    eventId: number,
    userId: number,
    dto: CreateThresholdDto,
  ): Promise<StockThreshold> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) throw new NotOwnerException();

    const drink = await this.repository.getDrinkById(dto.drinkId);
    if (!drink) throw new NotFoundException(`Drink with ID ${dto.drinkId} not found`);

    if (dto.donationThreshold < dto.lowerThreshold) {
      throw new BadRequestException(
        'Donation threshold must be greater than or equal to lower threshold',
      );
    }

    const existing = await this.repository.findThresholdByEventDrinkAndType(
      eventId,
      dto.drinkId,
      dto.sellAsWholeUnit,
    );
    if (existing) {
      throw new BadRequestException(
        `Ya existe un umbral para ${drink.name} (${this.stockTypeLabel(dto.sellAsWholeUnit)}) en este evento`,
      );
    }

    return this.repository.createThreshold({
      eventId,
      drinkId: dto.drinkId,
      sellAsWholeUnit: dto.sellAsWholeUnit,
      lowerThreshold: dto.lowerThreshold,
      donationThreshold: dto.donationThreshold,
      depletionHorizonMin: dto.depletionHorizonMin,
    });
  }

  async findAllThresholds(eventId: number): Promise<StockThreshold[]> {
    await this.eventsService.findById(eventId);
    return this.repository.findThresholdsByEvent(eventId);
  }

  async findThreshold(
    eventId: number,
    drinkId: number,
    sellAsWholeUnit: boolean,
  ): Promise<StockThreshold> {
    const threshold = await this.repository.findThresholdByEventDrinkAndType(
      eventId,
      drinkId,
      sellAsWholeUnit,
    );
    if (!threshold) {
      throw new NotFoundException(
        `Threshold for drink ${drinkId} (${this.stockTypeLabel(sellAsWholeUnit)}) not found in event ${eventId}`,
      );
    }
    return threshold;
  }

  async updateThreshold(
    eventId: number,
    drinkId: number,
    sellAsWholeUnit: boolean,
    userId: number,
    dto: UpdateThresholdDto,
  ): Promise<StockThreshold> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) throw new NotOwnerException();

    const existing = await this.findThreshold(eventId, drinkId, sellAsWholeUnit);

    const newLower = dto.lowerThreshold ?? existing.lowerThreshold;
    const newDonation = dto.donationThreshold ?? existing.donationThreshold;
    if (newDonation < newLower) {
      throw new BadRequestException(
        'Donation threshold must be greater than or equal to lower threshold',
      );
    }

    return this.repository.updateThreshold(eventId, drinkId, sellAsWholeUnit, dto);
  }

  async deleteThreshold(
    eventId: number,
    drinkId: number,
    sellAsWholeUnit: boolean,
    userId: number,
  ): Promise<void> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) throw new NotOwnerException();

    await this.findThreshold(eventId, drinkId, sellAsWholeUnit);
    await this.repository.deleteThreshold(eventId, drinkId, sellAsWholeUnit);
  }

  // ============= ALERT MANAGEMENT =============

  async findAllAlerts(eventId: number, status?: AlertStatus): Promise<StockAlert[]> {
    await this.eventsService.findById(eventId);
    return this.repository.findAlertsByEvent(eventId, status);
  }

  async findAlert(eventId: number, alertId: number): Promise<StockAlert> {
    const alert = await this.repository.findAlertById(alertId);
    if (!alert || (alert as any).event?.id !== eventId) {
      throw new NotFoundException(`Alert with ID ${alertId} not found in event ${eventId}`);
    }
    return alert;
  }

  async acknowledgeAlert(eventId: number, alertId: number, userId: number): Promise<StockAlert> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) throw new NotOwnerException();

    const alert = await this.findAlert(eventId, alertId);
    if (alert.status !== AlertStatus.active) {
      throw new BadRequestException('Alert is not in active status');
    }
    return this.repository.updateAlertStatus(alertId, AlertStatus.acknowledged);
  }

  async resolveAlert(alertId: number): Promise<StockAlert> {
    return this.repository.updateAlertStatus(alertId, AlertStatus.resolved, new Date());
  }

  // ============= ALERT DETECTION =============

  /**
   * Check thresholds after a sale and create alerts if needed.
   * Called after each sale to detect low stock per sellAsWholeUnit pool.
   */
  async checkThresholdsAfterSale(
    eventId: number,
    barId: number,
    drinkIds: number[],
  ): Promise<void> {
    const uniqueDrinkIds = [...new Set(drinkIds)];

    for (const drinkId of uniqueDrinkIds) {
      // Check both stock pools: direct-sale and recipe
      for (const sellAsWholeUnit of [true, false]) {
        const threshold = await this.repository.findThresholdByEventDrinkAndType(
          eventId,
          drinkId,
          sellAsWholeUnit,
        );
        if (!threshold) continue;

        const drink = await this.repository.getDrinkById(drinkId);
        const drinkVolume = drink?.volume ?? 0;

        // Get raw stock quantity (units for whole, ml for recipe)
        const rawStock = await this.repository.getTotalStockForBarDrink(
          barId,
          drinkId,
          sellAsWholeUnit,
        );

        // Convert to units for comparison with threshold
        const currentUnits = this.toUnits(rawStock, drinkVolume, sellAsWholeUnit);

        // Check for low stock (fire when AT or below threshold)
        if (currentUnits <= threshold.lowerThreshold) {
          await this.createLowStockAlert(
            eventId,
            barId,
            drinkId,
            sellAsWholeUnit,
            currentUnits,
            threshold,
          );
        }

        // Check for projected depletion
        if (threshold.depletionHorizonMin) {
          const rate = await this.repository.getConsumptionRate(barId, drinkId, 30);
          if (rate > 0) {
            // Convert rate to units/minute
            const rateInUnits = sellAsWholeUnit
              ? rate // already in units for whole-unit sales
              : drinkVolume > 0
                ? rate / drinkVolume
                : 0;

            if (rateInUnits > 0) {
              const minutesToDepletion = currentUnits / rateInUnits;
              if (minutesToDepletion < threshold.depletionHorizonMin) {
                await this.createProjectedDepletionAlert(
                  eventId,
                  barId,
                  drinkId,
                  sellAsWholeUnit,
                  currentUnits,
                  threshold,
                  Math.round(minutesToDepletion),
                );
              }
            }
          }
        }
      }
    }
  }

  /**
   * Force check all thresholds for an event.
   * Returns both newly created alerts AND existing active/acknowledged alerts
   * for pools that are at or below threshold, so the user always sees the full picture.
   */
  async forceCheckThresholds(eventId: number, userId: number): Promise<StockAlert[]> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) throw new NotOwnerException();

    const thresholds = await this.repository.findThresholdsByEvent(eventId);
    if (thresholds.length === 0) return [];

    // Batch: fetch all drinks referenced by thresholds in one query
    const drinkIds = [...new Set(thresholds.map((t) => t.drinkId))];
    const drinks = await this.repository.getDrinksByIds(drinkIds);
    const drinkMap = new Map(drinks.map((d) => [d.id, d]));

    // Batch: fetch all bars with their stock in one query
    const allBars = await this.repository.getAllBarsWithStock(eventId);

    const resultAlerts: StockAlert[] = [];
    const seenAlertIds = new Set<number>();

    for (const threshold of thresholds) {
      const drink = drinkMap.get(threshold.drinkId);
      const drinkVolume = drink?.volume ?? 0;

      for (const bar of allBars) {
        const totalStock = bar.stocks
          .filter(
            (s) =>
              s.drinkId === threshold.drinkId &&
              s.sellAsWholeUnit === threshold.sellAsWholeUnit,
          )
          .reduce((sum, s) => sum + s.quantity, 0);

        const currentUnits = this.toUnits(totalStock, drinkVolume, threshold.sellAsWholeUnit);

        if (currentUnits <= threshold.lowerThreshold) {
          const newAlert = await this.createLowStockAlert(
            eventId,
            bar.id,
            threshold.drinkId,
            threshold.sellAsWholeUnit,
            currentUnits,
            threshold,
          );

          if (newAlert) {
            resultAlerts.push(newAlert);
            seenAlertIds.add(newAlert.id);
          } else {
            const existing = await this.repository.findActiveAlertForBarDrink(
              bar.id,
              threshold.drinkId,
              threshold.sellAsWholeUnit,
              AlertType.low_stock,
            );
            if (existing && !seenAlertIds.has(existing.id)) {
              resultAlerts.push(existing);
              seenAlertIds.add(existing.id);
            }
          }
        }
      }
    }

    return resultAlerts;
  }

  // ── Alert creation helpers ──

  private async createLowStockAlert(
    eventId: number,
    barId: number,
    drinkId: number,
    sellAsWholeUnit: boolean,
    currentUnits: number,
    threshold: StockThreshold,
  ): Promise<StockAlert | null> {
    const existing = await this.repository.findActiveAlertForBarDrink(
      barId,
      drinkId,
      sellAsWholeUnit,
      AlertType.low_stock,
    );
    if (existing) return null;

    const neededQty = threshold.lowerThreshold - currentUnits;
    const { donors, externalNeeded } = await this.findDonorBars(
      eventId,
      barId,
      drinkId,
      sellAsWholeUnit,
      neededQty,
      threshold.donationThreshold,
    );

    const drink = await this.repository.getDrinkById(drinkId);
    const label = this.stockTypeLabel(sellAsWholeUnit);
    const message = `${drink?.name ?? 'Insumo'} para ${label} alcanzó el umbral de stock (${currentUnits}/${threshold.lowerThreshold} unidades)`;

    const alert = await this.repository.createAlert({
      eventId,
      barId,
      drinkId,
      sellAsWholeUnit,
      type: AlertType.low_stock,
      currentStock: currentUnits,
      threshold: threshold.lowerThreshold,
      suggestedDonors: donors,
      externalNeeded,
      message,
    });

    await this.barsService.updateBarStatus(barId, BarStatus.lowStock);

    this.eventEmitter.emit('alert.created', {
      eventId,
      barId,
      alertId: alert.id,
      drinkId,
      drinkName: drink?.name ?? 'Unknown',
      sellAsWholeUnit,
      type: 'low_stock',
      message,
      currentStock: currentUnits,
      threshold: threshold.lowerThreshold,
      suggestedDonors: donors,
      externalNeeded,
      createdAt: alert.createdAt,
    } as AlertCreatedEvent);

    return alert;
  }

  private async createProjectedDepletionAlert(
    eventId: number,
    barId: number,
    drinkId: number,
    sellAsWholeUnit: boolean,
    currentUnits: number,
    threshold: StockThreshold,
    projectedMinutes: number,
  ): Promise<StockAlert | null> {
    const existing = await this.repository.findActiveAlertForBarDrink(
      barId,
      drinkId,
      sellAsWholeUnit,
      AlertType.projected_depletion,
    );
    if (existing) return null;

    const neededQty = threshold.lowerThreshold;
    const { donors, externalNeeded } = await this.findDonorBars(
      eventId,
      barId,
      drinkId,
      sellAsWholeUnit,
      neededQty,
      threshold.donationThreshold,
    );

    const drink = await this.repository.getDrinkById(drinkId);
    const label = this.stockTypeLabel(sellAsWholeUnit);
    const message = `${drink?.name ?? 'Insumo'} para ${label} se agotará en ~${projectedMinutes} minutos (${currentUnits} unidades restantes)`;

    const alert = await this.repository.createAlert({
      eventId,
      barId,
      drinkId,
      sellAsWholeUnit,
      type: AlertType.projected_depletion,
      currentStock: currentUnits,
      threshold: threshold.depletionHorizonMin!,
      suggestedDonors: donors,
      externalNeeded,
      projectedMinutes,
      message,
    });

    this.eventEmitter.emit('alert.created', {
      eventId,
      barId,
      alertId: alert.id,
      drinkId,
      drinkName: drink?.name ?? 'Unknown',
      sellAsWholeUnit,
      type: 'projected_depletion',
      message,
      currentStock: currentUnits,
      threshold: threshold.depletionHorizonMin!,
      suggestedDonors: donors,
      externalNeeded,
      projectedMinutes,
      createdAt: alert.createdAt,
    } as AlertCreatedEvent);

    return alert;
  }

  /**
   * Find donor bars that can contribute stock.
   */
  private async findDonorBars(
    eventId: number,
    excludeBarId: number,
    drinkId: number,
    sellAsWholeUnit: boolean,
    neededQty: number,
    donationThreshold: number,
  ): Promise<{ donors: DonorSuggestion[]; externalNeeded: boolean }> {
    const drink = await this.repository.getDrinkById(drinkId);
    const drinkVolume = drink?.volume ?? 0;

    const bars = await this.repository.getBarsWithStockForDrink(
      eventId,
      drinkId,
      sellAsWholeUnit,
    );
    const donors: DonorSuggestion[] = [];

    for (const bar of bars) {
      if (bar.id === excludeBarId) continue;

      const barUnits = this.toUnits(bar.totalStock, drinkVolume, sellAsWholeUnit);
      const surplus = barUnits - donationThreshold;
      if (surplus > 0) {
        donors.push({
          barId: bar.id,
          barName: bar.name,
          availableSurplus: surplus,
          suggestedQuantity: Math.min(surplus, neededQty),
        });
      }
    }

    donors.sort((a, b) => b.availableSurplus - a.availableSurplus);

    return {
      donors,
      externalNeeded: donors.length === 0,
    };
  }
}
