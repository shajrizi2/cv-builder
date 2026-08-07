import type { AiResumeCandidate } from '@cv-builder/resume-schema';
export interface AiResumeMapper {
  map(text: string): Promise<AiResumeCandidate>;
}
