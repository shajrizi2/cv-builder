import { randomUUID } from 'node:crypto';
import {
  createEmptyResumeContent,
  resumeContentSchema,
  type AiResumeCandidate,
  type ResumeContent,
} from '@cv-builder/resume-schema';
export function mapCandidate(
  candidate: AiResumeCandidate,
  uuid: () => string = randomUUID,
): ResumeContent {
  const content = createEmptyResumeContent();
  Object.assign(content, candidate, {
    experience: candidate.experience.map((x) => ({ id: uuid(), ...x })),
    education: candidate.education.map((x) => ({ id: uuid(), ...x })),
    skills: candidate.skills.map((x) => ({ id: uuid(), ...x })),
    languages: candidate.languages.map((x) => ({ id: uuid(), ...x })),
    links: candidate.links.map((x) => ({ id: uuid(), ...x })),
  });
  return resumeContentSchema.parse(content);
}
