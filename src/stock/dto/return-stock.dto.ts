import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class ReturnStockDto {
  @IsInt()
  @Min(1)
  eventId: number;

  @IsInt()
  @Min(1)
  barId: number;

  @IsInt()
  @Min(1)
  drinkId: number;

  @IsInt()
  @Min(1)
  supplierId: number;

  @IsBoolean()
  sellAsWholeUnit: boolean;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
