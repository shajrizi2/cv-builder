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
});
