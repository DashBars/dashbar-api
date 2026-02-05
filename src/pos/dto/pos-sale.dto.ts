import {
  IsArray,
  IsInt,
  IsEnum,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class SaleItemDto {
  @IsInt()
  cocktailId: number;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreatePOSSaleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class RefundSaleDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
