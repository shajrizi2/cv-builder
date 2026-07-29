import { describe, expect, it } from 'vitest';

import { configuration } from '../src/config/configuration.js';
import { validateEnvironment } from '../src/config/env.schema.js';

describe('worker environment', () => {
  it('uses safe local defaults and returns immutable configuration', () => {
    const result = configuration({});

    expect(result).toEqual({
      nodeEnv: 'development',
      redis: {
        host: '127.0.0.1',
        port: 6379,
        tls: false,
        database: 0,
      },
      redisConnection: {
        host: '127.0.0.1',
        port: 6379,
        db: 0,
      },
      concurrency: 1,
      workerName: 'cv-builder-worker',
      shutdownTimeoutMs: 30_000,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.redis)).toBe(true);
    expect(Object.isFrozen(result.redisConnection)).toBe(true);
  });

  it('parses explicit numbers, booleans, authentication, and TLS', () => {
    expect(
      configuration({
        NODE_ENV: 'production',
        REDIS_HOST: 'redis.internal',
        REDIS_PORT: '6380',
        REDIS_USERNAME: 'worker',
        REDIS_PASSWORD: 'secret',
        REDIS_TLS: 'true',
        REDIS_DB: '2',
        WORKER_CONCURRENCY: '4',
        WORKER_NAME: 'document-worker',
        WORKER_SHUTDOWN_TIMEOUT_MS: '15000',
      }),
    ).toEqual({
      nodeEnv: 'production',
      redis: {
        host: 'redis.internal',
        port: 6380,
        username: 'worker',
        password: 'secret',
        tls: true,
        database: 2,
      },
      redisConnection: {
        host: 'redis.internal',
        port: 6380,
        username: 'worker',
        password: 'secret',
        tls: {},
        db: 2,
      },
      concurrency: 4,
      workerName: 'document-worker',
      shutdownTimeoutMs: 15_000,
    });
  });

  it('treats blank optional credentials as absent', () => {
    expect(
      validateEnvironment({
        REDIS_USERNAME: ' ',
        REDIS_PASSWORD: '',
      }).redis,
    ).toEqual({
      host: '127.0.0.1',
      port: 6379,
      tls: false,
      database: 0,
    });
  });

  it.each([
    ['REDIS_PORT', '0'],
    ['REDIS_PORT', '65536'],
    ['REDIS_PORT', '6379.5'],
    ['REDIS_DB', '-1'],
    ['WORKER_CONCURRENCY', '0'],
    ['WORKER_SHUTDOWN_TIMEOUT_MS', '0'],
  ])('rejects invalid numeric %s=%s', (key, value) => {
    expect(() => validateEnvironment({ [key]: value })).toThrow(
      'Invalid worker environment configuration',
    );
  });

  it.each(['yes', '1', 'TRUE', ''])('rejects invalid REDIS_TLS=%s', (value) => {
    expect(() => validateEnvironment({ REDIS_TLS: value })).toThrow(
      'Invalid worker environment configuration',
    );
  });

  it.each([
    ['REDIS_HOST', ''],
    ['WORKER_NAME', ' '],
  ])('rejects blank %s', (key, value) => {
    expect(() => validateEnvironment({ [key]: value })).toThrow(
      'Invalid worker environment configuration',
    );
  });
});
