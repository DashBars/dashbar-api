import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { POSSession } from '@prisma/client';

export interface POSSessionWithRelations extends POSSession {
  openedBy?: {
    id: number;
    email: string;
  };
  posnet?: {
    id: number;
    code: string;
    name: string;
  };
  _count?: {
    sales: number;
  };
}

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    posnetId: number;
    openedByUserId: number;
    openingFloat?: number;
    notes?: string;
  }): Promise<POSSessionWithRelations> {
    return this.prisma.pOSSession.create({
      data: {
        posnetId: data.posnetId,
        openedByUserId: data.openedByUserId,
        openingFloat: data.openingFloat,
        notes: data.notes,
      },
      include: {
        openedBy: {
          select: { id: true, email: true },
        },
        posnet: {
          select: { id: true, code: true, name: true },
        },
      },
    });
  }

  async findById(id: number): Promise<POSSessionWithRelations | null> {
    return this.prisma.pOSSession.findUnique({
      where: { id },
      include: {
        openedBy: {
          select: { id: true, email: true },
        },
        posnet: {
          select: { id: true, code: true, name: true },
        },
        _count: {
          select: { sales: true },
        },
      },
    });
  }

  async findActiveByPosnetId(posnetId: number): Promise<POSSessionWithRelations | null> {
    return this.prisma.pOSSession.findFirst({
      where: {
        posnetId,
        closedAt: null,
      },
      include: {
        openedBy: {
          select: { id: true, email: true },
        },
        posnet: {
          select: { id: true, code: true, name: true },
        },
        _count: {
          select: { sales: true },
        },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async findByPosnetId(posnetId: number): Promise<POSSessionWithRelations[]> {
    return this.prisma.pOSSession.findMany({
      where: { posnetId },
      include: {
        openedBy: {
          select: { id: true, email: true },
        },
        posnet: {
          select: { id: true, code: true, name: true },
        },
        _count: {
          select: { sales: true },
        },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async close(
    id: number,
    data: {
      closingFloat?: number;
      notes?: string;
    },
  ): Promise<POSSessionWithRelations> {
    return this.prisma.pOSSession.update({
      where: { id },
      data: {
        closedAt: new Date(),
        closingFloat: data.closingFloat,
        notes: data.notes,
      },
      include: {
        openedBy: {
          select: { id: true, email: true },
        },
        posnet: {
          select: { id: true, code: true, name: true },
        },
        _count: {
          select: { sales: true },
        },
      },
    });
  }

  async getSessionSummary(sessionId: number) {
    const session = await this.prisma.pOSSession.findUnique({
      where: { id: sessionId },
      include: {
        sales: {
          include: {
            payments: true,
          },
        },
      },
    });

    if (!session) return null;

    const totalSales = session.sales.length;
    const totalRevenue = session.sales.reduce((sum, sale) => sum + sale.total, 0);
    const cashTotal = session.sales.reduce((sum, sale) => {
      const cashPayments = sale.payments.filter((p) => p.method === 'cash');
      return sum + cashPayments.reduce((s, p) => s + p.amount, 0);
    }, 0);
    const cardTotal = session.sales.reduce((sum, sale) => {
      const cardPayments = sale.payments.filter((p) => p.method !== 'cash');
      return sum + cardPayments.reduce((s, p) => s + p.amount, 0);
    }, 0);

    return {
      sessionId,
      totalSales,
      totalRevenue,
      cashTotal,
      cardTotal,
      openingFloat: session.openingFloat,
      closingFloat: session.closingFloat,
      expectedCash: (session.openingFloat || 0) + cashTotal,
    };
  }
}
