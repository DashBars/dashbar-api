import { IsInt, Min } from 'class-validator';

export class UpdatePriceDto {
  @IsInt()
  @Min(0)
  price: number; // in cents
}
