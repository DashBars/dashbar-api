import { IsString, IsBoolean, IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator';
import { PosnetStatus } from '@prisma/client';

export class UpdatePosnetDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsEnum(PosnetStatus)
  @IsOptional()
  status?: PosnetStatus;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
