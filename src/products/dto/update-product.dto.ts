import { IsString, IsInt, IsArray, ArrayMinSize, Min, IsOptional } from 'class-validator';

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @IsOptional()
  cocktailIds?: number[];
}
