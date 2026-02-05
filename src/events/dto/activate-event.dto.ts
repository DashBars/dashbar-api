import { IsOptional, IsArray, IsInt } from 'class-validator';

export class ActivateEventDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  barIds?: number[]; // Si vacío/null = todas las barras
}
