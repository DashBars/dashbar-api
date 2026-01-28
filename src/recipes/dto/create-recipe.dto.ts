import { IsString, IsInt, IsBoolean, IsArray, ValidateNested, Min, ArrayMinSize, IsEnum } from 'class-validator';
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

  @IsInt()
  @Min(0)
  salePrice: number; // precio de venta en centavos

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(BarType, { each: true })
  barTypes: BarType[]; // Array de tipos de barra

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipeComponentDto)
  components: RecipeComponentDto[];
}
