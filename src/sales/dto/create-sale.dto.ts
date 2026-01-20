import { IsInt, Min } from 'class-validator';

export class CreateSaleDto {
  @IsInt()
  cocktailId: number;

  @IsInt()
  @Min(1)
  quantity: number;
}
