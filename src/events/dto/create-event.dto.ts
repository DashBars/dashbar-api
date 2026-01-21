import { IsInt, IsNotEmpty, IsOptional, IsString, Min, IsDateString } from 'class-validator';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  venueId: number;

  @IsOptional()
  @IsDateString()
  startedAt?: string;
}
