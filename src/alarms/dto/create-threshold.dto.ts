import { IsInt, IsOptional, Min } from 'class-validator';

export class CreateThresholdDto {
  @IsInt()
  drinkId: number;

  @IsInt()
  @Min(0)
  lowerThreshold: number;

  @IsInt()
  @Min(0)
  donationThreshold: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  depletionHorizonMin?: number;
}
