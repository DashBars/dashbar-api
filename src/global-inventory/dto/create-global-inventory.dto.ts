import { IsInt, IsNotEmpty, IsOptional, IsString, IsEnum, Min } from 'class-validator';
import { OwnershipMode } from '@prisma/client';

export class CreateGlobalInventoryDto {
  @IsInt()
  @Min(1)
  drinkId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  supplierId?: number;

  @IsInt()
  @Min(1)
  totalQuantity: number;

  @IsInt()
  @Min(0)
  unitCost: number; // Costo unitario en centavos

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsEnum(OwnershipMode)
  ownershipMode?: OwnershipMode;
}
