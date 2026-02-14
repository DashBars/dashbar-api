import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class DiscardStockDto {
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

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkDiscardStockDto {
  @Type(() => DiscardStockDto)
  items: DiscardStockDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
