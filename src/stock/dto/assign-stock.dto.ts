import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class AssignStockDto {
  @IsInt()
  @Min(1)
  globalInventoryId: number;

  @IsInt()
  @Min(1)
  eventId: number;

  @IsInt()
  @Min(1)
  barId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
