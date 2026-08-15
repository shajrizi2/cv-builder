import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createEmptyResumeContent } from '@cv-builder/resume-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/application';
import { DatabaseService } from '../src/database/database.module';
import { JwtVerifierService } from '../src/auth/jwt-verifier.service';
import { addSyntheticAuthorization, TEST_USER_ID, testJwtVerifier } from './auth-test-helper';

const id = '550e8400-e29b-41d4-a716-446655440000';
const date = new Date('2026-08-03T12:00:00.000Z');
let app: NestFastifyApplication;
let resumeCreate: ReturnType<typeof vi.fn>;
let exists = true;
let record = {
  id,
  title: 'My CV',
  content: createEmptyResumeContent(),
  createdAt: date,
  updatedAt: date,
};

beforeEach(async () => {
  process.env.NODE_ENV = 'test';
  exists = true;
  record = { ...record, title: 'My CV', content: createEmptyResumeContent() };
  resumeCreate = vi.fn(({ data }: { data: { title: string; content: typeof record.content } }) => {
    exists = true;
    record = { ...record, ...data };
    return record;
  });
  const resume = {
    create: resumeCreate,
    findMany: vi.fn(() => (exists ? [record] : [])),
    findFirst: vi.fn(() => (exists ? record : null)),
    updateMany: vi.fn(({ data }: { data: Partial<typeof record> }) => {
      record = { ...record, ...data, updatedAt: date };
      return { count: exists ? 1 : 0 };
    }),
    deleteMany: vi.fn(() => {
      const count = exists ? 1 : 0;
      exists = false;
      return { count };
    }),
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JwtVerifierService)
    .useValue(testJwtVerifier)
    .overrideProvider(DatabaseService)
    .useValue({ client: { resume } })
    .compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  addSyntheticAuthorization(app);
  configureApplication(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterEach(async () => {
  await app.close();
  delete process.env.NODE_ENV;
});

describe('resume HTTP API', () => {
  it('allows browser preflight requests for resume deletion', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: `/api/resumes/${id}`,
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'DELETE',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-methods']?.split(',').map((method) => method.trim()))
      .toContain('DELETE');
  });

  it('supports create, list, get, update, and delete', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/resumes',
      payload: { title: 'My CV' },
    });
    expect(created.statusCode).toBe(201);
    expect(resumeCreate).toHaveBeenCalledWith(
      // Vitest's nested asymmetric matcher is intentionally untyped test data.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expect.objectContaining({ data: expect.objectContaining({ ownerId: TEST_USER_ID }) }),
    );
    expect(
      created.json<{ content: { metadata: { version: number } } }>().content.metadata.version,
    ).toBe(1);
    expect((await app.inject({ method: 'GET', url: '/api/resumes' })).json()).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: `/api/resumes/${id}` })).statusCode).toBe(200);
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/resumes/${id}`,
      payload: { title: 'Renamed' },
    });
    expect(updated.json<{ title: string }>().title).toBe('Renamed');
    expect((await app.inject({ method: 'DELETE', url: `/api/resumes/${id}` })).statusCode).toBe(
      204,
    );
    expect((await app.inject({ method: 'GET', url: `/api/resumes/${id}` })).statusCode).toBe(404);
  });
  it('rejects malformed ids, bodies, and unknown properties', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/resumes/nope' })).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/resumes',
          payload: { title: '', extra: true },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'PATCH', url: `/api/resumes/${id}`, payload: { content: {} } }))
        .statusCode,
    ).toBe(400);
  });
});
