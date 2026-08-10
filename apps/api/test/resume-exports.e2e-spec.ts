import { Test } from '@nestjs/testing';
import { Readable } from 'node:stream';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createEmptyResumeContent } from '@cv-builder/resume-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/application';
import { DatabaseService } from '../src/database/database.module';

const queue = vi.hoisted(() => ({ add: vi.fn(), close: vi.fn() }));
const storage = vi.hoisted(() => ({ getObject: vi.fn() }));
vi.mock('bullmq', () => ({
  Queue: class {
    add = queue.add;
    close = queue.close;
  },
}));
vi.mock('minio', () => ({
  Client: class {
    getObject = storage.getObject;
  },
}));

const resumeId = '550e8400-e29b-41d4-a716-446655440040';
const exportId = '550e8400-e29b-41d4-a716-446655440041';
const date = new Date('2026-08-10T10:00:00Z');
let app: NestFastifyApplication;
let status = 'QUEUED';

beforeEach(async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    REDIS_HOST: 'redis',
    MINIO_ENDPOINT: 'minio',
    MINIO_ACCESS_KEY: 'key',
    MINIO_SECRET_KEY: 'secret',
  });
  status = 'QUEUED';
  queue.add.mockResolvedValue({});
  queue.close.mockResolvedValue(undefined);
  storage.getObject.mockResolvedValue(Readable.from([Buffer.from('%PDF-http')]));
  const resume = {
    findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
      where.id === resumeId
        ? {
            id: resumeId,
            title: 'Synthetic CV',
            template: 'classic',
            content: createEmptyResumeContent(),
          }
        : null,
    ),
  };
  const record = (): Record<string, unknown> => ({
    id: exportId,
    resumeId,
    template: 'classic',
    resumeTitle: 'Synthetic CV',
    resumeContent: createEmptyResumeContent(),
    status,
    objectKey: status === 'COMPLETED' ? `exports/${exportId}.pdf` : null,
    fileSize: status === 'COMPLETED' ? 9 : null,
    errorCode: status === 'FAILED' ? 'PDF_RENDER_FAILED' : null,
    errorMessage: status === 'FAILED' ? 'PDF generation failed.' : null,
    createdAt: date,
    updatedAt: date,
  });
  const resumeExport = {
    create: vi.fn().mockImplementation(() => record()),
    findUnique: vi
      .fn()
      .mockImplementation(({ where }: { where: { id: string } }) =>
        where.id === exportId ? record() : null,
      ),
    findFirst: vi.fn().mockImplementation(() => record()),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue({ client: { resume, resumeExport } })
    .compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApplication(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterEach(async () => {
  await app.close();
  for (const key of [
    'NODE_ENV',
    'REDIS_HOST',
    'MINIO_ENDPOINT',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY',
  ])
    delete process.env[key];
});

describe('resume export HTTP API', () => {
  it('creates and looks up a strict public export', async () => {
    const created = await app.inject({ method: 'POST', url: `/api/resumes/${resumeId}/exports` });
    expect(created.statusCode).toBe(201);
    expect(created.json()).not.toHaveProperty('objectKey');
    const fetched = await app.inject({ method: 'GET', url: `/api/resume-exports/${exportId}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).not.toHaveProperty('objectKey');
  });
  it('returns 404 for missing resume/export and validates UUIDs', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/resumes/550e8400-e29b-41d4-a716-446655440099/exports',
        })
      ).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/resume-exports/nope' })).statusCode).toBe(
      400,
    );
  });
  it('downloads only completed PDFs through the API boundary', async () => {
    expect(
      (await app.inject({ method: 'GET', url: `/api/resume-exports/${exportId}/download` }))
        .statusCode,
    ).toBe(409);
    status = 'FAILED';
    expect(
      (await app.inject({ method: 'GET', url: `/api/resume-exports/${exportId}/download` }))
        .statusCode,
    ).toBe(409);
    status = 'COMPLETED';
    const response = await app.inject({
      method: 'GET',
      url: `/api/resume-exports/${exportId}/download`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  });
});
