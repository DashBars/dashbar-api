import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReturnPolicy, Prisma } from '@prisma/client';

@Injectable()
export class ReturnPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEventId(eventId: number): Promise<ReturnPolicy | null> {
    return this.prisma.returnPolicy.findUnique({
      where: { eventId },
      include: {
        returns: {
          include: {
            bar: true,
            drink: true,
            supplier: true,
          },
        },
      },
    });
  }

  async create(data: Prisma.ReturnPolicyCreateInput): Promise<ReturnPolicy> {
    return this.prisma.returnPolicy.create({
      data,
      include: {
        returns: true,
      },
    });
  }

  async update(
    eventId: number,
    data: Prisma.ReturnPolicyUpdateInput,
  ): Promise<ReturnPolicy> {
    return this.prisma.returnPolicy.update({
      where: { eventId },
      data,
      include: {
        returns: true,
      },
    });
  }

  async upsert(
    eventId: number,
    ownerId: number,
    data: { autoReturnToGlobal?: boolean; requireApproval?: boolean },
  ): Promise<ReturnPolicy> {
    return this.prisma.returnPolicy.upsert({
      where: { eventId },
      create: {
        eventId,
        ownerId,
        autoReturnToGlobal: data.autoReturnToGlobal ?? true,
        requireApproval: data.requireApproval ?? false,
      },
      update: {
        autoReturnToGlobal: data.autoReturnToGlobal,
        requireApproval: data.requireApproval,
      },
      include: {
        returns: true,
      },
    });
  }
}
