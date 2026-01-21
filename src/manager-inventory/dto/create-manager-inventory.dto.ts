import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateManagerInventoryDto {
  @IsInt()
  @Min(1)
  drinkId: number;

  @IsInt()
  @Min(1)
  supplierId: number;

  @IsInt()
  @Min(1)
  totalQuantity: number;

  @IsInt()
  @Min(0)
  unitCost: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  sku?: string;
}
