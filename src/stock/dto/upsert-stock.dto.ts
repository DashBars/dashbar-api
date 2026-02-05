import { IsInt, IsString, IsOptional, IsEnum, Min } from 'class-validator';
import { OwnershipMode } from '@prisma/client';

export class UpsertStockDto {
  @IsInt()
  drinkId: number;

  @IsInt()
  supplierId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsInt()
  @Min(0)
  unitCost: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsEnum(OwnershipMode)
  ownershipMode: OwnershipMode;
}
