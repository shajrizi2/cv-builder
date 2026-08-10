import type { ResumeExportErrorCode } from '@cv-builder/resume-schema';

export class ResumeExportProcessingError extends Error {
  constructor(
    readonly code: ResumeExportErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ResumeExportProcessingError';
  }
}
