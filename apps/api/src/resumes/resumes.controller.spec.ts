import { createResumeInputSchema } from '@cv-builder/resume-schema';
import { describe, expect, it } from 'vitest';
import { ResumeValidationPipe } from './resume-validation.pipe';

describe('resume request validation', () => {
  const pipe = new ResumeValidationPipe(createResumeInputSchema);
  it('trims valid input', () => expect(pipe.transform({ title: ' CV ' })).toEqual({ title: 'CV' }));
  it('rejects unknown top-level properties', () =>
    expect(() => pipe.transform({ title: 'CV', content: {} })).toThrowError(
      /Resume data is invalid/,
    ));
});
