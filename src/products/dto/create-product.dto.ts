import { IsString, IsInt, IsArray, ArrayMinSize, Min, IsOptional } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name: string; // e.g., "Combo Coca + Sprite", "Gin Tonic Premium"

  @IsInt()
  @Min(0)
  price: number; // price in cents

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  cocktailIds: number[]; // One or multiple cocktails (for combos)

  @IsInt()
  @IsOptional()
  barId?: number; // null = event-level product, set = bar-specific override
}
