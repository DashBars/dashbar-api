import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PosTokenPayload } from '../posnets.service';

/**
 * Parameter decorator to extract current POS terminal info from request
 * Usage: @CurrentPosnet() posnet: PosTokenPayload
 */
export const CurrentPosnet = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): PosTokenPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.posnet;
  },
);
