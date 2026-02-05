import { IsInt, IsOptional, Min, Max } from 'class-validator';

export class UpdateRecipeOverrideDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  cocktailPercentage?: number;
}
