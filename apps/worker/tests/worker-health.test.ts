import { describe, expect, it } from 'vitest';

import { WorkerHealth } from '../src/health/worker-health.js';

describe('WorkerHealth', () => {
  it('supports every worker lifecycle state', () => {
    const health = new WorkerHealth();

    expect(health.getSnapshot()).toEqual({ status: 'starting', service: 'worker' });
    health.markReady();
    expect(health.getSnapshot()).toEqual({ status: 'ready', service: 'worker' });
    health.markShuttingDown();
    expect(health.getSnapshot()).toEqual({ status: 'shutting-down', service: 'worker' });
    health.markStopped();
    expect(health.getSnapshot()).toEqual({ status: 'stopped', service: 'worker' });
    health.markFailed();
    expect(health.getSnapshot()).toEqual({ status: 'failed', service: 'worker' });
  });

  it('returns immutable snapshots', () => {
    expect(Object.isFrozen(new WorkerHealth().getSnapshot())).toBe(true);
  });
});
