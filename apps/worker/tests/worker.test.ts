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
  queueConnection: { quit: ReturnType<typeof vi.fn> };
  workerConnection: { quit: ReturnType<typeof vi.fn> };
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
  const queueConnection = { quit: vi.fn().mockResolvedValue('OK') };
  const workerConnection = { quit: vi.fn().mockResolvedValue('OK') };
  const resources = {
    queue: queue as unknown as Queue<TestJobData, TestJobResult>,
    worker: worker as unknown as Worker<TestJobData, TestJobResult>,
    queueConnection: queueConnection as unknown as Redis,
    workerConnection: workerConnection as unknown as Redis,
  } satisfies WorkerResources;
  const logger: Logger = {
    info: vi.fn(),
    error: vi.fn(),
  };
  const application = new WorkerApplication(config, logger, () => resources);

  return { application, logger, queue, worker, queueConnection, workerConnection };
}

describe('WorkerApplication', () => {
  it('reports ready only after both BullMQ resources connect', async () => {
    const { application, queue, worker } = createHarness();
    const queueReady = deferred<void>();
    const workerReady = deferred<void>();
    queue.waitUntilReady.mockReturnValue(queueReady.promise);
    worker.waitUntilReady.mockReturnValue(workerReady.promise);

    const starting = application.start();
    expect(application.health.getSnapshot().status).toBe('starting');
    queueReady.resolve(undefined);
    await Promise.resolve();
    expect(application.health.getSnapshot().status).toBe('starting');
    workerReady.resolve(undefined);
    await starting;

    expect(application.health.getSnapshot().status).toBe('ready');
  });

  it('reuses one shutdown promise and closes every resource', async () => {
    const { application, queue, worker, queueConnection, workerConnection } = createHarness();
    await application.start();

    const firstShutdown = application.shutdown();
    const secondShutdown = application.shutdown();

    expect(secondShutdown).toBe(firstShutdown);
    await firstShutdown;
    expect(worker.pause).toHaveBeenCalledWith(true);
    expect(worker.close).toHaveBeenCalledWith();
    expect(queue.close).toHaveBeenCalledOnce();
    expect(queueConnection.quit).toHaveBeenCalledOnce();
    expect(workerConnection.quit).toHaveBeenCalledOnce();
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
