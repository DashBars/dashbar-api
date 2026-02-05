import { IsBoolean, IsOptional } from 'class-validator';

export class CreateReturnPolicyDto {
  @IsOptional()
  @IsBoolean()
  autoReturnToGlobal?: boolean;

  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;
}
