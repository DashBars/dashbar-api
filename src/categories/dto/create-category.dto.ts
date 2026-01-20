import { IsString, IsOptional, IsInt, IsBoolean, Min } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortIndex?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
