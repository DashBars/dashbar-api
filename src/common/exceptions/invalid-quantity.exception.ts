import { BadRequestException } from '@nestjs/common';

export class InvalidQuantityException extends BadRequestException {
  constructor(message?: string) {
    super(message || 'Quantity must be greater than 0');
  }
}
