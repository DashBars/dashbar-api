import { IsInt, IsNotEmpty, IsOptional, IsString, IsBoolean, Min, ValidateIf } from 'class-validator';

export class AssignStockDto {
  @IsInt()
  @Min(1)
  globalInventoryId: number;

  @IsInt()
  @Min(1)
  eventId: number;

  @IsInt()
  @Min(1)
  barId: number;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * Si true, el insumo se vende como unidad completa (ej: botella de agua).
   * Si false, solo se usa como componente de recetas.
   */
  @IsOptional()
  @IsBoolean()
  sellAsWholeUnit?: boolean;

  /**
   * Precio de venta en centavos (requerido si sellAsWholeUnit=true)
   */
  @ValidateIf((o) => o.sellAsWholeUnit === true)
  @IsInt()
  @Min(1)
  salePrice?: number;
}
