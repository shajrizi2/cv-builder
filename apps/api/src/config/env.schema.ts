import 'reflect-metadata';

import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export const nodeEnvironments = ['development', 'test', 'production'] as const;
export type NodeEnvironment = (typeof nodeEnvironments)[number];

export interface Environment {
  nodeEnv: NodeEnvironment;
  apiPort: number;
  apiHost: string;
  corsOrigins: string[];
  swaggerEnabled: boolean;
}

function parseBoolean(value: unknown): unknown {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
}

class EnvironmentVariables {
  @IsEnum(nodeEnvironments)
  @IsOptional()
  NODE_ENV?: NodeEnvironment;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  @IsOptional()
  API_PORT?: number;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  API_HOST?: string;

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  @Transform(({ value }: { value: unknown }) => parseBoolean(value))
  @IsBoolean()
  @IsOptional()
  SWAGGER_ENABLED?: boolean;
}

function normalizeOrigin(origin: string): string {
  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    throw new Error(`CORS_ORIGINS contains an invalid origin: "${origin}"`);
  }

  const hasUnsupportedParts =
    url.protocol !== 'http:' && url.protocol !== 'https:'
      ? true
      : url.username !== '' ||
        url.password !== '' ||
        (url.pathname !== '' && url.pathname !== '/') ||
        url.search !== '' ||
        url.hash !== '';

  if (hasUnsupportedParts || origin.includes('*')) {
    throw new Error(`CORS_ORIGINS contains an invalid origin: "${origin}"`);
  }

  return url.origin;
}

function parseCorsOrigins(value: string | undefined, nodeEnv: NodeEnvironment): string[] {
  const entries =
    value === undefined
      ? nodeEnv === 'production'
        ? []
        : ['http://localhost:3000']
      : value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0);

  const origins = [...new Set(entries.map(normalizeOrigin))];

  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one origin');
  }

  return origins;
}

export function validateEnvironment(config: Record<string, unknown>): Environment {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    stopAtFirstError: false,
  });

  if (errors.length > 0) {
    const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
    throw new Error(`Invalid environment configuration: ${messages.join('; ')}`);
  }

  const nodeEnv = validated.NODE_ENV ?? 'development';

  return {
    nodeEnv,
    apiPort: validated.API_PORT ?? 3001,
    apiHost: validated.API_HOST?.trim() || '0.0.0.0',
    corsOrigins: parseCorsOrigins(validated.CORS_ORIGINS, nodeEnv),
    swaggerEnabled: validated.SWAGGER_ENABLED ?? nodeEnv !== 'production',
  };
}
