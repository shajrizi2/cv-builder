import type { Job } from 'bullmq';
import type { PrismaClient } from '@cv-builder/database';
import { createEmptyResumeContent, RESUME_EXPORT_JOB_NAME } from '@cv-builder/resume-schema';
import { describe, expect, it, vi } from 'vitest';
import { createResumeExportProcessor } from '../src/processors/resume-export.processor.js';

const exportId = '550e8400-e29b-41d4-a716-446655440020';
const resumeId = '550e8400-e29b-41d4-a716-446655440021';
const base = {
  id: exportId,
  resumeId,
  resumeTitle: 'Synthetic resume',
  resumeContent: createEmptyResumeContent(),
  template: 'classic',
  processingToken: null as string | null,
  objectKey: null as string | null,
  fileSize: null as number | null,
  errorCode: null as string | null,
  errorMessage: null as string | null,
  status: 'QUEUED',
};
const job = (attempts = 1): Job<unknown> =>
  ({
    name: RESUME_EXPORT_JOB_NAME,
    data: { exportId },
    attemptsMade: 0,
    opts: { attempts },
  }) as Job<unknown>;

function createDatabase(initial = base): {
  database: PrismaClient;
  state: typeof base;
} {
  const state = { ...initial };
  const updateMany = vi.fn(
    ({
      where,
      data,
    }: {
      where: { status?: string | { in?: string[] }; processingToken?: string };
      data: Partial<typeof state>;
    }) => {
      const statusMatches =
        typeof where.status === 'string'
          ? state.status === where.status
          : where.status?.in?.includes(state.status) !== false;
      const tokenMatches =
        where.processingToken === undefined || state.processingToken === where.processingToken;
      if (!statusMatches || !tokenMatches) return Promise.resolve({ count: 0 });
      Object.assign(state, data);
      return Promise.resolve({ count: 1 });
    },
  );
  const database = {
    resumeExport: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve({ ...state })),
      updateMany,
    },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: vi.fn(),
        resumeExport: {
          findUniqueOrThrow: vi.fn().mockImplementation(() => Promise.resolve({ ...state })),
          update: vi.fn().mockImplementation(({ data }: { data: Partial<typeof state> }) => {
            Object.assign(state, data);
            return Promise.resolve({ ...state });
          }),
        },
      }),
  } as unknown as PrismaClient;
  return { database, state };
}

describe('resume export processor', () => {
  it('stores the PDF under its owned attempt key and completes atomically', async () => {
    const { database, state } = createDatabase();
    const storage = { put: vi.fn().mockResolvedValue(undefined), remove: vi.fn() };
    const processor = createResumeExportProcessor(database, storage, {
      render: vi.fn().mockResolvedValue(Buffer.from('%PDF-synthetic')),
    });

    await expect(processor(job())).resolves.toEqual({ exportId });
    const key = storage.put.mock.calls[0]?.[0] as string;
    expect(key).toMatch(new RegExp(`^exports/${exportId}/[0-9a-f-]+\\.pdf$`));
    expect(state).toMatchObject({ status: 'COMPLETED', processingToken: null, objectKey: key });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('keeps the winning object and removes only the superseded uploaded object', async () => {
    const { database, state } = createDatabase();
    let releaseFirstPut!: () => void;
    let firstKey = '';
    let secondKey = '';
    const firstPutBlocked = new Promise<void>((resolve) => {
      releaseFirstPut = resolve;
    });
    const storage = {
      put: vi.fn().mockImplementation(async (key: string) => {
        if (!firstKey) {
          firstKey = key;
          await firstPutBlocked;
        } else {
          secondKey = key;
          releaseFirstPut();
        }
      }),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const processor = createResumeExportProcessor(database, storage, {
      render: vi.fn().mockResolvedValue(Buffer.from('%PDF-concurrent')),
    });

    const first = processor(job());
    await vi.waitFor(() => expect(firstKey).not.toBe(''));
    const second = processor(job());
    await expect(second).resolves.toEqual({ exportId });
    await expect(first).resolves.toEqual({ exportId });

    expect(firstKey).not.toBe(secondKey);
    expect(state).toMatchObject({ status: 'COMPLETED', objectKey: secondKey });
    expect(storage.remove).toHaveBeenCalledWith(firstKey);
    expect(storage.remove).not.toHaveBeenCalledWith(secondKey);
  });

  it('does not let a superseded delivery persist a final failure', async () => {
    const { database, state } = createDatabase();
    let rejectFirst!: (error: Error) => void;
    const lateFailure = new Promise<Buffer>((_, reject) => {
      rejectFirst = reject;
    });
    const renderer = {
      render: vi
        .fn()
        .mockReturnValueOnce(lateFailure)
        .mockResolvedValueOnce(Buffer.from('%PDF-winner')),
    };
    const storage = { put: vi.fn().mockResolvedValue(undefined), remove: vi.fn() };
    const processor = createResumeExportProcessor(database, storage, renderer);

    const first = processor(job());
    await vi.waitFor(() => expect(renderer.render).toHaveBeenCalledTimes(1));
    await expect(processor(job())).resolves.toEqual({ exportId });
    rejectFirst(new Error('late private renderer failure'));
    await expect(first).rejects.toMatchObject({ code: 'PDF_RENDER_FAILED' });

    expect(state.status).toBe('COMPLETED');
    expect(state.objectKey).toBe(storage.put.mock.calls[0]?.[0]);
  });

  it('allows only one duplicate completion and cleans the losing temporary object', async () => {
    const { database, state } = createDatabase();
    let releaseFirst!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const keys: string[] = [];
    const storage = {
      put: vi.fn().mockImplementation(async (key: string) => {
        keys.push(key);
        if (keys.length === 1) await blocked;
        else releaseFirst();
      }),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const processor = createResumeExportProcessor(database, storage, {
      render: vi.fn().mockResolvedValue(Buffer.from('%PDF-ok')),
    });

    const deliveries = [processor(job()), processor(job())];
    await expect(Promise.all(deliveries)).resolves.toEqual([{ exportId }, { exportId }]);
    expect(new Set(keys).size).toBe(2);
    expect(state.status).toBe('COMPLETED');
    expect(keys).toContain(state.objectKey as string);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).not.toHaveBeenCalledWith(state.objectKey);
  });

  it('classifies invalid snapshots as permanent safe failures owned by the delivery', async () => {
    const { database, state } = createDatabase({ ...base, template: 'injected' });
    const processor = createResumeExportProcessor(
      database,
      { put: vi.fn(), remove: vi.fn() },
      { render: vi.fn() },
    );
    await expect(processor(job())).rejects.toMatchObject({
      code: 'INVALID_RESUME_SNAPSHOT',
      retryable: false,
    });
    expect(state).toMatchObject({
      status: 'FAILED',
      processingToken: null,
      errorCode: 'INVALID_RESUME_SNAPSHOT',
    });
  });
});
