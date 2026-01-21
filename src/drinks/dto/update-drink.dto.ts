import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { DrinkType } from '@prisma/client';

export class UpdateDrinkDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsEnum(DrinkType)
  drinkType?: DrinkType;

  @IsOptional()
  @IsInt()
  @Min(1)
  volume?: number;
}
