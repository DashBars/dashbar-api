import { IsInt, Min, Max } from 'class-validator';

export class CreateRecipeOverrideDto {
  @IsInt()
  cocktailId: number;

  @IsInt()
  drinkId: number;

  @IsInt()
  @Min(1)
  @Max(100)
  cocktailPercentage: number;
}
