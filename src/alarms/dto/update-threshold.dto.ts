import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateThresholdDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  lowerThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  donationThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  depletionHorizonMin?: number;
}
