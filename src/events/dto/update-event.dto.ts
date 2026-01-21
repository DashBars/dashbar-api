import { IsInt, IsOptional, IsString, Min, IsDateString } from 'class-validator';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  venueId?: number;

  @IsOptional()
  @IsDateString()
  startedAt?: string;
}
