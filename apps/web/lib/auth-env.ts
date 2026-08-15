import { z } from 'zod';

const authEnvironmentSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']),
  databaseUrl: z.string().min(1),
  secret: z.string().min(32),
  baseUrl: z.string().url(),
  trustedOrigins: z.array(z.string().url()).min(1),
  jwtIssuer: z.string().url(),
  jwtAudience: z.string().trim().min(1),
});

export type AuthEnvironment = z.infer<typeof authEnvironmentSchema>;

function parseOrigins(value: string | undefined, fallback: string): string[] {
  const origins = (value ?? fallback)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin);
  return [...new Set(origins)];
}

export function parseAuthEnvironment(input: Record<string, string | undefined>): AuthEnvironment {
  const nodeEnv = input.NODE_ENV ?? 'development';
  const productionBuild = input.NEXT_PHASE === 'phase-production-build';
  const allowDevelopmentDefaults = nodeEnv !== 'production' || productionBuild;
  const baseUrl =
    input.BETTER_AUTH_URL ?? (allowDevelopmentDefaults ? 'http://localhost:3000' : '');
  const result = authEnvironmentSchema.safeParse({
    nodeEnv,
    databaseUrl:
      input.DATABASE_URL ??
      (allowDevelopmentDefaults ? 'postgresql://cv_builder:local@127.0.0.1:5432/cv_builder' : ''),
    secret:
      input.BETTER_AUTH_SECRET ??
      (allowDevelopmentDefaults ? 'development-only-auth-secret-change-me' : ''),
    baseUrl,
    trustedOrigins: parseOrigins(input.BETTER_AUTH_TRUSTED_ORIGINS, baseUrl),
    jwtIssuer: input.API_JWT_ISSUER ?? baseUrl,
    jwtAudience: input.API_JWT_AUDIENCE ?? (allowDevelopmentDefaults ? 'cv-builder-api' : ''),
  });

  if (!result.success) {
    throw new Error(`Invalid server auth environment: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function getAuthEnvironment(): AuthEnvironment {
  return parseAuthEnvironment(process.env);
}
