import type { Job } from 'bullmq';
import type { PrismaClient } from '@cv-builder/database';
import {
  RESUME_IMPORT_JOB_NAME,
  createEmptyResumeContent,
  type AiResumeCandidate,
} from '@cv-builder/resume-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createImportedResumeTitle,
  createManualImportResumeContent,
  createResumeImportProcessor,
} from '../src/processors/resume-import.processor.js';
import { ResumeImportProcessingError } from '../src/imports/import-error.js';
import { extractDocument } from '../src/imports/document-extractor.js';

vi.mock('../src/imports/document-extractor.js', () => ({
  extractDocument: vi.fn().mockResolvedValue('Synthetic resume text'),
}));

const importId = '550e8400-e29b-41d4-a716-446655440000';
const resumeId = '550e8400-e29b-41d4-a716-446655440001';
const ownerId = '550e8400-e29b-41d4-a716-446655440002';
const candidate: AiResumeCandidate = {
  personalInfo: { fullName: 'Synthetic Person', email: '', phone: '', location: '' },
  summary: '',
  experience: [],
  education: [],
  skills: [],
  languages: [],
  links: [],
};

function job(attemptsMade = 0): Job<unknown> {
  return {
    name: RESUME_IMPORT_JOB_NAME,
    data: { importId },
    attemptsMade,
    opts: { attempts: 3 },
  } as Job<unknown>;
}

// The inferred return preserves the deliberately narrow mutable fake state used by each test.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function harness(overrides: Record<string, unknown> = {}) {
  const state = {
    id: importId,
    ownerId,
    originalFilename: ' Synthetic CV.DOCX ',
    mimeType: 'application/pdf',
    fileSize: 20,
    objectKey: 'imports/private-key' as string | null,
    status: 'QUEUED',
    completionMode: null as 'AI_MAPPED' | 'MANUAL_FALLBACK' | null,
    extractedText: null as string | null,
    errorCode: null as string | null,
    errorMessage: null as string | null,
    resumeId: null as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  const created: Array<Record<string, unknown>> = [];
  const resumeImport = {
    findUnique: vi.fn(() => Promise.resolve({ ...state })),
    findUniqueOrThrow: vi.fn(() => Promise.resolve({ ...state })),
    updateMany: vi.fn(({ where, data }: { where: Record<string, unknown>; data: object }) => {
      if (where.ownerId === null && state.ownerId !== null) return Promise.resolve({ count: 0 });
      if (typeof where.status === 'string' && state.status !== where.status)
        return Promise.resolve({ count: 0 });
      Object.assign(state, data);
      return Promise.resolve({ count: 1 });
    }),
    update: vi.fn(({ data }: { data: object }) => {
      Object.assign(state, data);
      return Promise.resolve({ ...state });
    }),
  };
  const transactionResumeImport = {
    findUniqueOrThrow: resumeImport.findUniqueOrThrow,
    update: resumeImport.update,
  };
  const transaction = vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $queryRaw: vi.fn(),
      resumeImport: transactionResumeImport,
      resume: {
        create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return Promise.resolve({ id: resumeId });
        }),
      },
    }),
  );
  const database = {
    resumeImport,
    $transaction: transaction,
  } as unknown as PrismaClient;
  const storage = {
    get: vi.fn().mockResolvedValue(Buffer.from('synthetic document')),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { state, created, database, resumeImport, storage, transaction };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(extractDocument).mockResolvedValue('Synthetic resume text');
});

describe('resume import processor', () => {
  it('returns completed imports idempotently without document or AI access', async () => {
    const h = harness({ status: 'COMPLETED', resumeId, ownerId: null });
    const ai = { available: true, map: vi.fn() };
    await expect(createResumeImportProcessor(h.database, h.storage, ai)(job())).resolves.toEqual({
      resumeId,
    });
    expect(h.storage.get).not.toHaveBeenCalled();
    expect(ai.map).not.toHaveBeenCalled();
  });

  it('rejects ownerless imports before private text, objects, extraction, or AI', async () => {
    const h = harness({ ownerId: null, extractedText: 'private text' });
    const ai = { available: true, map: vi.fn() };
    await expect(
      createResumeImportProcessor(h.database, h.storage, ai)(job()),
    ).rejects.toMatchObject({ code: 'PROCESSING_FAILED' });
    expect(h.state.status).toBe('FAILED');
    expect(h.storage.get).not.toHaveBeenCalled();
    expect(extractDocument).not.toHaveBeenCalled();
    expect(ai.map).not.toHaveBeenCalled();
  });

  it('records AI success, preserves ownership, clears text, and cleans the source', async () => {
    const h = harness();
    const ai = { available: true, map: vi.fn().mockResolvedValue(candidate) };
    await expect(createResumeImportProcessor(h.database, h.storage, ai)(job())).resolves.toEqual({
      resumeId,
    });
    expect(h.state).toMatchObject({
      status: 'COMPLETED',
      completionMode: 'AI_MAPPED',
      extractedText: null,
      objectKey: null,
      resumeId,
    });
    expect(h.created[0]).toMatchObject({ ownerId, title: 'Synthetic CV' });
    expect(ai.map).toHaveBeenCalledWith('Synthetic resume text');
    expect(h.storage.remove).toHaveBeenCalledWith('imports/private-key');
  });

  it('completes with an empty manual draft when AI is unavailable without calling it', async () => {
    const h = harness();
    const ai = { available: false, map: vi.fn() };
    await createResumeImportProcessor(h.database, h.storage, ai)(job());
    expect(ai.map).not.toHaveBeenCalled();
    expect(h.state).toMatchObject({
      status: 'COMPLETED',
      completionMode: 'MANUAL_FALLBACK',
      extractedText: 'Synthetic resume text',
      errorCode: null,
      errorMessage: null,
    });
    expect(h.created[0]?.content).toEqual(createEmptyResumeContent());
  });

  it.each([
    new ResumeImportProcessingError('AI_PROVIDER_ERROR', 'provider unavailable', true),
    new ResumeImportProcessingError('AI_INVALID_RESPONSE', 'invalid response', false),
  ])('uses same-attempt fallback for mapper failure %#', async (failure) => {
    const h = harness();
    const ai = { available: true, map: vi.fn().mockRejectedValue(failure) };
    await expect(createResumeImportProcessor(h.database, h.storage, ai)(job())).resolves.toEqual({
      resumeId,
    });
    expect(h.state.completionMode).toBe('MANUAL_FALLBACK');
  });

  it('does not convert an unexpected mapper error into a successful fallback', async () => {
    const h = harness();
    const failure = new Error('unexpected mapper failure');
    const ai = { available: true, map: vi.fn().mockRejectedValue(failure) };

    await expect(createResumeImportProcessor(h.database, h.storage, ai)(job())).rejects.toBe(
      failure,
    );
    expect(h.state).toMatchObject({ status: 'PROCESSING', completionMode: null, resumeId: null });
    expect(h.created).toHaveLength(0);

    await expect(createResumeImportProcessor(h.database, h.storage, ai)(job(2))).rejects.toBe(
      failure,
    );
    expect(h.state).toMatchObject({
      status: 'FAILED',
      completionMode: null,
      resumeId: null,
      errorCode: 'PROCESSING_FAILED',
    });
    expect(h.created).toHaveLength(0);
  });

  it('falls back when the AI candidate cannot become canonical content', async () => {
    const h = harness();
    const invalid = {
      ...candidate,
      personalInfo: { ...candidate.personalInfo, fullName: 'x'.repeat(301) },
    };
    await createResumeImportProcessor(h.database, h.storage, {
      available: true,
      map: vi.fn().mockResolvedValue(invalid),
    })(job());
    expect(h.state.completionMode).toBe('MANUAL_FALLBACK');
    expect(h.created[0]?.content).toEqual(createEmptyResumeContent());
  });

  it('reuses persisted bounded text without downloading or extracting again', async () => {
    const h = harness({ extractedText: 'Already extracted' });
    const ai = { available: false, map: vi.fn() };
    await createResumeImportProcessor(h.database, h.storage, ai)(job());
    expect(h.storage.get).not.toHaveBeenCalled();
    expect(extractDocument).not.toHaveBeenCalled();
    expect(h.state.extractedText).toBe('Already extracted');
  });

  it('does not discard a durable extraction when best-effort source cleanup fails', async () => {
    const h = harness();
    h.storage.remove.mockRejectedValue(new Error('storage unavailable'));
    await expect(
      createResumeImportProcessor(h.database, h.storage, {
        available: false,
        map: vi.fn(),
      })(job()),
    ).resolves.toEqual({ resumeId });
    expect(h.state).toMatchObject({
      status: 'COMPLETED',
      completionMode: 'MANUAL_FALLBACK',
      extractedText: 'Synthetic resume text',
      objectKey: 'imports/private-key',
    });
  });

  it('retries safe cleanup for an owned completed import without changing its mode', async () => {
    const h = harness({
      status: 'COMPLETED',
      resumeId,
      completionMode: 'MANUAL_FALLBACK',
      extractedText: 'Synthetic resume text',
    });
    await createResumeImportProcessor(h.database, h.storage, {
      available: true,
      map: vi.fn(),
    })(job());
    expect(h.storage.remove).toHaveBeenCalledWith('imports/private-key');
    expect(h.state).toMatchObject({ completionMode: 'MANUAL_FALLBACK', objectKey: null });
    expect(h.created).toHaveLength(0);
  });

  it('keeps extraction failures as failures and creates no resume', async () => {
    vi.mocked(extractDocument).mockRejectedValue(
      new ResumeImportProcessingError('NO_SELECTABLE_TEXT', 'No selectable text was found.', false),
    );
    const h = harness();
    await expect(
      createResumeImportProcessor(h.database, h.storage, { available: false, map: vi.fn() })(job()),
    ).rejects.toMatchObject({ code: 'NO_SELECTABLE_TEXT' });
    expect(h.state.status).toBe('FAILED');
    expect(h.created).toHaveLength(0);
    expect(h.storage.remove).not.toHaveBeenCalled();
  });

  it('does not convert source download failures into fallback completion', async () => {
    const h = harness();
    const failure = new Error('object store unavailable');
    h.storage.get.mockRejectedValue(failure);
    await expect(
      createResumeImportProcessor(h.database, h.storage, {
        available: false,
        map: vi.fn(),
      })(job(2)),
    ).rejects.toBe(failure);
    expect(h.state).toMatchObject({
      status: 'FAILED',
      completionMode: null,
      resumeId: null,
      errorCode: 'PROCESSING_FAILED',
    });
    expect(h.created).toHaveLength(0);
  });

  it('does not convert transaction failures into fallback completion', async () => {
    const h = harness({ extractedText: 'Already extracted', objectKey: null });
    const failure = new Error('database unavailable');
    h.transaction.mockRejectedValue(failure);
    await expect(
      createResumeImportProcessor(h.database, h.storage, {
        available: false,
        map: vi.fn(),
      })(job(2)),
    ).rejects.toBe(failure);
    expect(h.state).toMatchObject({
      status: 'FAILED',
      completionMode: null,
      resumeId: null,
      errorCode: 'PROCESSING_FAILED',
    });
    expect(h.created).toHaveLength(0);
  });
});

describe('manual import helpers', () => {
  it('creates validated empty content without fabricated facts', () => {
    expect(createManualImportResumeContent()).toEqual(createEmptyResumeContent());
  });

  it('strips supported extensions and safely bounds imported titles', () => {
    expect(createImportedResumeTitle(' CV.pdf ')).toBe('CV');
    expect(createImportedResumeTitle('.docx')).toBe('Imported resume');
    expect(createImportedResumeTitle(`${'x'.repeat(250)}.pdf`)).toHaveLength(200);
  });
});
