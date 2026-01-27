import { IsInt, IsOptional, IsString, Min, IsDateString, ValidateIf } from 'class-validator';

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
  @ValidateIf((o) => {
    if (o.scheduledStartAt) {
      const date = new Date(o.scheduledStartAt);
      const now = new Date();
      return date > now; // Solo permitir fechas futuras
    }
    return true;
  })
  scheduledStartAt?: string; // Fecha/hora programada (debe ser futura)
}
