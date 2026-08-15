import type { Job } from 'bullmq';
import {
  RESUME_IMPORT_JOB_NAME,
  resumeImportJobPayloadSchema,
  type AiResumeCandidate,
  type ResumeContent,
} from '@cv-builder/resume-schema';
import type { PrismaClient } from '@cv-builder/database';
import type { AiResumeMapper } from '../ai/ai-resume-mapper.js';
import { extractDocument } from '../imports/document-extractor.js';
import { mapCandidate } from '../imports/canonical-mapper.js';
import { ResumeImportProcessingError } from '../imports/import-error.js';
export interface ImportObjectStore {
  get(key: string): Promise<Buffer>;
}
export function createResumeImportProcessor(
  database: PrismaClient,
  storage: ImportObjectStore,
  ai: AiResumeMapper,
) {
  return async (job: Job<unknown>): Promise<{ resumeId: string }> => {
    if (job.name !== RESUME_IMPORT_JOB_NAME) {
      throw new Error('Invalid resume-import job name');
    }
    const { importId } = resumeImportJobPayloadSchema.parse(job.data);
    const record = await database.resumeImport.findUnique({ where: { id: importId } });
    if (!record) throw new Error('Resume import was not found');
    if (record.status === 'COMPLETED' && record.resumeId) return { resumeId: record.resumeId };
    if (record.status === 'FAILED') throw new Error('Resume import has already failed');
    if (!record.ownerId) {
      const failed = await database.resumeImport.updateMany({
        where: { id: importId, ownerId: null, status: { in: ['QUEUED', 'PROCESSING'] } },
        data: {
          status: 'FAILED',
          errorCode: 'PROCESSING_FAILED',
          errorMessage: 'This import cannot be processed automatically.',
        },
      });
      if (failed.count === 0) {
        const current = await database.resumeImport.findUnique({ where: { id: importId } });
        if (current?.status === 'COMPLETED' && current.resumeId)
          return { resumeId: current.resumeId };
      }
      throw new ResumeImportProcessingError(
        'PROCESSING_FAILED',
        'This import cannot be processed automatically.',
        false,
      );
    }
    const claimed = await database.resumeImport.updateMany({
      where: { id: importId, status: { in: ['QUEUED', 'PROCESSING'] } },
      data: { status: 'PROCESSING', errorCode: null, errorMessage: null },
    });
    if (claimed.count === 0) {
      const current = await database.resumeImport.findUnique({ where: { id: importId } });
      if (current?.status === 'COMPLETED' && current.resumeId)
        return { resumeId: current.resumeId };
      throw new Error('Resume import is not processable');
    }
    try {
      const text = await extractDocument(await storage.get(record.objectKey), record.mimeType);
      const candidate: AiResumeCandidate = await ai.map(text);
      let content: ResumeContent;
      try {
        content = mapCandidate(candidate);
      } catch {
        throw new ResumeImportProcessingError(
          'CANONICAL_MAPPING_FAILED',
          'The extracted resume could not be validated.',
          false,
        );
      }
      const result = await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ResumeImport" WHERE id = ${importId}::uuid FOR UPDATE`;
        const locked = await tx.resumeImport.findUniqueOrThrow({ where: { id: importId } });
        if (locked.status === 'COMPLETED' && locked.resumeId) return { resumeId: locked.resumeId };
        if (!locked.ownerId) {
          throw new ResumeImportProcessingError(
            'PROCESSING_FAILED',
            'This legacy import has no owner and cannot be processed automatically.',
            false,
          );
        }
        const resume = await tx.resume.create({
          data: {
            ownerId: locked.ownerId,
            title: locked.originalFilename.replace(/\.(pdf|docx)$/i, '') || 'Imported resume',
            content,
          },
        });
        await tx.resumeImport.update({
          where: { id: importId },
          data: { status: 'COMPLETED', resumeId: resume.id, errorCode: null, errorMessage: null },
        });
        return { resumeId: resume.id };
      });
      return result;
    } catch (error) {
      const classified =
        error instanceof ResumeImportProcessingError
          ? error
          : new ResumeImportProcessingError(
              'PROCESSING_FAILED',
              'The resume could not be imported. Please try again.',
              true,
            );
      const final = !classified.retryable || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (final)
        await database.resumeImport.updateMany({
          where: { id: importId, status: 'PROCESSING' },
          data: {
            status: 'FAILED',
            errorCode: classified.code,
            errorMessage: classified.message,
          },
        });
      throw error;
    }
  };
}
