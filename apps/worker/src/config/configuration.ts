import type { RedisOptions } from 'ioredis';

import { type WorkerEnvironment, validateEnvironment } from './env.schema.js';

export interface WorkerConfiguration extends WorkerEnvironment {
  readonly redisConnection: Readonly<RedisOptions>;
}

export function configuration(
  environment: Record<string, unknown> = process.env,
): WorkerConfiguration {
  const validated = validateEnvironment(environment);
  const redisConnection: RedisOptions = {
    host: validated.redis.host,
    port: validated.redis.port,
    db: validated.redis.database,
    ...(validated.redis.username === undefined ? {} : { username: validated.redis.username }),
    ...(validated.redis.password === undefined ? {} : { password: validated.redis.password }),
    ...(validated.redis.tls ? { tls: {} } : {}),
  };

  return Object.freeze({
    ...validated,
    redisConnection: Object.freeze(redisConnection),
  });
}
