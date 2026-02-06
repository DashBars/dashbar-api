import { IsOptional, IsIn } from 'class-validator';

export class GenerateReportDto {
  @IsOptional()
  @IsIn([5, 15, 60])
  bucketSize?: 5 | 15 | 60;
}
