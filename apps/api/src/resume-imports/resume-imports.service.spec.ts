import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.module';
import type { ApplicationConfiguration } from '../config/configuration';
import type { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { ResumeImportsService, toPublicResumeImport } from './resume-imports.service';
import { RESUME_IMPORT_JOB_NAME, RESUME_IMPORT_QUEUE_NAME } from '@cv-builder/resume-schema';

const storage = vi.hoisted(() => ({ putObject: vi.fn(), removeObject: vi.fn() }));
const queue = vi.hoisted(() => ({ add: vi.fn(), close: vi.fn() }));
const queueConstruction = vi.hoisted((): { name: string; options: unknown } => ({
  name: '',
  options: undefined,
}));
vi.mock('minio', () => ({
  Client: class {
    putObject = storage.putObject;
    removeObject = storage.removeObject;
  },
}));
vi.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string, options: unknown) {
      queueConstruction.name = name;
      queueConstruction.options = options;
    }
    add = queue.add;
    close = queue.close;
  },
}));

const record = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  originalFilename: 'cv.pdf',
  mimeType: 'application/pdf',
  fileSize: 9,
  objectKey: 'imports/private-object-key',
  status: 'QUEUED',
  completionMode: null,
  extractedText: null,
  errorCode: null,
  errorMessage: null,
  resumeId: null,
  createdAt: new Date('2026-08-06T10:00:00.000Z'),
  updatedAt: new Date('2026-08-06T10:00:00.000Z'),
};
const ownerId = '550e8400-e29b-41d4-a716-446655440001';
const environment = {
  redisHost: 'redis',
  redisPort: 6379,
  redisUsername: 'importer',
  redisPassword: 'password',
  redisTls: true,
  redisDatabase: 3,
  minioEndpoint: 'minio',
  minioPort: 9000,
  minioUseSsl: false,
  minioAccessKey: 'access',
  minioSecretKey: 'secret',
  minioBucket: 'cv-imports',
};
function request(): FastifyRequest {
  return {
    parts: async function* () {
      await Promise.resolve();
      yield {
        type: 'file',
        fieldname: 'file',
        filename: 'cv.pdf',
        mimetype: 'application/pdf',
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.7')),
      };
    },
  } as never;
}
function harness(): {
  service: ResumeImportsService;
  resumeImport: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
} {
  const resumeImport = {
    create: vi.fn().mockResolvedValue(record),
    findMany: vi.fn().mockResolvedValue([record]),
    findFirst: vi.fn().mockResolvedValue(record),
    update: vi.fn().mockResolvedValue({ ...record, status: 'FAILED' }),
  };
  const database = { client: { resumeImport } } as unknown as DatabaseService;
  const config = { getOrThrow: vi.fn().mockReturnValue(environment) } as unknown as ConfigService<
    ApplicationConfiguration,
    true
  >;
  return { service: new ResumeImportsService(database, config), resumeImport };
}
describe('ResumeImportsService', () => {
  it('explicitly maps realistic Prisma records without exposing objectKey', () => {
    const value = toPublicResumeImport(record);
    expect(value.id).toBe(record.id);
    expect(value).not.toHaveProperty('objectKey');
    expect(value).not.toHaveProperty('extractedText');
    expect(value).toMatchObject({ completionMode: null, hasExtractedText: false });
    expect(toPublicResumeImport({ ...record, extractedText: 'Synthetic text' })).toMatchObject({
      hasExtractedText: true,
    });
  });
  it('returns valid public responses from create, list, and get', async () => {
    storage.putObject.mockResolvedValue(undefined);
    queue.add.mockResolvedValue({});
    queue.close.mockResolvedValue(undefined);
    const { service, resumeImport } = harness();
    for (const value of [
      await service.create(ownerId, request()),
      ...(await service.list(ownerId)),
      await service.get(ownerId, record.id),
    ]) {
      expect(value.id).toBe(record.id);
      expect(value).not.toHaveProperty('objectKey');
    }
    expect(queueConstruction).toEqual({
      name: RESUME_IMPORT_QUEUE_NAME,
      options: {
        connection: {
          host: 'redis',
          port: 6379,
          username: 'importer',
          password: 'password',
          tls: {},
          db: 3,
        },
      },
    });
    expect(queue.add).toHaveBeenCalledWith(
      RESUME_IMPORT_JOB_NAME,
      { importId: record.id },
      expect.any(Object),
    );
    expect(resumeImport.create).toHaveBeenCalledWith(
      // Vitest's nested asymmetric matcher is intentionally untyped test data.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expect.objectContaining({ data: expect.objectContaining({ ownerId }) }),
    );
  });
  it('marks queue failures failed and attempts private object deletion', async () => {
    storage.putObject.mockResolvedValue(undefined);
    storage.removeObject.mockResolvedValue(undefined);
    queue.add.mockRejectedValue(new Error('queue down'));
    queue.close.mockResolvedValue(undefined);
    const { service, resumeImport } = harness();
    await expect(service.create(ownerId, request())).rejects.toMatchObject({ status: 503 });
    expect(resumeImport.update).toHaveBeenCalledWith(
      // Vitest's asymmetric matchers are intentionally untyped test data.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(storage.removeObject).toHaveBeenCalledWith(
      'cv-imports',
      expect.stringMatching(/^imports\//),
    );
  });
});
