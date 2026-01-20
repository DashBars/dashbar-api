import { Type } from 'class-transformer';
import {
  IsInt,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Min,
} from 'class-validator';

export class CheckoutItemDto {
  @IsInt()
  cocktailId: number;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CheckoutDto {
  @IsInt()
  barId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];
}
