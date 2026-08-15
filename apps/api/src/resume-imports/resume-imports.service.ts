import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Client } from 'minio';
import type { FastifyRequest } from 'fastify';
import {
  RESUME_IMPORT_JOB_NAME,
  RESUME_IMPORT_QUEUE_NAME,
  resumeImportSchema,
  type ResumeImport,
} from '@cv-builder/resume-schema';
import { DatabaseService } from '../database/database.module';
import type { ApplicationConfiguration } from '../config/configuration';
import type { Environment } from '../config/env.schema';
import { validateImportFile } from './file-validation';

interface StoredResumeImport {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  objectKey: string | null;
  status: string;
  completionMode: string | null;
  extractedText: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  resumeId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicResumeImport(record: StoredResumeImport): ResumeImport {
  return resumeImportSchema.parse({
    id: record.id,
    originalFilename: record.originalFilename,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    status: record.status,
    completionMode: record.completionMode,
    hasExtractedText: record.extractedText !== null && record.extractedText.length > 0,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    resumeId: record.resumeId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

interface StrictUpload {
  readonly filename: string;
  readonly mimetype: string;
  readonly bytes: Buffer;
}

async function readStrictUpload(request: FastifyRequest): Promise<StrictUpload> {
  let file:
    { readonly filename: string; readonly mimetype: string; readonly bytes: Buffer } | undefined;

  try {
    for await (const part of request.parts()) {
      if (part.type !== 'file') {
        throw new BadRequestException('Unexpected multipart field');
      }
      if (part.fieldname !== 'file') {
        await part.toBuffer();
        throw new BadRequestException('Multipart field "file" is required');
      }
      if (file !== undefined) {
        await part.toBuffer();
        throw new BadRequestException('Exactly one file is required');
      }
      file = {
        filename: part.filename,
        mimetype: part.mimetype,
        bytes: await part.toBuffer(),
      };
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Invalid multipart upload');
  }

  if (file === undefined) throw new BadRequestException('Multipart field "file" is required');
  return file;
}

@Injectable()
export class ResumeImportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<ApplicationConfiguration, true>,
  ) {}
  async create(ownerId: string, request: FastifyRequest): Promise<ResumeImport> {
    const part = await readStrictUpload(request);
    let validated;
    try {
      validated = await validateImportFile(part.filename, part.mimetype, part.bytes);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid file');
    }
    const env = this.config.getOrThrow<Environment>('api');
    if (!env.redisHost || !env.minioEndpoint || !env.minioAccessKey || !env.minioSecretKey)
      throw new ServiceUnavailableException('Resume import infrastructure is unavailable');
    const bytes = part.bytes;
    const objectKey = `imports/${randomUUID()}`;
    const storage = new Client({
      endPoint: env.minioEndpoint,
      port: env.minioPort,
      useSSL: env.minioUseSsl,
      accessKey: env.minioAccessKey,
      secretKey: env.minioSecretKey,
    });
    let record;
    try {
      await storage.putObject(env.minioBucket, objectKey, bytes, bytes.length, {
        'Content-Type': validated.mimeType,
      });
      record = await this.database.client.resumeImport.create({
        data: {
          originalFilename: validated.filename,
          mimeType: validated.mimeType,
          fileSize: bytes.length,
          objectKey,
          ownerId,
        },
      });
      const queue = new Queue(RESUME_IMPORT_QUEUE_NAME, {
        connection: {
          host: env.redisHost,
          port: env.redisPort,
          db: env.redisDatabase,
          ...(env.redisUsername === undefined ? {} : { username: env.redisUsername }),
          ...(env.redisPassword === undefined ? {} : { password: env.redisPassword }),
          ...(env.redisTls ? { tls: {} } : {}),
        },
      });
      try {
        await queue.add(
          RESUME_IMPORT_JOB_NAME,
          { importId: record.id },
          {
            jobId: `resume-import-${record.id}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          },
        );
      } finally {
        await queue.close();
      }
    } catch {
      if (record) {
        await this.database.client.resumeImport
          .update({
            where: { id: record.id },
            data: {
              status: 'FAILED',
              errorCode: 'IMPORT_INFRASTRUCTURE_UNAVAILABLE',
              errorMessage: 'Import infrastructure is unavailable. Please try again.',
            },
          })
          .catch(() => undefined);
        await storage.removeObject(env.minioBucket, objectKey).catch(() => undefined);
      } else await storage.removeObject(env.minioBucket, objectKey).catch(() => undefined);
      throw new ServiceUnavailableException('Resume import infrastructure is unavailable');
    }
    return toPublicResumeImport(record);
  }
  async list(ownerId: string): Promise<ResumeImport[]> {
    return (
      await this.database.client.resumeImport.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'desc' },
      })
    ).map((r) => toPublicResumeImport(r));
  }
  async get(ownerId: string, id: string): Promise<ResumeImport> {
    const r = await this.database.client.resumeImport.findFirst({ where: { id, ownerId } });
    if (!r) throw new NotFoundException('Resume import was not found');
    return toPublicResumeImport(r);
  }
}
