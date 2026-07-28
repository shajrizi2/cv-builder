import { z } from 'zod';

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().trim().min(1).default('CV Builder'),
});

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

function formatEnvError(scope: 'public' | 'server', error: z.ZodError): Error {
  return new Error(`Invalid ${scope} environment variables: ${z.prettifyError(error)}`);
}

export function parsePublicEnv(
  input: Record<string, string | undefined>,
): z.infer<typeof publicEnvSchema> {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_NAME: input.NEXT_PUBLIC_APP_NAME,
  });

  if (!result.success) {
    throw formatEnvError('public', result.error);
  }

  return result.data;
}

export function parseServerEnv(
  input: Record<string, string | undefined>,
): z.infer<typeof serverEnvSchema> {
  const result = serverEnvSchema.safeParse({
    NODE_ENV: input.NODE_ENV,
  });

  if (!result.success) {
    throw formatEnvError('server', result.error);
  }

  return result.data;
}

export const publicEnv = parsePublicEnv({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
});

export function getServerEnv() {
  return parseServerEnv({
    NODE_ENV: process.env.NODE_ENV,
  });
}
