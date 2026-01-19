import { ForbiddenException } from '@nestjs/common';

export class EventStartedException extends ForbiddenException {
  constructor(action: string = 'modify') {
    super(`Cannot ${action} after the event has started. Recipes and prices are immutable once the event begins.`);
  }
}
