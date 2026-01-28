import { IsString, IsInt, IsBoolean, IsArray, ValidateNested, Min, ArrayMinSize, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { BarType } from '@prisma/client';
import { RecipeComponentDto } from './recipe-component.dto';

export class UpdateRecipeDto {
  @IsString()
  @IsOptional()
  cocktailName?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  glassVolume?: number;

  @IsBoolean()
  @IsOptional()
  hasIce?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  salePrice?: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(BarType, { each: true })
  @IsOptional()
  barTypes?: BarType[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeComponentDto)
  @IsOptional()
  components?: RecipeComponentDto[];
}
