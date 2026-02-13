import { IsArray, IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ReturnStockDto } from './return-stock.dto';

export enum BulkReturnMode {
  TO_GLOBAL = 'to_global',
  TO_SUPPLIER = 'to_supplier',
  AUTO = 'auto',
}

export class BulkReturnStockDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnStockDto)
  items: ReturnStockDto[];

  @IsEnum(BulkReturnMode)
  mode: BulkReturnMode;

  @IsOptional()
  notes?: string;
}
