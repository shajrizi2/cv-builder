import { describe, expect, it } from 'vitest';

import {
  createEmptyResumeContent,
  resumeContentSchema,
  resumeSectionKeys,
  updateResumeInputSchema,
} from './index.js';

describe('resume schema', () => {
  it('creates valid, editable empty content', () => {
    const content = createEmptyResumeContent();
    expect(resumeContentSchema.parse(content)).toEqual(content);
    expect(content.sectionOrder).toEqual(resumeSectionKeys);
  });

  it('accepts partially completed repeatable entries', () => {
    const content = createEmptyResumeContent();
    content.experience.push({
      id: crypto.randomUUID(),
      company: '',
      position: '',
      location: '',
      startDate: '',
      endDate: '',
      current: false,
      description: '',
    });
    expect(resumeContentSchema.safeParse(content).success).toBe(true);
  });

  it('rejects malformed content and unknown update properties', () => {
    expect(
      resumeContentSchema.safeParse({ ...createEmptyResumeContent(), experience: [{ id: 'bad' }] })
        .success,
    ).toBe(false);
    expect(updateResumeInputSchema.safeParse({ title: 'CV', unexpected: true }).success).toBe(
      false,
    );
  });

  it('requires every section exactly once', () => {
    const content = createEmptyResumeContent();
    content.sectionOrder = content.sectionOrder.map(() => 'summary');
    expect(resumeContentSchema.safeParse(content).success).toBe(false);
  });
});
