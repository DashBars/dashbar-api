import { IsInt, Min, IsOptional } from 'class-validator';

export class CreatePriceDto {
  @IsInt()
  cocktailId: number;

  @IsInt()
  @Min(0)
  price: number; // in cents

  /** Optional: bar ID for per-bar price override. Omit for event-level default price. */
  @IsOptional()
  @IsInt()
  barId?: number;
}
