import { IsInt, IsNotEmpty, Min } from 'class-validator';

export class TransferToBarDto {
  @IsInt()
  @Min(1)
  eventId: number;

  @IsInt()
  @Min(1)
  barId: number;

  @IsInt()
  @Min(1)
  quantity: number;
}
