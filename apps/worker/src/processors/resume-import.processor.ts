import type { Job } from 'bullmq';
import { ZodError } from 'zod';
import {
  MAX_EXTRACTED_TEXT_LENGTH,
  RESUME_IMPORT_JOB_NAME,
  createEmptyResumeContent,
  resumeContentSchema,
  resumeImportJobPayloadSchema,
  type AiResumeCandidate,
  type ResumeContent,
  type ResumeImportErrorCode,
  type ResumeImportMode,
} from '@cv-builder/resume-schema';
import type { PrismaClient } from '@cv-builder/database';
import type { AiResumeMapper } from '../ai/ai-resume-mapper.js';
import { extractDocument } from '../imports/document-extractor.js';
import { mapCandidate } from '../imports/canonical-mapper.js';
import { ResumeImportProcessingError } from '../imports/import-error.js';

export interface ImportObjectStore {
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

interface ImportLogger {
  info(event: string, metadata: Record<string, unknown>): void;
  error(event: string, metadata: Record<string, unknown>): void;
}

const silentLogger: ImportLogger = { info: () => undefined, error: () => undefined };
const fallbackEligibleAiErrorCodes = new Set<ResumeImportErrorCode>([
  'AI_PROVIDER_UNAVAILABLE',
  'AI_PROVIDER_ERROR',
  'AI_INVALID_RESPONSE',
]);

function isFallbackEligibleAiError(error: unknown): error is ResumeImportProcessingError {
  return (
    error instanceof ResumeImportProcessingError && fallbackEligibleAiErrorCodes.has(error.code)
  );
}

export function createManualImportResumeContent(): ResumeContent {
  return resumeContentSchema.parse(createEmptyResumeContent());
}

export function createImportedResumeTitle(filename: string): string {
  const basename = filename
    .trim()
    .replace(/\.(pdf|docx)$/i, '')
    .trim()
    .slice(0, 200)
    .trim();
  return basename || 'Imported resume';
}

function reusableExtractedText(value: string | null): string | undefined {
  if (value === null || value.length === 0 || value.length > MAX_EXTRACTED_TEXT_LENGTH) return;
  if (value.includes('\u0000') || value.trim().length === 0) return;
  return value;
}

export function createResumeImportProcessor(
  database: PrismaClient,
  storage: ImportObjectStore,
  ai: AiResumeMapper,
  logger: ImportLogger = silentLogger,
) {
  async function cleanupSource(importId: string, objectKey: string | null): Promise<void> {
    if (!objectKey) return;
    try {
      await storage.remove(objectKey);
      await database.resumeImport.updateMany({
        where: { id: importId, objectKey },
        data: { objectKey: null },
      });
      logger.info('resume-import.source-cleaned', { importId });
    } catch {
      logger.error('resume-import.source-cleanup-failed', { importId });
    }
  }

  return async (job: Job<unknown>): Promise<{ resumeId: string }> => {
    if (job.name !== RESUME_IMPORT_JOB_NAME) throw new Error('Invalid resume-import job name');
    const { importId } = resumeImportJobPayloadSchema.parse(job.data);
    const record = await database.resumeImport.findUnique({ where: { id: importId } });
    if (!record) throw new Error('Resume import was not found');
    if (record.status === 'COMPLETED' && record.resumeId) {
      if (record.ownerId) await cleanupSource(importId, record.objectKey);
      return { resumeId: record.resumeId };
    }
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
      let text = reusableExtractedText(record.extractedText);
      if (text === undefined) {
        if (!record.objectKey) {
          throw new ResumeImportProcessingError(
            'PROCESSING_FAILED',
            'The resume could not be imported. Please try again.',
            true,
          );
        }
        text = await extractDocument(await storage.get(record.objectKey), record.mimeType);
        const persisted = await database.resumeImport.updateMany({
          where: { id: importId, ownerId: record.ownerId, status: 'PROCESSING' },
          data: { extractedText: text },
        });
        if (persisted.count !== 1) throw new Error('Resume import changed during extraction');
      }
      await cleanupSource(importId, record.objectKey);

      let completionMode: ResumeImportMode = 'MANUAL_FALLBACK';
      let content = createManualImportResumeContent();
      if (ai.available) {
        let candidate: AiResumeCandidate | undefined;
        try {
          candidate = await ai.map(text);
        } catch (error) {
          if (!isFallbackEligibleAiError(error)) throw error;
          logger.info('resume-import.ai-fallback', { importId });
          candidate = undefined;
        }
        if (candidate !== undefined) {
          try {
            content = mapCandidate(candidate);
            completionMode = 'AI_MAPPED';
          } catch (error) {
            if (!(error instanceof ZodError)) throw error;
            logger.info('resume-import.ai-fallback', { importId });
          }
        }
      }

      return await database.$transaction(async (tx) => {
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
        if (!['QUEUED', 'PROCESSING'].includes(locked.status)) {
          throw new Error('Resume import is not processable');
        }
        const resume = await tx.resume.create({
          data: {
            ownerId: locked.ownerId,
            title: createImportedResumeTitle(locked.originalFilename),
            content,
          },
        });
        await tx.resumeImport.update({
          where: { id: importId },
          data: {
            status: 'COMPLETED',
            resumeId: resume.id,
            completionMode,
            extractedText: completionMode === 'MANUAL_FALLBACK' ? text : null,
            errorCode: null,
            errorMessage: null,
          },
        });
        return { resumeId: resume.id };
      });
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
          data: { status: 'FAILED', errorCode: classified.code, errorMessage: classified.message },
        });
      throw error;
    }
  };
}
