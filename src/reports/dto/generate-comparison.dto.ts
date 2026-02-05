import { IsArray, IsInt, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class GenerateComparisonDto {
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  eventIds: number[];
}
