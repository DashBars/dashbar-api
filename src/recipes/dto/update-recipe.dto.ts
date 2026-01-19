import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateRecipeDto {
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  cocktailPercentage?: number;
}
