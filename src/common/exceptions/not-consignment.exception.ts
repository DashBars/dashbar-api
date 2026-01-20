import { BadRequestException } from '@nestjs/common';

export class NotConsignmentException extends BadRequestException {
  constructor() {
    super('Only consignment stock can be returned. This stock is marked as purchased.');
  }
}
