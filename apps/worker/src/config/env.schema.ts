import { z } from 'zod';

const integerString = z.string().trim().regex(/^\d+$/, 'must be an integer');

function optionalInteger(
  defaultValue: number,
  minimum: number,
  maximum: number,
): z.ZodType<number> {
  return z
    .union([z.number().int(), integerString.transform(Number)])
    .default(defaultValue)
    .pipe(z.number().int().min(minimum).max(maximum));
}

const explicitBoolean = z
  .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
  .default(false);

const optionalCredential = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_HOST: z.string().trim().min(1).default('127.0.0.1'),
  REDIS_PORT: optionalInteger(6379, 1, 65_535),
  REDIS_USERNAME: optionalCredential,
  REDIS_PASSWORD: optionalCredential,
  REDIS_TLS: explicitBoolean,
  REDIS_DB: optionalInteger(0, 0, 2_147_483_647),
  WORKER_CONCURRENCY: optionalInteger(1, 1, 1_000),
  WORKER_NAME: z.string().trim().min(1).default('cv-builder-worker'),
  WORKER_SHUTDOWN_TIMEOUT_MS: optionalInteger(30_000, 1, 2_147_483_647),
  DATABASE_URL: optionalCredential,
  MINIO_ENDPOINT: optionalCredential,
  MINIO_PORT: optionalInteger(9000, 1, 65_535),
  MINIO_USE_SSL: explicitBoolean,
  MINIO_ACCESS_KEY: optionalCredential,
  MINIO_SECRET_KEY: optionalCredential,
  MINIO_BUCKET: z.string().trim().min(1).default('cv-imports'),
  OPENAI_API_KEY: optionalCredential,
  OPENAI_MODEL: optionalCredential,
  OPENAI_TIMEOUT_MS: optionalInteger(30_000, 1, 600_000),
});

export type NodeEnvironment = z.infer<typeof environmentSchema>['NODE_ENV'];

export interface WorkerEnvironment {
  readonly nodeEnv: NodeEnvironment;
  readonly redis: {
    readonly host: string;
    readonly port: number;
    readonly username?: string;
    readonly password?: string;
    readonly tls: boolean;
    readonly database: number;
  };
  readonly concurrency: number;
  readonly workerName: string;
  readonly shutdownTimeoutMs: number;
  readonly databaseUrl?: string;
  readonly storage?: {
    readonly endPoint: string;
    readonly port: number;
    readonly useSSL: boolean;
    readonly accessKey: string;
    readonly secretKey: string;
    readonly bucket: string;
  };
  readonly openai?: { readonly apiKey: string; readonly model: string; readonly timeoutMs: number };
}

export function validateEnvironment(config: Record<string, unknown>): WorkerEnvironment {
  const configured = (key: string): boolean => {
    const value = config[key];
    return value !== undefined && !(typeof value === 'string' && value.trim() === '');
  };
  const minioKeys = [
    'MINIO_ENDPOINT',
    'MINIO_PORT',
    'MINIO_USE_SSL',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY',
    'MINIO_BUCKET',
  ] as const;
  const hasAnyMinio = minioKeys.some(configured);
  const hasRequiredMinio = ['MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'].every(
    configured,
  );
  if (hasAnyMinio && !hasRequiredMinio) {
    throw new Error(
      'Invalid worker environment configuration: MinIO configuration must be complete or absent',
    );
  }
  const hasOpenAiKey = configured('OPENAI_API_KEY');
  const hasOpenAiModel = configured('OPENAI_MODEL');
  if (hasOpenAiKey !== hasOpenAiModel) {
    throw new Error(
      'Invalid worker environment configuration: OPENAI_API_KEY and OPENAI_MODEL must be configured together',
    );
  }
  const result = environmentSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid worker environment configuration: ${details}`);
  }

  const values = result.data;

  const storage =
    values.MINIO_ENDPOINT && values.MINIO_ACCESS_KEY && values.MINIO_SECRET_KEY
      ? Object.freeze({
          endPoint: values.MINIO_ENDPOINT,
          port: values.MINIO_PORT,
          useSSL: values.MINIO_USE_SSL,
          accessKey: values.MINIO_ACCESS_KEY,
          secretKey: values.MINIO_SECRET_KEY,
          bucket: values.MINIO_BUCKET,
        })
      : undefined;
  const openai =
    values.OPENAI_API_KEY && values.OPENAI_MODEL
      ? Object.freeze({
          apiKey: values.OPENAI_API_KEY,
          model: values.OPENAI_MODEL,
          timeoutMs: values.OPENAI_TIMEOUT_MS,
        })
      : undefined;
  return Object.freeze({
    nodeEnv: values.NODE_ENV,
    redis: Object.freeze({
      host: values.REDIS_HOST,
      port: values.REDIS_PORT,
      ...(values.REDIS_USERNAME === undefined ? {} : { username: values.REDIS_USERNAME }),
      ...(values.REDIS_PASSWORD === undefined ? {} : { password: values.REDIS_PASSWORD }),
      tls: values.REDIS_TLS,
      database: values.REDIS_DB,
    }),
    concurrency: values.WORKER_CONCURRENCY,
    workerName: values.WORKER_NAME,
    shutdownTimeoutMs: values.WORKER_SHUTDOWN_TIMEOUT_MS,
    ...(values.DATABASE_URL ? { databaseUrl: values.DATABASE_URL } : {}),
    ...(storage ? { storage } : {}),
    ...(openai ? { openai } : {}),
  });
}
