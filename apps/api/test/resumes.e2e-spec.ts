import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createEmptyResumeContent } from '@cv-builder/resume-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/application';
import { DatabaseService } from '../src/database/database.module';

const id = '550e8400-e29b-41d4-a716-446655440000';
const date = new Date('2026-08-03T12:00:00.000Z');
let app: NestFastifyApplication;
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
  const resume = {
    create: vi.fn(({ data }: { data: { title: string; content: typeof record.content } }) => {
      exists = true;
      record = { ...record, ...data };
      return record;
    }),
    findMany: vi.fn(() => (exists ? [record] : [])),
    findUnique: vi.fn(() => (exists ? record : null)),
    update: vi.fn(({ data }: { data: Partial<typeof record> }) => {
      record = { ...record, ...data, updatedAt: date };
      return record;
    }),
    deleteMany: vi.fn(() => {
      const count = exists ? 1 : 0;
      exists = false;
      return { count };
    }),
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
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

describe('resume HTTP API', () => {
  it('supports create, list, get, update, and delete', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/resumes',
      payload: { title: 'My CV' },
    });
    expect(created.statusCode).toBe(201);
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
