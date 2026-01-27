import { IsInt, IsOptional, IsString, IsEnum, Min } from 'class-validator';
import { OwnershipMode } from '@prisma/client';

export class UpdateGlobalInventoryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  totalQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitCost?: number; // Costo unitario en centavos

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
