import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Client } from 'minio';
import {
  RESUME_EXPORT_JOB_NAME,
  RESUME_EXPORT_QUEUE_NAME,
  resumeContentSchema,
  resumeExportSchema,
  type ResumeExport,
} from '@cv-builder/resume-schema';
import type { ApplicationConfiguration } from '../config/configuration';
import type { Environment } from '../config/env.schema';
import { DatabaseService } from '../database/database.module';

interface StoredExport {
  id: string;
  resumeId: string;
  template: string;
  status: string;
  objectKey: string | null;
  fileSize: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicResumeExport(record: StoredExport): ResumeExport {
  return resumeExportSchema.parse({
    id: record.id,
    resumeId: record.resumeId,
    template: record.template,
    status: record.status,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    fileSize: record.fileSize,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export function sanitizePdfFilename(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}._ -]+/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/[._ -]+$/g, '')
    .trim()
    .slice(0, 100);
  return `${base || 'resume'}.pdf`;
}

@Injectable()
export class ResumeExportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<ApplicationConfiguration, true>,
  ) {}

  async create(resumeId: string): Promise<ResumeExport> {
    const resume = await this.database.client.resume.findUnique({ where: { id: resumeId } });
    if (!resume) throw new NotFoundException(`Resume ${resumeId} was not found`);
    const content = resumeContentSchema.parse(resume.content);
    const env = this.config.getOrThrow<Environment>('api');
    if (!env.redisHost || !env.minioEndpoint || !env.minioAccessKey || !env.minioSecretKey)
      throw new ServiceUnavailableException('PDF export infrastructure is unavailable');
    const record = await this.database.client.resumeExport.create({
      data: {
        resumeId,
        template: resume.template,
        resumeTitle: resume.title,
        resumeContent: content,
      },
    });
    const queue = new Queue(RESUME_EXPORT_QUEUE_NAME, {
      connection: {
        host: env.redisHost,
        port: env.redisPort,
        db: env.redisDatabase,
        ...(env.redisUsername ? { username: env.redisUsername } : {}),
        ...(env.redisPassword ? { password: env.redisPassword } : {}),
        ...(env.redisTls ? { tls: {} } : {}),
      },
    });
    try {
      await queue.add(
        RESUME_EXPORT_JOB_NAME,
        { exportId: record.id },
        {
          jobId: `resume-export-${record.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
    } catch {
      await this.database.client.resumeExport.updateMany({
        where: { id: record.id, status: { not: 'COMPLETED' } },
        data: {
          status: 'FAILED',
          errorCode: 'EXPORT_INFRASTRUCTURE_UNAVAILABLE',
          errorMessage: 'PDF export infrastructure is unavailable. Please try again.',
        },
      });
      throw new ServiceUnavailableException('PDF export infrastructure is unavailable');
    } finally {
      await queue.close().catch(() => undefined);
    }
    return toPublicResumeExport(record);
  }

  async get(id: string): Promise<ResumeExport> {
    const record = await this.database.client.resumeExport.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Resume export ${id} was not found`);
    return toPublicResumeExport(record);
  }

  async latestForResume(resumeId: string): Promise<ResumeExport | null> {
    const resume = await this.database.client.resume.findUnique({
      where: { id: resumeId },
      select: { id: true },
    });
    if (!resume) throw new NotFoundException(`Resume ${resumeId} was not found`);
    const record = await this.database.client.resumeExport.findFirst({
      where: { resumeId },
      orderBy: { createdAt: 'desc' },
    });
    return record ? toPublicResumeExport(record) : null;
  }

  async download(id: string): Promise<{ bytes: Buffer; filename: string }> {
    const record = await this.database.client.resumeExport.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Resume export ${id} was not found`);
    if (record.status !== 'COMPLETED' || !record.objectKey)
      throw new ConflictException('PDF export is not ready for download');
    const env = this.config.getOrThrow<Environment>('api');
    if (!env.minioEndpoint || !env.minioAccessKey || !env.minioSecretKey)
      throw new ServiceUnavailableException('PDF download is unavailable');
    const storage = new Client({
      endPoint: env.minioEndpoint,
      port: env.minioPort,
      useSSL: env.minioUseSsl,
      accessKey: env.minioAccessKey,
      secretKey: env.minioSecretKey,
    });
    try {
      const stream = await storage.getObject(env.minioBucket, record.objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream)
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
      return { bytes: Buffer.concat(chunks), filename: sanitizePdfFilename(record.resumeTitle) };
    } catch {
      throw new ServiceUnavailableException('PDF download is unavailable');
    }
  }
}
