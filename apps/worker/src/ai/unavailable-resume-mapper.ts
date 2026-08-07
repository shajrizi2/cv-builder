import type { AiResumeCandidate } from '@cv-builder/resume-schema';
import type { AiResumeMapper } from './ai-resume-mapper.js';
import { ResumeImportProcessingError } from '../imports/import-error.js';

export class UnavailableResumeMapper implements AiResumeMapper {
  map(): Promise<AiResumeCandidate> {
    return Promise.reject(
      new ResumeImportProcessingError(
        'AI_PROVIDER_UNAVAILABLE',
        'AI resume import is not configured. Please contact the administrator.',
        false,
      ),
    );
  }
}
