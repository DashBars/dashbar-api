import { BadRequestException } from '@nestjs/common';

export class InsufficientStockException extends BadRequestException {
  constructor(drinkId: number, required: number, available: number) {
    super(
      `Insufficient stock for drink ID ${drinkId}. Required: ${required}, Available: ${available}`,
    );
  }
}
