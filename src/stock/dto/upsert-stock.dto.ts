import { IsInt, Min } from 'class-validator';

export class UpsertStockDto {
  @IsInt()
  drinkId: number;

  @IsInt()
  @Min(0)
  amount: number;
}
