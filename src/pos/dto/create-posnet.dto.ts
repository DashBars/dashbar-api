import { IsString, IsInt, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreatePosnetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsInt()
  barId: number;

  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(20)
  code?: string; // Optional - will be auto-generated if not provided
}
