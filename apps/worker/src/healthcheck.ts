import { pathToFileURL } from 'node:url';

import { Redis, type RedisOptions } from 'ioredis';

import { configuration } from './config/configuration.js';

const HEALTHCHECK_CONNECT_TIMEOUT_MS = 2_000;
const HEALTHCHECK_COMMAND_TIMEOUT_MS = 2_000;

export interface HealthcheckRedisConnection {
  readonly status: string;
  connect(): Promise<void>;
  disconnect(): void;
  ping(): Promise<string>;
  quit(): Promise<string>;
}

export type HealthcheckRedisFactory = (options: RedisOptions) => HealthcheckRedisConnection;

const defaultRedisFactory: HealthcheckRedisFactory = (options) => {
  const connection = new Redis(options);
  connection.on('error', () => undefined);
  return connection;
};

async function closeConnection(connection: HealthcheckRedisConnection): Promise<void> {
  if (connection.status === 'ready') {
    try {
      await connection.quit();
      return;
    } catch {
      connection.disconnect();
      throw new Error('Worker health check connection cleanup failed');
    }
  }

  connection.disconnect();
}

export async function checkWorkerHealth(
  environment: Record<string, unknown> = process.env,
  redisFactory: HealthcheckRedisFactory = defaultRedisFactory,
): Promise<void> {
  const config = configuration(environment);
  const connection = redisFactory({
    ...config.redisConnection,
    commandTimeout: HEALTHCHECK_COMMAND_TIMEOUT_MS,
    connectTimeout: HEALTHCHECK_CONNECT_TIMEOUT_MS,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  let healthcheckFailure: unknown;

  try {
    await connection.connect();
    const response = await connection.ping();

    if (response !== 'PONG') {
      throw new Error('Worker health check received an unexpected Redis response');
    }
  } catch (error) {
    healthcheckFailure = error;
  }

  try {
    await closeConnection(connection);
  } catch (cleanupError) {
    healthcheckFailure ??= cleanupError;
  }

  if (healthcheckFailure !== undefined) {
    throw healthcheckFailure instanceof Error
      ? healthcheckFailure
      : new Error('Worker health check failed with an unknown error');
  }
}

async function main(): Promise<void> {
  try {
    await checkWorkerHealth();
  } catch {
    console.error('Worker health check failed');
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main();
}
