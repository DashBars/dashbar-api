import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { POSSalesRepository, POSSaleWithRelations } from './pos-sales.repository';
import { PosnetsService } from './posnets.service';
import { SessionsService } from './sessions.service';
import { SalesService } from '../sales/sales.service';
import { CatalogService } from '../catalog/catalog.service';
import { POSSaleStatus, PaymentMethod, PosnetStatus } from '@prisma/client';

export interface CreateSaleDto {
  items: Array<{
    cocktailId: number;
    quantity: number;
  }>;
  paymentMethod: PaymentMethod;
  idempotencyKey?: string;
}

export interface RefundDto {
  reason?: string;
}

@Injectable()
export class POSSalesService {
  constructor(
    private readonly salesRepository: POSSalesRepository,
    private readonly posnetsService: PosnetsService,
    private readonly sessionsService: SessionsService,
    private readonly legacySalesService: SalesService,
    private readonly catalogService: CatalogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a sale with full processing
   */
  async createSale(
    posnetId: number,
    dto: CreateSaleDto,
    cashierUserId?: number,
  ): Promise<POSSaleWithRelations> {
    // Check idempotency - return existing sale if key matches
    if (dto.idempotencyKey) {
      const existing = await this.salesRepository.findByIdempotencyKey(dto.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    // Validate POS terminal
    const posnet = await this.posnetsService.findById(posnetId);
    
    if (!posnet.enabled) {
      throw new ForbiddenException('POS terminal is disabled');
    }

    if (posnet.status === PosnetStatus.CLOSED) {
      throw new ForbiddenException('POS terminal is closed. Open a session first.');
    }

    // Get active session
    const session = await this.sessionsService.getActiveSession(posnetId);

    // Get catalog with prices resolved for this bar
    const catalog = await this.catalogService.getCatalog(posnet.eventId, posnet.barId);

    // Build price map from catalog
    const priceMap = this.buildPriceMap(catalog);

    // Validate items and build sale items
    const items: Array<{
      productId?: number;
      cocktailId: number;
      productNameSnapshot: string;
      unitPriceSnapshot: number;
      quantity: number;
      lineTotal: number;
    }> = [];

    for (const item of dto.items) {
      const cocktailInfo = priceMap.get(item.cocktailId);
      if (!cocktailInfo) {
        throw new BadRequestException(
          `Cocktail with ID ${item.cocktailId} not found in catalog`,
        );
      }

      if (item.quantity < 1) {
        throw new BadRequestException('Quantity must be at least 1');
      }

      items.push({
        cocktailId: item.cocktailId,
        productNameSnapshot: cocktailInfo.name,
        unitPriceSnapshot: cocktailInfo.price,
        quantity: item.quantity,
        lineTotal: cocktailInfo.price * item.quantity,
      });
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const tax = 0; // TODO: Implement tax calculation
    const total = subtotal + tax;

    // Process stock depletion for each item
    for (const item of dto.items) {
      try {
        await this.legacySalesService.createSale(posnet.eventId, posnet.barId, {
          cocktailId: item.cocktailId,
          quantity: item.quantity,
        });
      } catch (error: any) {
        // Handle stock errors gracefully
        if (error.message?.includes('Insufficient stock')) {
          throw new BadRequestException(
            `Insufficient stock for item: ${priceMap.get(item.cocktailId)?.name}`,
          );
        }
        throw error;
      }
    }

    // Create the POS sale record
    const sale = await this.salesRepository.create({
      posnetId,
      sessionId: session?.id,
      eventId: posnet.eventId,
      barId: posnet.barId,
      cashierUserId,
      subtotal,
      tax,
      total,
      idempotencyKey: dto.idempotencyKey,
      items,
      payment: {
        method: dto.paymentMethod,
        amount: total,
        idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}-payment` : undefined,
      },
    });

    // Emit sale completed event
    this.eventEmitter.emit('pos.sale.completed', {
      saleId: sale.id,
      posnetId,
      eventId: posnet.eventId,
      barId: posnet.barId,
      total,
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    });

    return sale;
  }

  /**
   * Get recent sales for a POS terminal
   */
  async getSales(
    posnetId: number,
    options?: { since?: Date; limit?: number },
  ): Promise<POSSaleWithRelations[]> {
    // Validate POS exists
    await this.posnetsService.findById(posnetId);
    return this.salesRepository.findByPosnetId(posnetId, options);
  }

  /**
   * Get paginated sales for an event
   */
  async getEventSales(
    eventId: number,
    options?: { page?: number; limit?: number },
  ): Promise<{ sales: POSSaleWithRelations[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const result = await this.salesRepository.findByEventId(eventId, { page, limit });
    return {
      ...result,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  /**
   * Get a specific sale by ID
   */
  async getSaleById(saleId: number): Promise<POSSaleWithRelations> {
    const sale = await this.salesRepository.findById(saleId);
    if (!sale) {
      throw new NotFoundException(`Sale with ID ${saleId} not found`);
    }
    return sale;
  }

  /**
   * Process a refund for a sale
   */
  async refundSale(
    posnetId: number,
    saleId: number,
    dto: RefundDto,
  ): Promise<POSSaleWithRelations> {
    const sale = await this.getSaleById(saleId);

    if (sale.posnetId !== posnetId) {
      throw new BadRequestException('Sale does not belong to this POS terminal');
    }

    if (sale.status === POSSaleStatus.REFUNDED) {
      throw new BadRequestException('Sale has already been refunded');
    }

    if (sale.status === POSSaleStatus.VOIDED) {
      throw new BadRequestException('Cannot refund a voided sale');
    }

    // Get original payment method
    const originalPayment = sale.payments[0];
    if (!originalPayment) {
      throw new BadRequestException('No payment found for this sale');
    }

    // Create refund payment (negative amount)
    await this.salesRepository.addRefundPayment(saleId, {
      method: originalPayment.method,
      amount: -sale.total,
      externalRef: dto.reason,
    });

    // Update sale status
    const refundedSale = await this.salesRepository.updateStatus(saleId, POSSaleStatus.REFUNDED);

    // TODO: Restore stock for refunded items

    // Emit refund event
    this.eventEmitter.emit('pos.sale.refunded', {
      saleId,
      posnetId,
      eventId: sale.eventId,
      barId: sale.barId,
      total: sale.total,
    });

    return refundedSale;
  }

  /**
   * Generate receipt data for a sale
   */
  async generateReceipt(saleId: number): Promise<ReceiptData> {
    const sale = await this.getSaleById(saleId);

    return {
      receiptId: `RCP-${sale.id.toString().padStart(8, '0')}`,
      transactionId: sale.id.toString(),
      posCode: sale.posnet?.code || 'N/A',
      posName: sale.posnet?.name || 'N/A',
      eventName: sale.event?.name || 'N/A',
      barName: sale.bar?.name || 'N/A',
      timestamp: sale.createdAt,
      items: sale.items.map((item) => ({
        name: item.productNameSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPriceSnapshot,
        lineTotal: item.lineTotal,
      })),
      subtotal: sale.subtotal,
      tax: sale.tax,
      total: sale.total,
      paymentMethod: sale.payments[0]?.method || 'cash',
      status: sale.status,
    };
  }

  /**
   * Build a map of cocktailId -> {name, price} from catalog
   */
  private buildPriceMap(
    catalog: any,
  ): Map<number, { name: string; price: number }> {
    const priceMap = new Map<number, { name: string; price: number }>();

    // Add cocktails from categories
    for (const category of catalog.categories) {
      for (const cocktail of category.cocktails) {
        priceMap.set(cocktail.id, {
          name: cocktail.name,
          price: cocktail.price,
        });
      }
    }

    // Add uncategorized cocktails
    for (const cocktail of catalog.uncategorized) {
      priceMap.set(cocktail.id, {
        name: cocktail.name,
        price: cocktail.price,
      });
    }

    // Add products with cocktailId (from EventProduct -> EventProductCocktail)
    // This ensures direct-sale items and any product not in categories/uncategorized
    // are also available for price resolution
    if (catalog.products) {
      for (const product of catalog.products) {
        if (product.cocktailId && !priceMap.has(product.cocktailId)) {
          priceMap.set(product.cocktailId, {
            name: product.name,
            price: product.price,
          });
        }
      }
    }

    return priceMap;
  }
}

export interface ReceiptData {
  receiptId: string;
  transactionId: string;
  posCode: string;
  posName: string;
  eventName: string;
  barName: string;
  timestamp: Date;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  status: POSSaleStatus;
}
