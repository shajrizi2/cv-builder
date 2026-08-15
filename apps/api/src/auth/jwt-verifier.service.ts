import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { ApplicationConfiguration } from '../config/configuration';
import type { Environment } from '../config/env.schema';
import type { AuthenticatedUser } from './authenticated-user';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class JwtVerifierService {
  private readonly environment: Environment;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: ConfigService<ApplicationConfiguration, true>) {
    this.environment = config.getOrThrow<Environment>('api');
    this.jwks = createRemoteJWKSet(new URL(this.environment.authJwksUrl), {
      timeoutDuration: 3_000,
      cooldownDuration: 5_000,
      cacheMaxAge: 10 * 60 * 1_000,
    });
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    const { payload } = await jwtVerify(token, this.jwks, {
      algorithms: ['ES256'],
      issuer: this.environment.apiJwtIssuer,
      audience: this.environment.apiJwtAudience,
    });
    if (typeof payload.sub !== 'string' || !UUID_PATTERN.test(payload.sub)) {
      throw new Error('Token subject is invalid');
    }
    return { id: payload.sub };
  }
}
