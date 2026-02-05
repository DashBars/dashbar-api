import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TransfersRepository } from './transfers.repository';
import { EventsService } from '../events/events.service';
import { AlarmsService } from '../alarms/alarms.service';
import { CreateTransferDto } from './dto';
import { NotOwnerException } from '../common/exceptions';
import { StockTransfer, TransferStatus } from '@prisma/client';

export interface TransferStatusEvent {
  eventId: number;
  transferId: number;
  receiverBarId: number;
  donorBarId: number;
  drinkId: number;
  status: TransferStatus;
  quantity: number;
}

@Injectable()
export class TransfersService {
  constructor(
    private readonly repository: TransfersRepository,
    private readonly eventsService: EventsService,
    private readonly alarmsService: AlarmsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a transfer request
   */
  async createTransfer(
    eventId: number,
    userId: number,
    dto: CreateTransferDto,
  ): Promise<StockTransfer> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    // Validate receiver bar belongs to event
    const receiverBar = await this.repository.getBarWithEvent(dto.receiverBarId);
    if (!receiverBar || receiverBar.eventId !== eventId) {
      throw new NotFoundException(
        `Receiver bar ${dto.receiverBarId} not found in event ${eventId}`,
      );
    }

    // Validate donor bar belongs to event
    const donorBar = await this.repository.getBarWithEvent(dto.donorBarId);
    if (!donorBar || donorBar.eventId !== eventId) {
      throw new NotFoundException(
        `Donor bar ${dto.donorBarId} not found in event ${eventId}`,
      );
    }

    // Validate receiver and donor are different
    if (dto.receiverBarId === dto.donorBarId) {
      throw new BadRequestException('Receiver and donor bars must be different');
    }

    // Validate quantity
    if (dto.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    // Validate donor has enough stock
    const donorStock = await this.repository.getTotalStock(
      dto.donorBarId,
      dto.drinkId,
    );

    if (donorStock < dto.quantity) {
      throw new BadRequestException(
        `Donor bar does not have enough stock. Available: ${donorStock}, Requested: ${dto.quantity}`,
      );
    }

    const transfer = await this.repository.create({
      eventId,
      receiverBarId: dto.receiverBarId,
      donorBarId: dto.donorBarId,
      drinkId: dto.drinkId,
      quantity: dto.quantity,
      alertId: dto.alertId,
      notes: dto.notes,
      status: TransferStatus.requested,
    });

    this.emitStatusChange(transfer);

    return transfer;
  }

  /**
   * Get all transfers for an event
   */
  async findAllTransfers(
    eventId: number,
    status?: TransferStatus,
  ): Promise<StockTransfer[]> {
    await this.eventsService.findById(eventId);
    return this.repository.findByEvent(eventId, status);
  }

  /**
   * Get a specific transfer
   */
  async findTransfer(eventId: number, transferId: number): Promise<StockTransfer> {
    const transfer = await this.repository.findById(transferId);

    if (!transfer || (transfer as any).event?.id !== eventId) {
      throw new NotFoundException(
        `Transfer with ID ${transferId} not found in event ${eventId}`,
      );
    }

    return transfer;
  }

  /**
   * Approve a transfer request
   */
  async approveTransfer(
    eventId: number,
    transferId: number,
    userId: number,
  ): Promise<StockTransfer> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const transfer = await this.findTransfer(eventId, transferId);

    if (transfer.status !== TransferStatus.requested) {
      throw new BadRequestException(
        `Transfer is not in requested status. Current status: ${transfer.status}`,
      );
    }

    // Verify donor still has enough stock
    const donorStock = await this.repository.getTotalStock(
      transfer.donorBarId,
      transfer.drinkId,
    );

    if (donorStock < transfer.quantity) {
      throw new BadRequestException(
        `Donor bar no longer has enough stock. Available: ${donorStock}, Required: ${transfer.quantity}`,
      );
    }

    const updated = await this.repository.updateStatus(
      transferId,
      TransferStatus.approved,
      { approvedAt: new Date() },
    );

    this.emitStatusChange(updated);

    return updated;
  }

  /**
   * Reject a transfer request
   */
  async rejectTransfer(
    eventId: number,
    transferId: number,
    userId: number,
  ): Promise<StockTransfer> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const transfer = await this.findTransfer(eventId, transferId);

    if (transfer.status !== TransferStatus.requested) {
      throw new BadRequestException(
        `Transfer is not in requested status. Current status: ${transfer.status}`,
      );
    }

    const updated = await this.repository.updateStatus(
      transferId,
      TransferStatus.rejected,
    );

    this.emitStatusChange(updated);

    return updated;
  }

  /**
   * Complete a transfer (move stock)
   */
  async completeTransfer(
    eventId: number,
    transferId: number,
    userId: number,
  ): Promise<StockTransfer> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const transfer = await this.findTransfer(eventId, transferId);

    if (transfer.status !== TransferStatus.approved) {
      throw new BadRequestException(
        `Transfer must be approved before completion. Current status: ${transfer.status}`,
      );
    }

    // Get donor stock lots
    const donorStockLots = await this.repository.getStockForBarDrink(
      transfer.donorBarId,
      transfer.drinkId,
    );

    // Verify donor still has enough stock
    const totalDonorStock = donorStockLots.reduce((sum, s) => sum + s.quantity, 0);

    if (totalDonorStock < transfer.quantity) {
      throw new BadRequestException(
        `Donor bar no longer has enough stock. Available: ${totalDonorStock}, Required: ${transfer.quantity}`,
      );
    }

    // Execute transfer in transaction
    const completed = await this.repository.completeTransfer(
      transfer,
      donorStockLots.map((s) => ({
        barId: s.barId,
        drinkId: s.drinkId,
        supplierId: s.supplierId,
        quantity: s.quantity,
        sellAsWholeUnit: s.sellAsWholeUnit,
      })),
    );

    this.emitStatusChange(completed);

    // Emit transfer.completed for additional processing
    this.eventEmitter.emit('transfer.completed', {
      eventId,
      transferId: completed.id,
      receiverBarId: completed.receiverBarId,
      donorBarId: completed.donorBarId,
      drinkId: completed.drinkId,
      quantity: completed.quantity,
    });

    return completed;
  }

  /**
   * Cancel a transfer request
   */
  async cancelTransfer(
    eventId: number,
    transferId: number,
    userId: number,
  ): Promise<StockTransfer> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const transfer = await this.findTransfer(eventId, transferId);

    if (
      transfer.status !== TransferStatus.requested &&
      transfer.status !== TransferStatus.approved
    ) {
      throw new BadRequestException(
        `Transfer cannot be cancelled. Current status: ${transfer.status}`,
      );
    }

    const updated = await this.repository.updateStatus(
      transferId,
      TransferStatus.cancelled,
    );

    this.emitStatusChange(updated);

    return updated;
  }

  /**
   * Emit transfer status change event
   */
  private emitStatusChange(transfer: StockTransfer): void {
    this.eventEmitter.emit('transfer.status_changed', {
      eventId: transfer.eventId,
      transferId: transfer.id,
      receiverBarId: transfer.receiverBarId,
      donorBarId: transfer.donorBarId,
      drinkId: transfer.drinkId,
      status: transfer.status,
      quantity: transfer.quantity,
    } as TransferStatusEvent);
  }
}
