import { IsString, IsOptional, IsInt, IsBoolean, Min, IsUrl } from 'class-validator';

export class CreateCocktailDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsInt()
  @Min(0)
  price: number; // in cents

  @IsInt()
  @Min(1)
  volume: number; // in ml

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isCombo?: boolean;
}
