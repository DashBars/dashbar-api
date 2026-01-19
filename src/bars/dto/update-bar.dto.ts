import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BarType, BarStatus } from '@prisma/client';

export class UpdateBarDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(BarType)
  @IsOptional()
  type?: BarType;

  @IsEnum(BarStatus)
  @IsOptional()
  status?: BarStatus;
}
