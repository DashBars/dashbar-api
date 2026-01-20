import { IsInt, IsString, IsOptional, Min } from 'class-validator';

export class CreateConsignmentReturnDto {
  @IsInt()
  drinkId: number;

  @IsInt()
  supplierId: number;

  @IsInt()
  @Min(1)
  quantityReturned: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
