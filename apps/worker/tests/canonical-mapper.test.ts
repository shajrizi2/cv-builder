import { describe, expect, it } from 'vitest';
import { resumeContentSchema, type AiResumeCandidate } from '@cv-builder/resume-schema';
import { mapCandidate } from '../src/imports/canonical-mapper.js';
describe('canonical import mapping', () => {
  it('starts from canonical defaults and generates repeatable IDs', () => {
    const candidate: AiResumeCandidate = {
      personalInfo: { fullName: 'Ada', email: '', phone: '', location: '' },
      summary: '',
      experience: [],
      education: [],
      skills: [{ name: 'Math', level: '' }],
      languages: [],
      links: [],
    };
    const content = mapCandidate(candidate, () => '550e8400-e29b-41d4-a716-446655440000');
    expect(content.skills[0]?.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(resumeContentSchema.safeParse(content).success).toBe(true);
    expect(content.metadata).toEqual({ version: 1 });
  });
});
