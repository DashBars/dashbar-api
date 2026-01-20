import { Type } from 'class-transformer';
import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { UpsertStockDto } from './upsert-stock.dto';

export class BulkUpsertStockDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpsertStockDto)
  items: UpsertStockDto[];
}
