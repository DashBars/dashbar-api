import { IsString, IsInt, IsBoolean, IsArray, ValidateNested, Min, ArrayMinSize, IsEnum, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { BarType } from '@prisma/client';
import { RecipeComponentDto } from './recipe-component.dto';

export class CreateRecipeDto {
  @IsString()
  cocktailName: string;

  @IsInt()
  @Min(1)
  glassVolume: number; // ml

  @IsBoolean()
  hasIce: boolean;

  /** When set with barTypes, creates event product and bar products (producto final) */
  @IsInt()
  @Min(0)
  @IsOptional()
  salePrice?: number; // cents

  @IsArray()
  @IsEnum(BarType, { each: true })
  @IsOptional()
  barTypes?: BarType[]; // empty = not final product; non-empty = product appears in event and in selected bar types

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeComponentDto)
  components: RecipeComponentDto[];
}
