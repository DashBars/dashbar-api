import { Injectable, NotFoundException } from '@nestjs/common';
import { ReturnPolicyRepository } from './return-policy.repository';
import { CreateReturnPolicyDto } from './dto';
import { EventsService } from '../events/events.service';
import { NotOwnerException } from '../common/exceptions';

@Injectable()
export class ReturnPolicyService {
  constructor(
    private readonly repository: ReturnPolicyRepository,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Get return policy for an event
   */
  async findByEventId(eventId: number, userId: number) {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    return this.repository.findByEventId(eventId);
  }

  /**
   * Create or update return policy for an event
   */
  async upsert(
    eventId: number,
    userId: number,
    dto: CreateReturnPolicyDto,
  ) {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    return this.repository.upsert(eventId, userId, {
      autoReturnToGlobal: dto.autoReturnToGlobal ?? true,
      requireApproval: dto.requireApproval ?? false,
    });
  }
}
