import type { Job } from 'bullmq';
import type { PrismaClient } from '@cv-builder/database';
import { describe, expect, it, vi } from 'vitest';
import { createResumeImportProcessor } from '../src/processors/resume-import.processor.js';
import { ResumeImportProcessingError } from '../src/imports/import-error.js';
import { UnavailableResumeMapper } from '../src/ai/unavailable-resume-mapper.js';
import { RESUME_IMPORT_JOB_NAME } from '@cv-builder/resume-schema';
vi.mock('../src/imports/document-extractor.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/imports/document-extractor.js')>();
  return { ...original, extractDocument: vi.fn().mockResolvedValue('resume text') };
});
describe('resume import processor idempotency', () => {
  it('returns an existing completed resume without reading private content or calling AI', async () => {
    const resumeId = '550e8400-e29b-41d4-a716-446655440001';
    const database = {
      resumeImport: { findUnique: vi.fn().mockResolvedValue({ status: 'COMPLETED', resumeId }) },
    } as unknown as PrismaClient;
    const storage = { get: vi.fn() };
    const ai = { map: vi.fn() };
    const processor = createResumeImportProcessor(database, storage, ai);
    await expect(
      processor({
        name: RESUME_IMPORT_JOB_NAME,
        data: { importId: '550e8400-e29b-41d4-a716-446655440000' },
      } as Job<unknown>),
    ).resolves.toEqual({ resumeId });
    expect(storage.get).not.toHaveBeenCalled();
    expect(ai.map).not.toHaveBeenCalled();
  });

  it('does not let a late duplicate failure overwrite completed state', async () => {
    const importId = '550e8400-e29b-41d4-a716-446655440000';
    const resumeId = '550e8400-e29b-41d4-a716-446655440001';
    const state = { status: 'QUEUED', resumeId: null as string | null };
    const resumes: string[] = [];
    const record = (): {
      id: string;
      originalFilename: string;
      mimeType: string;
      objectKey: string;
      status: string;
      resumeId: string | null;
    } => ({
      id: importId,
      originalFilename: 'cv.pdf',
      mimeType: 'application/pdf',
      objectKey: 'private-key',
      status: state.status,
      resumeId: state.resumeId,
    });
    const resumeImport = {
      findUnique: vi.fn(() => Promise.resolve(record())),
      updateMany: vi.fn(
        ({
          where,
          data,
        }: {
          where: { status?: string | { in: string[] } };
          data: { status: string };
        }) => {
          const allowed =
            typeof where.status === 'string'
              ? state.status === where.status
              : (where.status?.in.includes(state.status) ?? true);
          if (!allowed) return Promise.resolve({ count: 0 });
          state.status = data.status;
          return Promise.resolve({ count: 1 });
        },
      ),
    };
    const transactionImport = {
      findUniqueOrThrow: vi.fn(() => Promise.resolve(record())),
      update: vi.fn(({ data }: { data: { status: string; resumeId: string } }) => {
        state.status = data.status;
        state.resumeId = data.resumeId;
        return Promise.resolve(record());
      }),
    };
    const database = {
      resumeImport,
      $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          $queryRaw: vi.fn(),
          resumeImport: transactionImport,
          resume: {
            create: vi.fn(() => {
              resumes.push(resumeId);
              return Promise.resolve({ id: resumeId });
            }),
          },
        }),
    } as unknown as PrismaClient;
    let rejectLate!: (error: Error) => void;
    const late = new Promise<never>((_, reject) => {
      rejectLate = reject;
    });
    const candidate = {
      personalInfo: { fullName: '', email: '', phone: '', location: '' },
      summary: '',
      experience: [],
      education: [],
      skills: [],
      languages: [],
      links: [],
    };
    const ai = { map: vi.fn().mockResolvedValueOnce(candidate).mockReturnValueOnce(late) };
    const processor = createResumeImportProcessor(
      database,
      { get: vi.fn().mockResolvedValue(Buffer.from('x')) },
      ai,
    );
    const job = {
      name: RESUME_IMPORT_JOB_NAME,
      data: { importId },
      attemptsMade: 0,
      opts: { attempts: 1 },
    } as Job<unknown>;
    const successful = processor(job);
    const failing = processor(job);
    await expect(successful).resolves.toEqual({ resumeId });
    rejectLate(new Error('late failure'));
    await expect(failing).rejects.toThrow('late failure');
    expect(state).toEqual({ status: 'COMPLETED', resumeId });
    expect(resumes).toEqual([resumeId]);
  });

  it.each([
    [
      new UnavailableResumeMapper(),
      'AI_PROVIDER_UNAVAILABLE',
      'AI resume import is not configured. Please contact the administrator.',
    ],
    [
      {
        map: (): Promise<never> =>
          Promise.reject(
            new ResumeImportProcessingError(
              'AI_INVALID_RESPONSE',
              'The AI provider returned an invalid structured response.',
              false,
            ),
          ),
      },
      'AI_INVALID_RESPONSE',
      'The AI provider returned an invalid structured response.',
    ],
  ])('persists stable non-retryable AI failure %s', async (ai, code, message) => {
    const importId = '550e8400-e29b-41d4-a716-446655440000';
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const database = {
      resumeImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: importId,
          objectKey: 'private',
          mimeType: 'application/pdf',
          status: 'QUEUED',
          resumeId: null,
        }),
        updateMany,
      },
    } as unknown as PrismaClient;
    const processor = createResumeImportProcessor(
      database,
      { get: vi.fn().mockResolvedValue(Buffer.from('document')) },
      ai,
    );

    await expect(
      processor({
        name: RESUME_IMPORT_JOB_NAME,
        data: { importId },
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as Job<unknown>),
    ).rejects.toBeInstanceOf(Error);
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: importId, status: 'PROCESSING' },
      data: { status: 'FAILED', errorCode: code, errorMessage: message },
    });
  });

  it('retries transient provider errors before persisting the final safe failure', async () => {
    const importId = '550e8400-e29b-41d4-a716-446655440000';
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const database = {
      resumeImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: importId,
          objectKey: 'private',
          mimeType: 'application/pdf',
          status: 'PROCESSING',
          resumeId: null,
        }),
        updateMany,
      },
    } as unknown as PrismaClient;
    const ai = {
      map: (): Promise<never> =>
        Promise.reject(
          new ResumeImportProcessingError(
            'AI_PROVIDER_ERROR',
            'The AI provider is temporarily unavailable. Please try again.',
            true,
          ),
        ),
    };
    const processor = createResumeImportProcessor(
      database,
      { get: vi.fn().mockResolvedValue(Buffer.from('document')) },
      ai,
    );

    await expect(
      processor({
        name: RESUME_IMPORT_JOB_NAME,
        data: { importId },
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as Job<unknown>),
    ).rejects.toBeInstanceOf(Error);
    expect(updateMany).toHaveBeenCalledTimes(1);

    await expect(
      processor({
        name: RESUME_IMPORT_JOB_NAME,
        data: { importId },
        attemptsMade: 2,
        opts: { attempts: 3 },
      } as Job<unknown>),
    ).rejects.toBeInstanceOf(Error);
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: importId, status: 'PROCESSING' },
      data: {
        status: 'FAILED',
        errorCode: 'AI_PROVIDER_ERROR',
        errorMessage: 'The AI provider is temporarily unavailable. Please try again.',
      },
    });
  });

  it('classifies final canonical validation failure as non-retryable', async () => {
    const importId = '550e8400-e29b-41d4-a716-446655440000';
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const database = {
      resumeImport: {
        findUnique: vi.fn().mockResolvedValue({
          id: importId,
          objectKey: 'private',
          mimeType: 'application/pdf',
          status: 'QUEUED',
          resumeId: null,
        }),
        updateMany,
      },
    } as unknown as PrismaClient;
    const invalidCandidate = {
      personalInfo: { fullName: 'x'.repeat(301), email: '', phone: '', location: '' },
      summary: '',
      experience: [],
      education: [],
      skills: [],
      languages: [],
      links: [],
    };
    const processor = createResumeImportProcessor(
      database,
      { get: vi.fn().mockResolvedValue(Buffer.from('document')) },
      { map: vi.fn().mockResolvedValue(invalidCandidate) },
    );

    await expect(
      processor({
        name: RESUME_IMPORT_JOB_NAME,
        data: { importId },
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as Job<unknown>),
    ).rejects.toMatchObject({ code: 'CANONICAL_MAPPING_FAILED' });
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: importId, status: 'PROCESSING' },
      data: {
        status: 'FAILED',
        errorCode: 'CANONICAL_MAPPING_FAILED',
        errorMessage: 'The extracted resume could not be validated.',
      },
    });
  });
});
