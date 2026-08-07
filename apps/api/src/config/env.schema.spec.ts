import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './env.schema';

describe('validateEnvironment', () => {
  it('uses safe development defaults', () => {
    expect(validateEnvironment({})).toEqual({
      nodeEnv: 'development',
      apiPort: 3001,
      apiHost: '0.0.0.0',
      corsOrigins: ['http://localhost:3000'],
      swaggerEnabled: true,
      redisPort: 6379,
      redisTls: false,
      redisDatabase: 0,
      minioPort: 9000,
      minioUseSsl: false,
      minioBucket: 'cv-imports',
    });
  });

  it('parses and normalizes explicit values', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'test',
        API_PORT: '4100',
        API_HOST: '127.0.0.1',
        CORS_ORIGINS: 'https://example.com/, http://localhost:3000, https://example.com',
        SWAGGER_ENABLED: 'false',
      }),
    ).toEqual({
      nodeEnv: 'test',
      apiPort: 4100,
      apiHost: '127.0.0.1',
      corsOrigins: ['https://example.com', 'http://localhost:3000'],
      swaggerEnabled: false,
      redisPort: 6379,
      redisTls: false,
      redisDatabase: 0,
      minioPort: 9000,
      minioUseSsl: false,
      minioBucket: 'cv-imports',
    });
  });

  it.each(['0', '65536', 'not-a-port'])('rejects invalid API_PORT %s', (apiPort) => {
    expect(() => validateEnvironment({ API_PORT: apiPort })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('rejects an empty API_HOST', () => {
    expect(() => validateEnvironment({ API_HOST: '' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it.each(['yes', '0', 'FALSE'])('rejects invalid SWAGGER_ENABLED %s', (value) => {
    expect(() => validateEnvironment({ SWAGGER_ENABLED: value })).toThrow(
      'Invalid environment configuration',
    );
  });

  it.each([
    '*',
    'not-an-origin',
    'ftp://example.com',
    'https://example.com/path',
    'https://user@example.com',
  ])('rejects invalid CORS origin %s', (origin) => {
    expect(() => validateEnvironment({ CORS_ORIGINS: origin })).toThrow(
      'CORS_ORIGINS contains an invalid origin',
    );
  });

  it('requires explicit CORS origins in production', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      'CORS_ORIGINS must contain at least one origin',
    );
  });

  it('defaults Swagger to disabled in production', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://example.com',
      }).swaggerEnabled,
    ).toBe(false);
  });

  it('allows an explicit Swagger override in production', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://example.com',
        SWAGGER_ENABLED: 'true',
      }).swaggerEnabled,
    ).toBe(true);
  });

  it('parses complete Redis queue connection configuration', () => {
    expect(
      validateEnvironment({
        REDIS_HOST: 'redis.internal',
        REDIS_PORT: '6380',
        REDIS_USERNAME: 'importer',
        REDIS_PASSWORD: 'secret',
        REDIS_TLS: 'true',
        REDIS_DB: '4',
      }),
    ).toMatchObject({
      redisHost: 'redis.internal',
      redisPort: 6380,
      redisUsername: 'importer',
      redisPassword: 'secret',
      redisTls: true,
      redisDatabase: 4,
    });
  });

  it('rejects a Redis username without a password without exposing the username', () => {
    const username = 'private-import-user';
    expect(() => validateEnvironment({ REDIS_USERNAME: username })).toThrow(
      'REDIS_PASSWORD is required',
    );
    try {
      validateEnvironment({ REDIS_USERNAME: username });
    } catch (error) {
      expect(String(error)).not.toContain(username);
    }
  });

  it.each([
    ['REDIS_DB', '-1'],
    ['REDIS_TLS', 'yes'],
  ])('rejects invalid import Redis option %s=%s', (key, value) => {
    expect(() => validateEnvironment({ [key]: value })).toThrow(
      'Invalid environment configuration',
    );
  });
});
