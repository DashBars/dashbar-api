import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { POSSale, POSSaleStatus, PaymentMethod, POSPaymentStatus, Prisma } from '@prisma/client';

export interface POSSaleWithRelations extends POSSale {
  items: Array<{
    id: number;
    productId: number | null;
    cocktailId: number | null;
    productNameSnapshot: string;
    unitPriceSnapshot: number;
    quantity: number;
    lineTotal: number;
  }>;
  payments: Array<{
    id: number;
    method: PaymentMethod;
    amount: number;
    currency: string;
    status: POSPaymentStatus;
    externalRef: string | null;
    createdAt: Date;
  }>;
  posnet?: {
    id: number;
    code: string;
    name: string;
  };
  bar?: {
    id: number;
    name: string;
    type: string;
  };
  event?: {
    id: number;
    name: string;
  };
  cashier?: {
    id: number;
    email: string;
  } | null;
}

export interface CreatePOSSaleData {
  posnetId: number;
  sessionId?: number;
  eventId: number;
  barId: number;
  cashierUserId?: number;
  subtotal: number;
  tax: number;
  total: number;
  idempotencyKey?: string;
  items: Array<{
    productId?: number;
    cocktailId?: number;
    productNameSnapshot: string;
    unitPriceSnapshot: number;
    quantity: number;
    lineTotal: number;
  }>;
  payment: {
    method: PaymentMethod;
    amount: number;
    currency?: string;
    idempotencyKey?: string;
    externalRef?: string;
  };
}

@Injectable()
export class POSSalesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreatePOSSaleData): Promise<POSSaleWithRelations> {
    return this.prisma.pOSSale.create({
      data: {
        posnetId: data.posnetId,
        sessionId: data.sessionId,
        eventId: data.eventId,
        barId: data.barId,
        cashierUserId: data.cashierUserId,
        subtotal: data.subtotal,
        tax: data.tax,
        total: data.total,
        status: POSSaleStatus.COMPLETED,
        idempotencyKey: data.idempotencyKey,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            cocktailId: item.cocktailId,
            productNameSnapshot: item.productNameSnapshot,
            unitPriceSnapshot: item.unitPriceSnapshot,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
          })),
        },
        payments: {
          create: {
            method: data.payment.method,
            amount: data.payment.amount,
            currency: data.payment.currency || 'ARS',
            status: POSPaymentStatus.SUCCESS,
            idempotencyKey: data.payment.idempotencyKey,
            externalRef: data.payment.externalRef,
          },
        },
      },
      include: {
        items: true,
        payments: true,
        posnet: {
          select: { id: true, code: true, name: true },
        },
        bar: {
          select: { id: true, name: true, type: true },
        },
        event: {
          select: { id: true, name: true },
        },
        cashier: {
          select: { id: true, email: true },
        },
      },
    });
  }

  async findById(id: number): Promise<POSSaleWithRelations | null> {
    return this.prisma.pOSSale.findUnique({
      where: { id },
      include: {
        items: true,
        payments: true,
        posnet: {
          select: { id: true, code: true, name: true },
        },
        bar: {
          select: { id: true, name: true, type: true },
        },
        event: {
          select: { id: true, name: true },
        },
        cashier: {
          select: { id: true, email: true },
        },
      },
    });
  }

  async findByIdempotencyKey(key: string): Promise<POSSaleWithRelations | null> {
    return this.prisma.pOSSale.findUnique({
      where: { idempotencyKey: key },
      include: {
        items: true,
        payments: true,
        posnet: {
          select: { id: true, code: true, name: true },
        },
        bar: {
          select: { id: true, name: true, type: true },
        },
        event: {
          select: { id: true, name: true },
        },
        cashier: {
          select: { id: true, email: true },
        },
      },
    });
  }

  async findByPosnetId(
    posnetId: number,
    options?: { since?: Date; limit?: number },
  ): Promise<POSSaleWithRelations[]> {
    return this.prisma.pOSSale.findMany({
      where: {
        posnetId,
        ...(options?.since && { createdAt: { gte: options.since } }),
      },
      include: {
        items: true,
        payments: true,
        posnet: {
          select: { id: true, code: true, name: true },
        },
        bar: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
    });
  }

  async findBySessionId(sessionId: number): Promise<POSSaleWithRelations[]> {
    return this.prisma.pOSSale.findMany({
      where: { sessionId },
      include: {
        items: true,
        payments: true,
        posnet: {
          select: { id: true, code: true, name: true },
        },
        bar: {
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: number, status: POSSaleStatus): Promise<POSSaleWithRelations> {
    return this.prisma.pOSSale.update({
      where: { id },
      data: { status },
      include: {
        items: true,
        payments: true,
        posnet: {
          select: { id: true, code: true, name: true },
        },
        bar: {
          select: { id: true, name: true, type: true },
        },
        event: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async addRefundPayment(
    saleId: number,
    data: {
      method: PaymentMethod;
      amount: number; // Negative for refunds
      currency?: string;
      externalRef?: string;
    },
  ) {
    return this.prisma.pOSPayment.create({
      data: {
        saleId,
        method: data.method,
        amount: data.amount,
        currency: data.currency || 'ARS',
        status: POSPaymentStatus.SUCCESS,
        externalRef: data.externalRef,
      },
    });
  }

  async findByEventId(
    eventId: number,
    options?: { page?: number; limit?: number },
  ): Promise<{ sales: POSSaleWithRelations[]; total: number }> {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    const [sales, total] = await this.prisma.$transaction([
      this.prisma.pOSSale.findMany({
        where: { eventId, status: POSSaleStatus.COMPLETED },
        include: {
          items: true,
          payments: true,
          posnet: {
            select: { id: true, code: true, name: true },
          },
          bar: {
            select: { id: true, name: true, type: true },
          },
          event: {
            select: { id: true, name: true },
          },
          cashier: {
            select: { id: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.pOSSale.count({
        where: { eventId, status: POSSaleStatus.COMPLETED },
      }),
    ]);

    return { sales: sales as POSSaleWithRelations[], total };
  }

  async getSalesStats(
    posnetId: number,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const sales = await this.prisma.pOSSale.findMany({
      where: {
        posnetId,
        status: POSSaleStatus.COMPLETED,
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      select: {
        id: true,
        total: true,
        createdAt: true,
      },
    });

    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
    const avgSaleValue = totalSales > 0 ? totalRevenue / totalSales : 0;

    return {
      totalSales,
      totalRevenue,
      avgSaleValue,
      periodStart,
      periodEnd,
    };
  }
}
