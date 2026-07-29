import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';

import type { WorkerConfiguration } from '../config/configuration.js';
import type { Logger } from '../logging/logger.js';
import {
  processTestJob,
  type TestJobData,
  type TestJobResult,
} from '../processors/test.processor.js';
import { SYSTEM_TEST_QUEUE_NAME } from './queue.constants.js';

export interface WorkerResources {
  readonly queue: Queue<TestJobData, TestJobResult>;
  readonly queueConnection: Redis;
  readonly worker: Worker<TestJobData, TestJobResult>;
  readonly workerConnection: Redis;
}

export function createWorkerResources(
  config: WorkerConfiguration,
  logger: Logger,
): WorkerResources {
  const queueConnection = new Redis({
    ...config.redisConnection,
    maxRetriesPerRequest: 1,
  });
  const workerConnection = new Redis({
    ...config.redisConnection,
    maxRetriesPerRequest: null,
  });
  const queue = new Queue<TestJobData, TestJobResult>(SYSTEM_TEST_QUEUE_NAME, {
    connection: queueConnection,
  });
  const worker = new Worker<TestJobData, TestJobResult>(
    SYSTEM_TEST_QUEUE_NAME,
    (job) => processTestJob(job),
    {
      connection: workerConnection,
      concurrency: config.concurrency,
      name: config.workerName,
    },
  );

  worker.on('completed', (job) => {
    logger.info('job.completed', {
      queueName: SYSTEM_TEST_QUEUE_NAME,
      jobId: job.id,
    });
  });
  worker.on('failed', (job, error) => {
    logger.error('job.failed', {
      queueName: SYSTEM_TEST_QUEUE_NAME,
      ...(job?.id === undefined ? {} : { jobId: job.id }),
      error,
    });
  });
  worker.on('error', (error) => {
    logger.error('worker.error', {
      queueName: SYSTEM_TEST_QUEUE_NAME,
      error,
    });
  });

  return { queue, queueConnection, worker, workerConnection };
}
