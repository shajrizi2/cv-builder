import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/application';
import { JwtVerifierService } from '../src/auth/jwt-verifier.service';
import { DatabaseService } from '../src/database/database.module';
import { TEST_USER_ID } from './auth-test-helper';

let app: NestFastifyApplication;
const verify = vi.fn();

beforeEach(async () => {
  process.env.NODE_ENV = 'test';
  verify.mockImplementation((value: string) => {
    if (value !== 'valid') return Promise.reject(new Error('synthetic cryptographic detail'));
    return Promise.resolve({ id: TEST_USER_ID });
  });
  const resume = { findMany: vi.fn().mockResolvedValue([]) };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JwtVerifierService)
    .useValue({ verify })
    .overrideProvider(DatabaseService)
    .useValue({ client: { resume } })
    .compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApplication(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterEach(async () => {
  await app.close();
  delete process.env.NODE_ENV;
});

describe('API authentication boundary', () => {
  it('keeps health anonymous and protects business routes', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/resumes' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/resumes',
          headers: { authorization: 'Basic invalid' },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('returns a generic 401 for verifier failures and accepts a verified subject', async () => {
    const invalid = await app.inject({
      method: 'GET',
      url: '/api/resumes',
      headers: { authorization: 'Bearer invalid' },
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.body).not.toContain('synthetic cryptographic detail');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/resumes',
          headers: { authorization: 'Bearer valid' },
        })
      ).statusCode,
    ).toBe(200);
  });
});
