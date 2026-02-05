import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class MoveStockDto {
  @IsInt()
  @Min(1)
  eventId: number;

  @IsInt()
  @Min(1)
  fromBarId: number;

  @IsInt()
  @Min(1)
  toBarId: number;

  @IsInt()
  @Min(1)
  drinkId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
