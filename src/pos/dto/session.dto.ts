import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class OpenSessionDto {
  @IsInt()
  @IsOptional()
  @Min(0)
  openingFloat?: number; // Starting cash in drawer (cents)

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CloseSessionDto {
  @IsInt()
  @IsOptional()
  @Min(0)
  closingFloat?: number; // Ending cash in drawer (cents)

  @IsString()
  @IsOptional()
  notes?: string;
}
