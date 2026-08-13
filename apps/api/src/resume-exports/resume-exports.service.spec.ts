import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { ConfigService } from '@nestjs/config';
import {
  createEmptyResumeContent,
  RESUME_EXPORT_JOB_NAME,
  RESUME_EXPORT_QUEUE_NAME,
} from '@cv-builder/resume-schema';
import type { DatabaseService } from '../database/database.module';
import type { ApplicationConfiguration } from '../config/configuration';
import {
  ResumeExportsService,
  sanitizePdfFilename,
  toPublicResumeExport,
} from './resume-exports.service';

const queue = vi.hoisted(() => ({ add: vi.fn(), close: vi.fn() }));
const queueConstruction = vi.hoisted((): { name: string; options: unknown } => ({
  name: '',
  options: undefined,
}));
const storage = vi.hoisted(() => ({ getObject: vi.fn() }));
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
vi.mock('minio', () => ({
  Client: class {
    getObject = storage.getObject;
  },
}));

const exportId = '550e8400-e29b-41d4-a716-446655440010';
const resumeId = '550e8400-e29b-41d4-a716-446655440011';
const record = {
  id: exportId,
  resumeId,
  template: 'classic',
  status: 'QUEUED',
  objectKey: 'exports/private.pdf',
  fileSize: null,
  errorCode: null,
  errorMessage: null,
  resumeTitle: 'Synthetic / Resume',
  resumeContent: createEmptyResumeContent(),
  createdAt: new Date('2026-08-10T10:00:00Z'),
  updatedAt: new Date('2026-08-10T10:00:00Z'),
};
const env = {
  redisHost: 'redis',
  redisPort: 6380,
  redisDatabase: 2,
  redisUsername: 'user',
  redisPassword: 'secret',
  redisTls: true,
  minioEndpoint: 'minio',
  minioPort: 9000,
  minioUseSsl: false,
  minioAccessKey: 'key',
  minioSecretKey: 'secret',
  minioBucket: 'private',
};
function harness(status = 'QUEUED'): {
  service: ResumeExportsService;
  resumeExport: { updateMany: ReturnType<typeof vi.fn> };
} {
  const current = { ...record, status };
  const resumeExport = {
    create: vi.fn().mockResolvedValue(current),
    findUnique: vi.fn().mockResolvedValue(current),
    findFirst: vi.fn().mockResolvedValue(current),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const resume = {
    findUnique: vi.fn().mockResolvedValue({
      id: resumeId,
      title: record.resumeTitle,
      content: record.resumeContent,
      template: 'classic',
    }),
  };
  const database = { client: { resume, resumeExport } } as unknown as DatabaseService;
  const config = { getOrThrow: vi.fn().mockReturnValue(env) } as unknown as ConfigService<
    ApplicationConfiguration,
    true
  >;
  return { service: new ResumeExportsService(database, config), resumeExport };
}

describe('ResumeExportsService', () => {
  it('creates a private snapshot job with canonical queue values and maps publicly', async () => {
    queue.add.mockResolvedValue({});
    queue.close.mockResolvedValue(undefined);
    const { service } = harness();
    const value = await service.create(resumeId);
    expect(value).not.toHaveProperty('objectKey');
    expect(toPublicResumeExport(record)).not.toHaveProperty('objectKey');
    expect(queueConstruction).toEqual({
      name: RESUME_EXPORT_QUEUE_NAME,
      options: {
        connection: {
          host: 'redis',
          port: 6380,
          db: 2,
          username: 'user',
          password: 'secret',
          tls: {},
        },
      },
    });
    expect(queue.add).toHaveBeenCalledWith(
      RESUME_EXPORT_JOB_NAME,
      { exportId },
      expect.objectContaining({ jobId: `resume-export-${exportId}`, attempts: 3 }),
    );
  });
  it('marks queue failure safely', async () => {
    queue.add.mockRejectedValue(new Error('private redis detail'));
    queue.close.mockResolvedValue(undefined);
    const { service, resumeExport } = harness();
    await expect(service.create(resumeId)).rejects.toMatchObject({ status: 503 });
    expect(resumeExport.updateMany).toHaveBeenCalledWith(
      // Vitest asymmetric matchers intentionally represent untyped test data.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
  it('downloads only completed exports with a safe filename', async () => {
    const stream = Readable.from([Buffer.from('%PDF-test')]);
    storage.getObject.mockResolvedValue(stream);
    const { service } = harness('COMPLETED');
    await expect(service.download(exportId)).resolves.toEqual({
      bytes: Buffer.from('%PDF-test'),
      filename: 'Synthetic Resume.pdf',
    });
    expect(sanitizePdfFilename('../<>')).toBe('resume.pdf');
    await expect(harness('PROCESSING').service.download(exportId)).rejects.toMatchObject({
      status: 409,
    });
  });
});
