import { Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@cv-builder/database';
import {
  DEFAULT_RESUME_TEMPLATE,
  createEmptyResumeContent,
  resumeContentSchema,
  resumeSchema,
  resumeImportSourceSchema,
  type CreateResumeInput,
  type Resume,
  type ResumeImportSource,
  type UpdateResumeInput,
} from '@cv-builder/resume-schema';

import { DatabaseService } from '../database/database.module';

type StoredResume = Awaited<ReturnType<PrismaClient['resume']['findUnique']>>;

@Injectable()
export class ResumesService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get database(): PrismaClient {
    return this.databaseService.client;
  }

  async create(ownerId: string, input: CreateResumeInput): Promise<Resume> {
    return this.toResume(
      await this.database.resume.create({
        data: {
          title: input.title,
          ownerId,
          content: createEmptyResumeContent(),
          template: input.template ?? DEFAULT_RESUME_TEMPLATE,
        },
      }),
    );
  }

  async list(ownerId: string): Promise<Resume[]> {
    const records = await this.database.resume.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
    });
    return records.map((record) => this.toResume(record));
  }

  async get(ownerId: string, id: string): Promise<Resume> {
    const record = await this.database.resume.findFirst({ where: { id, ownerId } });
    if (record === null) throw new NotFoundException('Resume was not found');
    return this.toResume(record);
  }

  async getImportSource(ownerId: string, id: string): Promise<ResumeImportSource> {
    const record = await this.database.resume.findFirst({
      where: { id, ownerId },
      include: {
        sourceImport: {
          select: {
            id: true,
            ownerId: true,
            resumeId: true,
            status: true,
            completionMode: true,
            extractedText: true,
          },
        },
      },
    });
    if (record === null) throw new NotFoundException('Resume was not found');
    const source = record.sourceImport;
    if (source === null || source.completionMode === null) return null;
    if (source.ownerId !== ownerId || source.resumeId !== id || source.status !== 'COMPLETED') {
      throw new NotFoundException('Resume was not found');
    }
    return resumeImportSourceSchema.parse({
      importId: source.id,
      completionMode: source.completionMode,
      extractedText: source.completionMode === 'MANUAL_FALLBACK' ? source.extractedText : null,
    });
  }

  async update(ownerId: string, id: string, input: UpdateResumeInput): Promise<Resume> {
    const result = await this.database.resume.updateMany({
      where: { id, ownerId },
      data: {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.content === undefined ? {} : { content: input.content }),
        ...(input.template === undefined ? {} : { template: input.template }),
      },
    });
    if (result.count === 0) throw new NotFoundException('Resume was not found');
    const record = await this.database.resume.findFirst({ where: { id, ownerId } });
    if (record === null) throw new NotFoundException('Resume was not found');
    return this.toResume(record);
  }

  async delete(ownerId: string, id: string): Promise<void> {
    const result = await this.database.resume.deleteMany({ where: { id, ownerId } });
    if (result.count === 0) throw new NotFoundException('Resume was not found');
  }

  private toResume(record: NonNullable<StoredResume>): Resume {
    const content = resumeContentSchema.parse(record.content);
    return resumeSchema.parse({
      id: record.id,
      title: record.title,
      template: record.template ?? DEFAULT_RESUME_TEMPLATE,
      content,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}
