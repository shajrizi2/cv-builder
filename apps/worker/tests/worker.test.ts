import type { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import type { WorkerConfiguration } from '../src/config/configuration.js';
import type { Logger } from '../src/logging/logger.js';
import type { TestJobData, TestJobResult } from '../src/processors/test.processor.js';
import type { WorkerResources } from '../src/queues/queue.factory.js';
import { WorkerApplication } from '../src/worker.js';

const config: WorkerConfiguration = {
  nodeEnv: 'test',
  redis: {
    host: '127.0.0.1',
    port: 6379,
    tls: false,
    database: 0,
  },
  redisConnection: {
    host: '127.0.0.1',
    port: 6379,
    db: 0,
  },
  concurrency: 1,
  workerName: 'test-worker',
  shutdownTimeoutMs: 100,
};

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createHarness(): {
  application: WorkerApplication;
  logger: Logger;
  queue: {
    waitUntilReady: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  worker: {
    waitUntilReady: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  importWorker: {
    waitUntilReady: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  exportWorker: {
    waitUntilReady: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  queueConnection: { quit: ReturnType<typeof vi.fn> };
  workerConnection: { quit: ReturnType<typeof vi.fn> };
  importWorkerConnection: { quit: ReturnType<typeof vi.fn> };
  exportWorkerConnection: { quit: ReturnType<typeof vi.fn> };
  disconnectDatabase: ReturnType<typeof vi.fn>;
} {
  const queue = {
    waitUntilReady: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const worker = {
    waitUntilReady: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const importWorker = {
    waitUntilReady: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const exportWorker = {
    waitUntilReady: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const queueConnection = { quit: vi.fn().mockResolvedValue('OK') };
  const workerConnection = { quit: vi.fn().mockResolvedValue('OK') };
  const importWorkerConnection = { quit: vi.fn().mockResolvedValue('OK') };
  const exportWorkerConnection = { quit: vi.fn().mockResolvedValue('OK') };
  const disconnectDatabase = vi.fn().mockResolvedValue(undefined);
  const resources = {
    queue: queue as unknown as Queue<TestJobData, TestJobResult>,
    worker: worker as unknown as Worker<TestJobData, TestJobResult>,
    importWorker: importWorker as unknown as Worker,
    exportWorker: exportWorker as unknown as Worker,
    queueConnection: queueConnection as unknown as Redis,
    workerConnection: workerConnection as unknown as Redis,
    importWorkerConnection: importWorkerConnection as unknown as Redis,
    exportWorkerConnection: exportWorkerConnection as unknown as Redis,
    disconnectDatabase,
  } satisfies WorkerResources;
  const logger: Logger = {
    info: vi.fn(),
    error: vi.fn(),
  };
  const application = new WorkerApplication(config, logger, () => resources);

  return {
    application,
    logger,
    queue,
    worker,
    importWorker,
    exportWorker,
    queueConnection,
    workerConnection,
    importWorkerConnection,
    exportWorkerConnection,
    disconnectDatabase,
  };
}

describe('WorkerApplication', () => {
  it('reports ready only after every created BullMQ resource connects', async () => {
    const { application, queue, worker, importWorker, exportWorker } = createHarness();
    const queueReady = deferred<void>();
    const workerReady = deferred<void>();
    const importWorkerReady = deferred<void>();
    const exportWorkerReady = deferred<void>();
    queue.waitUntilReady.mockReturnValue(queueReady.promise);
    worker.waitUntilReady.mockReturnValue(workerReady.promise);
    importWorker.waitUntilReady.mockReturnValue(importWorkerReady.promise);
    exportWorker.waitUntilReady.mockReturnValue(exportWorkerReady.promise);

    const starting = application.start();
    expect(application.health.getSnapshot().status).toBe('starting');
    queueReady.resolve(undefined);
    await Promise.resolve();
    expect(application.health.getSnapshot().status).toBe('starting');
    workerReady.resolve(undefined);
    await Promise.resolve();
    expect(application.health.getSnapshot().status).toBe('starting');
    importWorkerReady.resolve(undefined);
    await Promise.resolve();
    expect(application.health.getSnapshot().status).toBe('starting');
    exportWorkerReady.resolve(undefined);
    await starting;

    expect(application.health.getSnapshot().status).toBe('ready');
  });

  it('reuses one shutdown promise and closes every resource', async () => {
    const {
      application,
      queue,
      worker,
      importWorker,
      exportWorker,
      queueConnection,
      workerConnection,
      importWorkerConnection,
      exportWorkerConnection,
      disconnectDatabase,
    } = createHarness();
    await application.start();

    const firstShutdown = application.shutdown();
    const secondShutdown = application.shutdown();

    expect(secondShutdown).toBe(firstShutdown);
    await firstShutdown;
    expect(worker.pause).toHaveBeenCalledWith(true);
    expect(worker.close).toHaveBeenCalledWith();
    expect(importWorker.pause).toHaveBeenCalledWith(true);
    expect(importWorker.close).toHaveBeenCalledWith();
    expect(exportWorker.pause).toHaveBeenCalledWith(true);
    expect(exportWorker.close).toHaveBeenCalledWith();
    expect(queue.close).toHaveBeenCalledOnce();
    expect(queueConnection.quit).toHaveBeenCalledOnce();
    expect(workerConnection.quit).toHaveBeenCalledOnce();
    expect(importWorkerConnection.quit).toHaveBeenCalledOnce();
    expect(exportWorkerConnection.quit).toHaveBeenCalledOnce();
    expect(disconnectDatabase).toHaveBeenCalledOnce();
    expect(application.health.getSnapshot().status).toBe('stopped');
  });

  it('marks startup failures and force-cleans created resources', async () => {
    const { application, worker } = createHarness();
    worker.waitUntilReady.mockRejectedValue(new Error('Redis unavailable'));

    await expect(application.start()).rejects.toThrow('Redis unavailable');
    expect(worker.close).toHaveBeenCalledWith(true);
    expect(application.health.getSnapshot().status).toBe('failed');
  });

  it('forces worker cleanup only after the graceful shutdown timeout', async () => {
    vi.useFakeTimers();
    const { application, worker } = createHarness();
    worker.close
      .mockReturnValueOnce(new Promise<void>(() => undefined))
      .mockResolvedValueOnce(undefined);
    await application.start();

    const shutdown = application.shutdown();
    await vi.advanceTimersByTimeAsync(config.shutdownTimeoutMs);
    await shutdown;

    expect(worker.close).toHaveBeenNthCalledWith(1);
    expect(worker.close).toHaveBeenNthCalledWith(2, true);
    vi.useRealTimers();
  });

  it('force-closes an import worker that exceeds the graceful timeout', async () => {
    vi.useFakeTimers();
    const { application, worker, importWorker } = createHarness();
    importWorker.close
      .mockReturnValueOnce(new Promise<void>(() => undefined))
      .mockResolvedValueOnce(undefined);
    await application.start();

    const shutdown = application.shutdown();
    await vi.advanceTimersByTimeAsync(config.shutdownTimeoutMs);
    await shutdown;

    expect(worker.close).toHaveBeenCalledWith();
    expect(importWorker.close).toHaveBeenNthCalledWith(1);
    expect(importWorker.close).toHaveBeenNthCalledWith(2, true);
    vi.useRealTimers();
  });

  it('force-closes a PDF export worker that exceeds the graceful timeout', async () => {
    vi.useFakeTimers();
    const { application, exportWorker } = createHarness();
    exportWorker.close
      .mockReturnValueOnce(new Promise<void>(() => undefined))
      .mockResolvedValueOnce(undefined);
    await application.start();
    const shutdown = application.shutdown();
    await vi.advanceTimersByTimeAsync(config.shutdownTimeoutMs);
    await shutdown;
    expect(exportWorker.close).toHaveBeenNthCalledWith(1);
    expect(exportWorker.close).toHaveBeenNthCalledWith(2, true);
    vi.useRealTimers();
  });

  it('force-closes both workers and all resources after import cleanup failure', async () => {
    const {
      application,
      worker,
      importWorker,
      queue,
      queueConnection,
      workerConnection,
      importWorkerConnection,
      disconnectDatabase,
    } = createHarness();
    importWorker.pause.mockRejectedValue(new Error('import pause failed'));
    await application.start();

    await expect(application.shutdown()).rejects.toThrow('import pause failed');
    expect(worker.close).toHaveBeenCalledWith(true);
    expect(importWorker.close).toHaveBeenCalledWith(true);
    expect(queue.close).toHaveBeenCalledOnce();
    expect(queueConnection.quit).toHaveBeenCalledOnce();
    expect(workerConnection.quit).toHaveBeenCalledOnce();
    expect(importWorkerConnection.quit).toHaveBeenCalledOnce();
    expect(disconnectDatabase).toHaveBeenCalledOnce();
  });

  it('closes queue connections even when worker cleanup fails', async () => {
    const { application, worker, queue, queueConnection, workerConnection } = createHarness();
    worker.pause.mockRejectedValue(new Error('pause failed'));
    worker.close.mockRejectedValue(new Error('close failed'));
    await application.start();

    await expect(application.shutdown()).rejects.toThrow('pause failed');
    expect(queue.close).toHaveBeenCalledOnce();
    expect(queueConnection.quit).toHaveBeenCalledOnce();
    expect(workerConnection.quit).toHaveBeenCalledOnce();
    expect(application.health.getSnapshot().status).toBe('failed');
  });
});
