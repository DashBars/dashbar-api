import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { UpsertStockDto } from './upsert-stock.dto';

export class BulkUpsertStockDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertStockDto)
  items: UpsertStockDto[];
}
