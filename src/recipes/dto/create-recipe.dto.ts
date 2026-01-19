import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { BarType } from '@prisma/client';

export class CreateRecipeDto {
  @IsEnum(BarType)
  barType: BarType;

  @IsInt()
  cocktailId: number;

  @IsInt()
  drinkId: number;

  @IsInt()
  @Min(1)
  @Max(100)
  cocktailPercentage: number; // % of drink in cocktail
}
