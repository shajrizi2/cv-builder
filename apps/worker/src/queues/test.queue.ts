import type { Job, Queue } from 'bullmq';

import { type TestJobData, type TestJobResult } from '../processors/test.processor.js';
import { SYSTEM_TEST_JOB_NAME } from './queue.constants.js';

export function submitSystemTestJob(
  queue: Queue<TestJobData, TestJobResult>,
): Promise<Job<TestJobData, TestJobResult>> {
  return queue.add(SYSTEM_TEST_JOB_NAME, { message: 'worker-ready' });
}
