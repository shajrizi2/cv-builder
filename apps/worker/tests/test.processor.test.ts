import type { Job } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { processTestJob } from '../src/processors/test.processor.js';

function jobWithData(data: unknown): Job<unknown> {
  return { data } as Job<unknown>;
}

describe('processTestJob', () => {
  it('returns the deterministic result without mutating the payload', async () => {
    const payload = Object.freeze({ message: 'worker-ready' });

    await expect(processTestJob(jobWithData(payload))).resolves.toEqual({
      processed: true,
      message: 'worker-ready',
    });
    expect(payload).toEqual({ message: 'worker-ready' });
  });

  it.each([
    undefined,
    null,
    {},
    { message: '' },
    { message: 'unexpected' },
    { message: 'worker-ready', cvContent: 'must not be accepted' },
  ])('rejects malformed or unexpected payload %#', async (payload) => {
    await expect(processTestJob(jobWithData(payload))).rejects.toThrow(
      'Invalid system-test job payload',
    );
  });
});
