import type { AiResumeCandidate } from '@cv-builder/resume-schema';
export interface AiResumeMapper {
  readonly available: boolean;
  map(text: string): Promise<AiResumeCandidate>;
}
