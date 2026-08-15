import { getDatabaseClient, type PrismaClient } from '@cv-builder/database';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { jwt } from 'better-auth/plugins';

import { getAuthEnvironment } from './auth-env';

const environment = getAuthEnvironment();

// Better Auth constructs its adapter while Next.js builds route modules. Resolve the
// actual Prisma client only when the adapter performs a request-time operation.
const lazyDatabase = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const value = Reflect.get(getDatabaseClient(), property) as unknown;
    return typeof value === 'function' ? value.bind(getDatabaseClient()) : value;
  },
});

export const auth = betterAuth({
  appName: 'CV Builder',
  baseURL: environment.baseUrl,
  secret: environment.secret,
  trustedOrigins: environment.trustedOrigins,
  database: prismaAdapter(lazyDatabase, {
    provider: 'postgresql',
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 5 },
    },
  },
  advanced: {
    database: {
      generateId: 'uuid',
    },
  },
  plugins: [
    jwt({
      jwks: {
        keyPairConfig: { alg: 'ES256' },
        rotationInterval: 60 * 60 * 24 * 30,
        gracePeriod: 60 * 60 * 24 * 7,
      },
      jwt: {
        issuer: environment.jwtIssuer,
        audience: environment.jwtAudience,
        expirationTime: '15m',
        getSubject: (session) => session.user.id,
        definePayload: () => ({}),
      },
    }),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
