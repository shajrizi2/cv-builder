import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import type { AuthenticatedUser } from './authenticated-user';

type AuthenticatedRequest = FastifyRequest & { authenticatedUser?: AuthenticatedUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.authenticatedUser) throw new Error('Authenticated user is unavailable');
    return request.authenticatedUser;
  },
);
