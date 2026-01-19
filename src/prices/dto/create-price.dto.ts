import { IsInt, Min } from 'class-validator';

export class CreatePriceDto {
  @IsInt()
  cocktailId: number;

  @IsInt()
  @Min(0)
  price: number; // in cents
}
