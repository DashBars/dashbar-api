import { IsArray, IsInt, ValidateNested, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

class CocktailAssignment {
  @IsInt()
  cocktailId: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortIndex?: number;
}

export class AssignCocktailsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CocktailAssignment)
  cocktails: CocktailAssignment[];
}
