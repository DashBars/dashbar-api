import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PosnetsService, PosTokenPayload } from '../posnets.service';

export const POS_AUTH_KEY = 'pos_auth';

/**
 * Decorator to mark a route as requiring POS authentication
 */
export function PosAuth() {
  return (target: any, key?: string, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(POS_AUTH_KEY, true, descriptor?.value || target);
    return descriptor || target;
  };
}

@Injectable()
export class PosAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly posnetsService: PosnetsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route requires POS auth
    const requiresPosAuth = this.reflector.getAllAndOverride<boolean>(POS_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiresPosAuth) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('POS token required');
    }

    try {
      const payload = await this.posnetsService.verifyPosToken(token);
      
      // Attach POS info to request
      request.posnet = payload;
      
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired POS token');
    }
  }

  private extractToken(request: any): string | undefined {
    // Check Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check X-POS-Token header
    const posHeader = request.headers['x-pos-token'];
    if (posHeader) {
      return posHeader;
    }

    // Check query parameter
    if (request.query?.posToken) {
      return request.query.posToken;
    }

    return undefined;
  }
}

/**
 * Interface for request with POS authentication
 */
export interface RequestWithPos {
  posnet: PosTokenPayload;
}
