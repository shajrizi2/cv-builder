import type { WorkerConfiguration } from './config/configuration.js';
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
      await Promise.all([resources.queue.waitUntilReady(), resources.worker.waitUntilReady()]);
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

    let workerFailure: unknown;

    try {
      if (!forceImmediately) {
        await resources.worker.pause(true);
        const gracefulClose = resources.worker.close();
        const completed = await this.waitForGracefulClose(gracefulClose);

        if (!completed) {
          this.logger.error('worker.shutdown-timeout', {
            queueName: SYSTEM_TEST_QUEUE_NAME,
          });
          await resources.worker.close(true);
        }
      } else {
        await resources.worker.close(true);
      }
    } catch (error) {
      workerFailure = error;

      try {
        await resources.worker.close(true);
      } catch {
        // The original worker cleanup error is retained and reported after all other cleanup.
      }
    }

    const results = await Promise.allSettled([
      resources.queue.close(),
      resources.queueConnection.quit(),
      resources.workerConnection.quit(),
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
