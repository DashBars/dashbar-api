import { IsOptional, IsString, IsInt, IsDateString, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TimeSeriesFiltersDto {
  @IsOptional()
  @IsString()
  @IsIn(['1m', '5m', '15m', '1h'])
  bucket?: string = '5m';

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cocktailId?: number;
}

export class TopProductsFiltersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class TotalsFiltersDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
