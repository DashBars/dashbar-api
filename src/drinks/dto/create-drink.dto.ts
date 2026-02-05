import { IsEnum, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { DrinkType } from '@prisma/client';

export class CreateDrinkDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  brand: string;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsEnum(DrinkType)
  drinkType: DrinkType;

  @IsInt()
  @Min(1)
  volume: number; // ml
}
