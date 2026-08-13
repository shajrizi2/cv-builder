import { Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@cv-builder/database';
import {
  DEFAULT_RESUME_TEMPLATE,
  createEmptyResumeContent,
  resumeContentSchema,
  resumeSchema,
  type CreateResumeInput,
  type Resume,
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

  async create(input: CreateResumeInput): Promise<Resume> {
    return this.toResume(
      await this.database.resume.create({
        data: {
          title: input.title,
          content: createEmptyResumeContent(),
          template: input.template ?? DEFAULT_RESUME_TEMPLATE,
        },
      }),
    );
  }

  async list(): Promise<Resume[]> {
    const records = await this.database.resume.findMany({ orderBy: { updatedAt: 'desc' } });
    return records.map((record) => this.toResume(record));
  }

  async get(id: string): Promise<Resume> {
    const record = await this.database.resume.findUnique({ where: { id } });
    if (record === null) throw new NotFoundException(`Resume ${id} was not found`);
    return this.toResume(record);
  }

  async update(id: string, input: UpdateResumeInput): Promise<Resume> {
    const existing = await this.database.resume.findUnique({ where: { id }, select: { id: true } });
    if (existing === null) throw new NotFoundException(`Resume ${id} was not found`);
    const record = await this.database.resume.update({
      where: { id },
      data: {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.content === undefined ? {} : { content: input.content }),
        ...(input.template === undefined ? {} : { template: input.template }),
      },
    });
    return this.toResume(record);
  }

  async delete(id: string): Promise<void> {
    const result = await this.database.resume.deleteMany({ where: { id } });
    if (result.count === 0) throw new NotFoundException(`Resume ${id} was not found`);
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
