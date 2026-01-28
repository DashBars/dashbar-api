import { IsInt, Max, Min } from 'class-validator';

export class RecipeComponentDto {
  @IsInt()
  drinkId: number;

  @IsInt()
  @Min(1)
  @Max(100)
  percentage: number; // % of drink in cocktail
}

