import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Posnet, PosnetStatus, Prisma } from '@prisma/client';

export interface PosnetWithRelations extends Posnet {
  event?: {
    id: number;
    name: string;
  };
  bar?: {
    id: number;
    name: string;
    type: string;
  };
  _count?: {
    sessions: number;
    sales: number;
  };
}

@Injectable()
export class PosnetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    code: string;
    name: string;
    eventId: number;
    barId: number;
    authToken: string;
  }): Promise<PosnetWithRelations> {
    return this.prisma.posnet.create({
      data: {
        code: data.code,
        name: data.name,
        eventId: data.eventId,
        barId: data.barId,
        authToken: data.authToken,
        status: PosnetStatus.CLOSED,
        enabled: true,
      },
      include: {
        event: {
          select: { id: true, name: true },
        },
        bar: {
          select: { id: true, name: true, type: true },
        },
      },
    });
  }

  async findById(id: number): Promise<PosnetWithRelations | null> {
    return this.prisma.posnet.findUnique({
      where: { id },
      include: {
        event: {
          select: { id: true, name: true },
        },
        bar: {
          select: { id: true, name: true, type: true },
        },
        _count: {
          select: { sessions: true, sales: true },
        },
      },
    });
  }

  async findByCode(code: string): Promise<PosnetWithRelations | null> {
    return this.prisma.posnet.findUnique({
      where: { code },
      include: {
        event: {
          select: { id: true, name: true },
        },
        bar: {
          select: { id: true, name: true, type: true },
        },
      },
    });
  }

  async findByAuthToken(authToken: string): Promise<PosnetWithRelations | null> {
    return this.prisma.posnet.findFirst({
      where: { authToken },
      include: {
        event: {
          select: { id: true, name: true },
        },
        bar: {
          select: { id: true, name: true, type: true },
        },
      },
    });
  }

  async findByEventId(eventId: number): Promise<PosnetWithRelations[]> {
    return this.prisma.posnet.findMany({
      where: { eventId },
      include: {
        event: {
          select: { id: true, name: true },
        },
        bar: {
          select: { id: true, name: true, type: true },
        },
        _count: {
          select: { sessions: true, sales: true },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findByBarId(barId: number): Promise<PosnetWithRelations[]> {
    return this.prisma.posnet.findMany({
      where: { barId },
      include: {
        event: {
          select: { id: true, name: true },
        },
        bar: {
          select: { id: true, name: true, type: true },
        },
        _count: {
          select: { sessions: true, sales: true },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  async update(
    id: number,
    data: {
      name?: string;
      status?: PosnetStatus;
      enabled?: boolean;
      authToken?: string;
      lastHeartbeatAt?: Date;
      traffic?: number;
    },
  ): Promise<PosnetWithRelations> {
    return this.prisma.posnet.update({
      where: { id },
      data,
      include: {
        event: {
          select: { id: true, name: true },
        },
        bar: {
          select: { id: true, name: true, type: true },
        },
      },
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.posnet.delete({
      where: { id },
    });
  }

  async updateHeartbeat(id: number): Promise<void> {
    await this.prisma.posnet.update({
      where: { id },
      data: { lastHeartbeatAt: new Date() },
    });
  }

  async codeExists(code: string): Promise<boolean> {
    const count = await this.prisma.posnet.count({
      where: { code },
    });
    return count > 0;
  }

  async getActiveSession(posnetId: number) {
    return this.prisma.pOSSession.findFirst({
      where: {
        posnetId,
        closedAt: null,
      },
      include: {
        openedBy: {
          select: { id: true, email: true },
        },
      },
      orderBy: { openedAt: 'desc' },
    });
  }
}
