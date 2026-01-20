import { BadRequestException } from '@nestjs/common';

export class OverReturnException extends BadRequestException {
  constructor(requested: number, available: number) {
    super(
      `Cannot return ${requested} units. Only ${available} units available in stock.`,
    );
  }
}
