import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTransferDto {
  @IsInt()
  receiverBarId: number;

  @IsInt()
  donorBarId: number;

  @IsInt()
  drinkId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsInt()
  alertId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
