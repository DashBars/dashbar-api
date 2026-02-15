import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class CreateThresholdDto {
  @IsInt()
  drinkId: number;

  @IsBoolean()
  sellAsWholeUnit: boolean;

  @IsInt()
  @Min(0)
  lowerThreshold: number; // in units (bottles/cans)

  @IsInt()
  @Min(0)
  donationThreshold: number; // in units

  @IsOptional()
  @IsInt()
  @Min(1)
  depletionHorizonMin?: number;
}
