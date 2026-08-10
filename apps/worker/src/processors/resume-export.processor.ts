import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@cv-builder/database';
import {
  RESUME_EXPORT_JOB_NAME,
  resumeContentSchema,
  resumeExportJobPayloadSchema,
  resumeTemplateIdSchema,
} from '@cv-builder/resume-schema';
import { renderResumeHtml } from '@cv-builder/templates';
import type { PdfRenderer } from '../exports/pdf-renderer.js';
import { ResumeExportProcessingError } from '../exports/export-error.js';

export interface ExportObjectStore {
  put(key: string, bytes: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createResumeExportProcessor(
  database: PrismaClient,
  storage: ExportObjectStore,
  renderer: PdfRenderer,
) {
  return async (job: Job<unknown>): Promise<{ exportId: string }> => {
    if (job.name !== RESUME_EXPORT_JOB_NAME)
      throw new ResumeExportProcessingError(
        'INVALID_RESUME_SNAPSHOT',
        'The PDF export request is invalid.',
        false,
      );
    const { exportId } = resumeExportJobPayloadSchema.parse(job.data);
    const record = await database.resumeExport.findUnique({ where: { id: exportId } });
    if (!record)
      throw new ResumeExportProcessingError(
        'INVALID_RESUME_SNAPSHOT',
        'The PDF export request was not found.',
        false,
      );
    if (record.status === 'COMPLETED' && record.objectKey) return { exportId };
    if (record.status === 'FAILED')
      throw new ResumeExportProcessingError(
        'EXPORT_PROCESSING_FAILED',
        'This PDF export has already failed. Please create a new export.',
        false,
      );
    const processingToken = randomUUID();
    const ownership = await database.resumeExport.updateMany({
      where: { id: exportId, status: { in: ['QUEUED', 'PROCESSING'] } },
      data: {
        status: 'PROCESSING',
        processingToken,
        errorCode: null,
        errorMessage: null,
      },
    });
    if (ownership.count === 0) {
      const authoritative = await database.resumeExport.findUnique({ where: { id: exportId } });
      if (authoritative?.status === 'COMPLETED' && authoritative.objectKey) return { exportId };
      throw new ResumeExportProcessingError(
        'EXPORT_PROCESSING_FAILED',
        'This PDF export is no longer available for processing.',
        false,
      );
    }
    const objectKey = `exports/${exportId}/${processingToken}.pdf`;
    let uploaded = false;
    try {
      let html: string;
      try {
        html = renderResumeHtml({
          title: record.resumeTitle,
          content: resumeContentSchema.parse(record.resumeContent),
          template: resumeTemplateIdSchema.parse(record.template),
        });
      } catch {
        throw new ResumeExportProcessingError(
          'INVALID_RESUME_SNAPSHOT',
          'The saved resume could not be rendered.',
          false,
        );
      }
      let pdf: Buffer;
      try {
        pdf = await renderer.render(html);
      } catch {
        throw new ResumeExportProcessingError(
          'PDF_RENDER_FAILED',
          'PDF generation failed. Please try again.',
          true,
        );
      }
      if (pdf.length === 0 || pdf.subarray(0, 4).toString() !== '%PDF')
        throw new ResumeExportProcessingError(
          'PDF_RENDER_FAILED',
          'PDF generation failed. Please try again.',
          true,
        );
      try {
        await storage.put(objectKey, pdf);
        uploaded = true;
      } catch {
        throw new ResumeExportProcessingError(
          'PDF_STORAGE_FAILED',
          'The generated PDF could not be stored. Please try again.',
          true,
        );
      }
      const completed = await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ResumeExport" WHERE id = ${exportId}::uuid FOR UPDATE`;
        const locked = await tx.resumeExport.findUniqueOrThrow({ where: { id: exportId } });
        if (locked.status !== 'PROCESSING' || locked.processingToken !== processingToken)
          return false;
        await tx.resumeExport.update({
          where: { id: exportId },
          data: {
            status: 'COMPLETED',
            processingToken: null,
            objectKey,
            fileSize: pdf.length,
            errorCode: null,
            errorMessage: null,
          },
        });
        return true;
      });
      if (!completed) await storage.remove(objectKey).catch(() => undefined);
      return { exportId };
    } catch (error) {
      const classified =
        error instanceof ResumeExportProcessingError
          ? error
          : new ResumeExportProcessingError(
              'EXPORT_PROCESSING_FAILED',
              'PDF generation failed. Please try again.',
              true,
            );
      const final = !classified.retryable || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (final)
        await database.resumeExport.updateMany({
          where: { id: exportId, status: 'PROCESSING', processingToken },
          data: {
            status: 'FAILED',
            processingToken: null,
            errorCode: classified.code,
            errorMessage: classified.message,
          },
        });
      if (uploaded) {
        const authoritative = await database.resumeExport
          .findUnique({ where: { id: exportId } })
          .catch(() => null);
        if (authoritative?.objectKey !== objectKey)
          await storage.remove(objectKey).catch(() => undefined);
      }
      throw classified;
    }
  };
}
