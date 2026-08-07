import type { ResumeImportErrorCode } from '@cv-builder/resume-schema';

export class ResumeImportProcessingError extends Error {
  constructor(
    readonly code: ResumeImportErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ResumeImportProcessingError';
  }
}
