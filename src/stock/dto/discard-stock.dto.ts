import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiscardStockDto)
  items: DiscardStockDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
