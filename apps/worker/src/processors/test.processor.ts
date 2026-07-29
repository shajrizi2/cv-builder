import type { Job } from 'bullmq';
import { z } from 'zod';

const testJobDataSchema = z
  .object({
    message: z.literal('worker-ready'),
  })
  .strict();

export type TestJobData = z.infer<typeof testJobDataSchema>;

export interface TestJobResult {
  readonly processed: true;
  readonly message: 'worker-ready';
}

export function processTestJob(job: Job<unknown>): Promise<TestJobResult> {
  return Promise.resolve(job.data).then((data) => {
    const result = testJobDataSchema.safeParse(data);

    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`)
        .join('; ');
      throw new Error(`Invalid system-test job payload: ${details}`);
    }

    return {
      processed: true,
      message: result.data.message,
    };
  });
}
