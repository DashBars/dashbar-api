import { IsString, IsOptional, MinLength } from 'class-validator';

export class PosLoginDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  code?: string; // POS code (e.g., "POS-001")

  @IsString()
  @IsOptional()
  @MinLength(1)
  authToken?: string; // Device auth token
}
