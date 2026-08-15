import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import type { AuthenticatedUser } from './authenticated-user';
import { JwtVerifierService } from './jwt-verifier.service';
import { IS_PUBLIC_ROUTE } from './public.decorator';

type AuthenticatedRequest = FastifyRequest & { authenticatedUser?: AuthenticatedUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifierService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Unauthorized');
    const token = authorization.slice('Bearer '.length).trim();
    if (!token || token.includes(' ')) throw new UnauthorizedException('Unauthorized');
    try {
      request.authenticatedUser = await this.verifier.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }
  }
}
