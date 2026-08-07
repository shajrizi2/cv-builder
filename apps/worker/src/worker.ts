import type { WorkerConfiguration } from './config/configuration.js';
import { RESUME_IMPORT_QUEUE_NAME } from '@cv-builder/resume-schema';
import { WorkerHealth } from './health/worker-health.js';
import type { Logger } from './logging/logger.js';
import { createWorkerResources, type WorkerResources } from './queues/queue.factory.js';
import { SYSTEM_TEST_QUEUE_NAME } from './queues/queue.constants.js';

export type WorkerResourcesFactory = (
  config: WorkerConfiguration,
  logger: Logger,
) => WorkerResources;

export class WorkerApplication {
  readonly health = new WorkerHealth();

  private resources?: WorkerResources;
  private shutdownPromise?: Promise<void>;

  constructor(
    private readonly config: WorkerConfiguration,
    private readonly logger: Logger,
    private readonly resourcesFactory: WorkerResourcesFactory = createWorkerResources,
  ) {}

  async start(): Promise<void> {
    this.logger.info('worker.starting', { queueName: SYSTEM_TEST_QUEUE_NAME });

    try {
      const resources = this.resourcesFactory(this.config, this.logger);
      this.resources = resources;
      await Promise.all([
        resources.queue.waitUntilReady(),
        resources.worker.waitUntilReady(),
        ...(resources.importWorker ? [resources.importWorker.waitUntilReady()] : []),
      ]);
      this.health.markReady();
      this.logger.info('worker.ready', { queueName: SYSTEM_TEST_QUEUE_NAME });
    } catch (error) {
      this.health.markFailed();
      this.logger.error('worker.startup-failed', {
        queueName: SYSTEM_TEST_QUEUE_NAME,
        error,
      });

      try {
        await this.closeResources(true);
      } catch (cleanupError) {
        this.logger.error('worker.startup-cleanup-failed', {
          queueName: SYSTEM_TEST_QUEUE_NAME,
          error: cleanupError,
        });
      }

      throw error;
    }
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise !== undefined) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    this.health.markShuttingDown();
    this.logger.info('worker.shutdown-started', { queueName: SYSTEM_TEST_QUEUE_NAME });

    try {
      await this.closeResources(false);
      this.health.markStopped();
      this.logger.info('worker.shutdown-completed', { queueName: SYSTEM_TEST_QUEUE_NAME });
    } catch (error) {
      this.health.markFailed();
      this.logger.error('worker.shutdown-failed', {
        queueName: SYSTEM_TEST_QUEUE_NAME,
        error,
      });
      throw error;
    }
  }

  private async closeResources(forceImmediately: boolean): Promise<void> {
    const resources = this.resources;
    if (resources === undefined) {
      return;
    }

    const workers = [resources.worker, ...(resources.importWorker ? [resources.importWorker] : [])];
    let workerFailure: unknown;

    if (forceImmediately) {
      const forced = await Promise.allSettled(workers.map((worker) => worker.close(true)));
      workerFailure = forced.find((result) => result.status === 'rejected')?.reason;
    } else {
      const pauses = await Promise.allSettled(workers.map((worker) => worker.pause(true)));
      workerFailure = pauses.find((result) => result.status === 'rejected')?.reason;

      if (workerFailure === undefined) {
        const closes = await Promise.all(
          workers.map(async (worker, index): Promise<unknown> => {
            try {
              const completed = await this.waitForGracefulClose(worker.close());
              if (!completed) {
                this.logger.error('worker.shutdown-timeout', {
                  queueName: index === 0 ? SYSTEM_TEST_QUEUE_NAME : RESUME_IMPORT_QUEUE_NAME,
                });
                await worker.close(true);
              }
              return undefined;
            } catch (error) {
              return error;
            }
          }),
        );
        workerFailure = closes.find((error) => error !== undefined);
      }

      if (workerFailure !== undefined) {
        await Promise.allSettled(workers.map((worker) => worker.close(true)));
      }
    }

    const results = await Promise.allSettled([
      resources.queue.close(),
      resources.queueConnection.quit(),
      resources.workerConnection.quit(),
      ...(resources.importWorkerConnection ? [resources.importWorkerConnection.quit()] : []),
      ...(resources.disconnectDatabase ? [resources.disconnectDatabase()] : []),
    ]);
    this.resources = undefined;

    if (workerFailure !== undefined) {
      throw workerFailure instanceof Error
        ? workerFailure
        : new Error('Worker cleanup failed with an unknown error');
    }

    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure !== undefined) {
      throw failure.reason;
    }
  }

  private async waitForGracefulClose(closePromise: Promise<void>): Promise<boolean> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<false>((resolve) => {
      timeout = setTimeout(() => resolve(false), this.config.shutdownTimeoutMs);
    });

    const completed = await Promise.race([closePromise.then(() => true), timeoutPromise]);
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    return completed;
  }
}
