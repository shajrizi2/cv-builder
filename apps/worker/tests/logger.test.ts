import { describe, expect, it } from 'vitest';

import { createLogger } from '../src/logging/logger.js';

describe('createLogger', () => {
  it('writes structured JSON in production with safe context', () => {
    const lines: string[] = [];
    const logger = createLogger('test-worker', 'production', {
      write: (line) => lines.push(line),
    });

    logger.info('job.completed', { queueName: 'system-test', jobId: 'job-1' });

    const line = lines[0];
    expect(typeof line).toBe('string');
    const parsed = JSON.parse(line ?? '') as unknown;
    expect(parsed).toMatchObject({
      level: 'info',
      event: 'job.completed',
      workerName: 'test-worker',
      queueName: 'system-test',
      jobId: 'job-1',
    });
  });

  it('writes readable development output and safely serializes errors', () => {
    const lines: string[] = [];
    const logger = createLogger('test-worker', 'development', {
      write: (line) => lines.push(line),
    });

    logger.error('job.failed', {
      queueName: 'system-test',
      jobId: 'job-2',
      error: new Error('processing failed'),
    });

    expect(lines[0]).toContain('[error] test-worker job.failed');
    expect(lines[0]).toContain('processing failed');
  });

  it('does not expose values from unknown thrown objects', () => {
    const lines: string[] = [];
    const logger = createLogger('test-worker', 'production', {
      write: (line) => lines.push(line),
    });

    logger.error('worker.error', {
      error: { username: 'private-user', password: 'private-password', payload: 'private-cv' },
    });

    const line = lines[0] ?? '';
    expect(line).not.toContain('private-user');
    expect(line).not.toContain('private-password');
    expect(line).not.toContain('private-cv');
  });
});
