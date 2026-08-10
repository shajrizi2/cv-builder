import { describe, expect, it } from 'vitest';
import { createEmptyResumeContent } from '@cv-builder/resume-schema';
import { renderResumeHtml } from './index.js';

describe('resume template renderer', () => {
  it('is deterministic, escapes content, and contains no remote resources', () => {
    const content = createEmptyResumeContent();
    content.personalInfo.fullName = '<img src=x onerror=alert(1)><script>alert(1)</script>';
    const input = { title: 'Synthetic', template: 'classic' as const, content };
    const html = renderResumeHtml(input);
    expect(renderResumeHtml(input)).toBe(html);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toMatch(/https?:\/\//);
  });
});
