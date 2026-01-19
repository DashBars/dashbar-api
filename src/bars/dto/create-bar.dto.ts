import { IsEnum, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { BarType, BarStatus } from '@prisma/client';

export class CreateBarDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(BarType)
  type: BarType;

  @IsEnum(BarStatus)
  status: BarStatus = BarStatus.closed;
}
