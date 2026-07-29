import { randomUUID } from 'node:crypto';

import { Queue, QueueEvents, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';

import { configuration } from '../src/config/configuration.js';
import {
  processTestJob,
  type TestJobData,
  type TestJobResult,
} from '../src/processors/test.processor.js';
import { SYSTEM_TEST_QUEUE_NAME } from '../src/queues/queue.constants.js';

const integrationEnabled = process.env.RUN_WORKER_INTEGRATION_TESTS === 'true';

async function removeIntegrationQueueKeys(connection: Redis, queueName: string): Promise<void> {
  let cursor = '0';

  do {
    const [nextCursor, keys] = await connection.scan(
      cursor,
      'MATCH',
      `bull:${queueName}:*`,
      'COUNT',
      100,
    );
    cursor = nextCursor;

    if (keys.length > 0) {
      await connection.unlink(...keys);
    }
  } while (cursor !== '0');
}

describe.skipIf(!integrationEnabled)('BullMQ worker integration', () => {
  it('processes the deterministic system-test job through Redis or Valkey', async () => {
    const config = configuration(process.env);
    const availabilityConnection = new Redis({
      ...config.redisConnection,
      connectTimeout: 1_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    availabilityConnection.on('error', () => undefined);

    try {
      await availabilityConnection.connect();
      await availabilityConnection.ping();
    } finally {
      if (availabilityConnection.status === 'ready') {
        await availabilityConnection.quit();
      } else {
        availabilityConnection.disconnect();
      }
    }

    const queueName = `${SYSTEM_TEST_QUEUE_NAME}-integration-${randomUUID()}`;
    const queueConnection = new Redis({ ...config.redisConnection, maxRetriesPerRequest: 1 });
    const workerConnection = new Redis({ ...config.redisConnection, maxRetriesPerRequest: null });
    const eventsConnection = new Redis({
      ...config.redisConnection,
      maxRetriesPerRequest: null,
    });
    const queue = new Queue<TestJobData, TestJobResult>(queueName, {
      connection: queueConnection,
    });
    const queueEvents = new QueueEvents(queueName, { connection: eventsConnection });
    const worker = new Worker<TestJobData, TestJobResult>(queueName, (job) => processTestJob(job), {
      connection: workerConnection,
      concurrency: 1,
    });

    try {
      await Promise.all([
        queue.waitUntilReady(),
        queueEvents.waitUntilReady(),
        worker.waitUntilReady(),
      ]);
      const payload = Object.freeze({ message: 'worker-ready' } as const);
      const job = await queue.add('verify-worker', payload);

      await expect(job.waitUntilFinished(queueEvents, 10_000)).resolves.toEqual({
        processed: true,
        message: 'worker-ready',
      });
      expect(payload).toEqual({ message: 'worker-ready' });
    } finally {
      await worker.close(true);
      await queueEvents.close();
      await queue.drain(true);
      await queue.obliterate({ force: true });
      await queue.close();
      await removeIntegrationQueueKeys(queueConnection, queueName);
      await Promise.all([queueConnection.quit(), workerConnection.quit(), eventsConnection.quit()]);
    }
  });
});
