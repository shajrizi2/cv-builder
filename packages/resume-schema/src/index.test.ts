import { describe, expect, it } from 'vitest';

import {
  aiResumeCandidateSchema,
  createEmptyResumeContent,
  resumeContentSchema,
  resumeSectionKeys,
  updateResumeInputSchema,
  resumeImportJobPayloadSchema,
  resumeImportSchema,
  RESUME_IMPORT_JOB_NAME,
  RESUME_IMPORT_QUEUE_NAME,
  DEFAULT_RESUME_TEMPLATE,
  RESUME_EXPORT_JOB_NAME,
  RESUME_EXPORT_QUEUE_NAME,
  resumeExportJobPayloadSchema,
  resumeExportSchema,
  resumeTemplateIdSchema,
  resumeSchema,
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

describe('resume export contracts', () => {
  it('defines exactly two templates with classic as the default', () => {
    expect(DEFAULT_RESUME_TEMPLATE).toBe('classic');
    expect(resumeTemplateIdSchema.options).toEqual(['classic', 'modern']);
    expect(resumeTemplateIdSchema.safeParse('custom').success).toBe(false);
    expect(
      resumeSchema.parse({
        id: crypto.randomUUID(),
        title: 'Existing resume',
        content: createEmptyResumeContent(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).template,
    ).toBe('classic');
  });

  it('validates strict public exports and canonical jobs', () => {
    const id = crypto.randomUUID();
    const value = {
      id,
      resumeId: crypto.randomUUID(),
      template: 'modern',
      status: 'COMPLETED',
      errorCode: null,
      errorMessage: null,
      fileSize: 123,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(resumeExportSchema.parse(value)).toEqual(value);
    expect(resumeExportSchema.safeParse({ ...value, objectKey: 'private' }).success).toBe(false);
    expect(resumeExportJobPayloadSchema.parse({ exportId: id })).toEqual({ exportId: id });
    expect(RESUME_EXPORT_QUEUE_NAME).toBe('resume-export');
    expect(RESUME_EXPORT_JOB_NAME).toBe('generate-resume-pdf');
  });
});

describe('resume import contracts', () => {
  it('accepts a strict public import and job payload', () => {
    const value = {
      id: crypto.randomUUID(),
      originalFilename: 'resume.pdf',
      mimeType: 'application/pdf',
      fileSize: 42,
      status: 'QUEUED',
      errorCode: null,
      errorMessage: null,
      resumeId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(resumeImportSchema.parse(value)).toEqual(value);
    expect(
      resumeImportJobPayloadSchema.safeParse({ importId: value.id, text: 'private' }).success,
    ).toBe(false);
  });

  it('exports canonical resume-import queue identifiers', () => {
    expect(RESUME_IMPORT_QUEUE_NAME).toBe('resume-import');
    expect(RESUME_IMPORT_JOB_NAME).toBe('process-resume-import');
  });

  it('keeps AI candidates semantic and rejects worker-owned fields', () => {
    const candidate = {
      personalInfo: { fullName: '', email: '', phone: '', location: '' },
      summary: '',
      experience: [],
      education: [],
      skills: [],
      languages: [],
      links: [],
    };
    expect(aiResumeCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(
      aiResumeCandidateSchema.safeParse({ ...candidate, metadata: { version: 1 } }).success,
    ).toBe(false);
  });
});
