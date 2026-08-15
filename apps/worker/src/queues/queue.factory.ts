import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { RESUME_EXPORT_QUEUE_NAME, RESUME_IMPORT_QUEUE_NAME } from '@cv-builder/resume-schema';

import type { WorkerConfiguration } from '../config/configuration.js';
import type { Logger } from '../logging/logger.js';
import {
  processTestJob,
  type TestJobData,
  type TestJobResult,
} from '../processors/test.processor.js';
import { SYSTEM_TEST_QUEUE_NAME } from './queue.constants.js';
import { createDatabaseClient } from '@cv-builder/database';
import { Client } from 'minio';
import { OpenAiResumeMapper } from '../ai/openai-resume-mapper.js';
import { createResumeImportProcessor } from '../processors/resume-import.processor.js';
import { UnavailableResumeMapper } from '../ai/unavailable-resume-mapper.js';
import { ChromiumPdfRenderer } from '../exports/pdf-renderer.js';
import { createResumeExportProcessor } from '../processors/resume-export.processor.js';

export interface WorkerResources {
  readonly queue: Queue<TestJobData, TestJobResult>;
  readonly queueConnection: Redis;
  readonly worker: Worker<TestJobData, TestJobResult>;
  readonly workerConnection: Redis;
  readonly importWorker?: Worker;
  readonly importWorkerConnection?: Redis;
  readonly exportWorker?: Worker;
  readonly exportWorkerConnection?: Redis;
  readonly disconnectDatabase?: () => Promise<void>;
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

  if (!config.databaseUrl || !config.storage)
    return { queue, queueConnection, worker, workerConnection };
  const database = createDatabaseClient({ databaseUrl: config.databaseUrl });
  const minio = new Client(config.storage);
  const importWorkerConnection = new Redis({
    ...config.redisConnection,
    maxRetriesPerRequest: null,
  });
  const mapper = config.openai
    ? new OpenAiResumeMapper(config.openai.model, config.openai.apiKey, config.openai.timeoutMs)
    : new UnavailableResumeMapper();
  const importWorker = new Worker(
    RESUME_IMPORT_QUEUE_NAME,
    createResumeImportProcessor(
      database,
      {
        async get(key: string): Promise<Buffer> {
          const stream = await minio.getObject(config.storage!.bucket, key);
          const chunks: Buffer[] = [];
          for await (const chunk of stream)
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
          return Buffer.concat(chunks);
        },
        async remove(key: string): Promise<void> {
          await minio.removeObject(config.storage!.bucket, key);
        },
      },
      mapper,
      logger,
    ),
    {
      connection: importWorkerConnection,
      concurrency: config.concurrency,
      name: config.workerName,
    },
  );
  const exportWorkerConnection = config.chromiumExecutablePath
    ? new Redis({ ...config.redisConnection, maxRetriesPerRequest: null })
    : undefined;
  const exportWorker =
    config.chromiumExecutablePath && exportWorkerConnection
      ? new Worker(
          RESUME_EXPORT_QUEUE_NAME,
          createResumeExportProcessor(
            database,
            {
              async put(key: string, bytes: Buffer): Promise<void> {
                await minio.putObject(config.storage!.bucket, key, bytes, bytes.length, {
                  'Content-Type': 'application/pdf',
                });
              },
              async remove(key: string): Promise<void> {
                await minio.removeObject(config.storage!.bucket, key);
              },
            },
            new ChromiumPdfRenderer(config.chromiumExecutablePath),
          ),
          {
            connection: exportWorkerConnection,
            concurrency: config.concurrency,
            name: config.workerName,
          },
        )
      : undefined;
  return {
    queue,
    queueConnection,
    worker,
    workerConnection,
    importWorker,
    importWorkerConnection,
    ...(exportWorker ? { exportWorker } : {}),
    ...(exportWorkerConnection ? { exportWorkerConnection } : {}),
    disconnectDatabase: () => database.$disconnect(),
  };
}
