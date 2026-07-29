export const workerStatuses = ['starting', 'ready', 'shutting-down', 'stopped', 'failed'] as const;

export type WorkerStatus = (typeof workerStatuses)[number];

export interface WorkerHealthSnapshot {
  readonly status: WorkerStatus;
  readonly service: 'worker';
}

export class WorkerHealth {
  private status: WorkerStatus = 'starting';

  getSnapshot(): WorkerHealthSnapshot {
    return Object.freeze({
      status: this.status,
      service: 'worker',
    });
  }

  markReady(): void {
    this.status = 'ready';
  }

  markShuttingDown(): void {
    this.status = 'shutting-down';
  }

  markStopped(): void {
    this.status = 'stopped';
  }

  markFailed(): void {
    this.status = 'failed';
  }
}
