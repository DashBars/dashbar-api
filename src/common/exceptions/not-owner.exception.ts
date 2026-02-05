import { ForbiddenException } from '@nestjs/common';

export class NotOwnerException extends ForbiddenException {
  constructor() {
    super('Only the event owner can perform this action.');
  }
}
