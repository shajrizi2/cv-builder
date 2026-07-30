import { describe, expect, it, vi } from 'vitest';

import {
  checkWorkerHealth,
  type HealthcheckRedisConnection,
  type HealthcheckRedisFactory,
} from '../src/healthcheck.js';

interface ConnectionHarness {
  readonly connection: HealthcheckRedisConnection;
  readonly connect: ReturnType<typeof vi.fn>;
  readonly disconnect: ReturnType<typeof vi.fn>;
  readonly ping: ReturnType<typeof vi.fn>;
  readonly quit: ReturnType<typeof vi.fn>;
  setStatus(status: string): void;
}

function createConnectionHarness(): ConnectionHarness {
  let status = 'wait';
  const connect = vi.fn(() => {
    status = 'ready';
    return Promise.resolve();
  });
  const disconnect = vi.fn(() => {
    status = 'end';
  });
  const ping = vi.fn().mockResolvedValue('PONG');
  const quit = vi.fn(() => {
    status = 'end';
    return Promise.resolve('OK');
  });

  return {
    connection: {
      get status(): string {
        return status;
      },
      connect,
      disconnect,
      ping,
      quit,
    },
    connect,
    disconnect,
    ping,
    quit,
    setStatus: (nextStatus): void => {
      status = nextStatus;
    },
  };
}

function factoryFor(connection: HealthcheckRedisConnection): HealthcheckRedisFactory {
  return vi.fn(() => connection);
}

describe('checkWorkerHealth', () => {
  it('accepts an exact PONG response and closes the connection', async () => {
    const harness = createConnectionHarness();

    await expect(checkWorkerHealth({}, factoryFor(harness.connection))).resolves.toBeUndefined();

    expect(harness.connect).toHaveBeenCalledOnce();
    expect(harness.ping).toHaveBeenCalledOnce();
    expect(harness.quit).toHaveBeenCalledOnce();
    expect(harness.disconnect).not.toHaveBeenCalled();
  });

  it('rejects an unexpected response and still closes the connection', async () => {
    const harness = createConnectionHarness();
    harness.ping.mockResolvedValue('NOT-PONG');

    await expect(checkWorkerHealth({}, factoryFor(harness.connection))).rejects.toThrow(
      'unexpected Redis response',
    );
    expect(harness.quit).toHaveBeenCalledOnce();
  });

  it('propagates connection and command failures after disconnecting', async () => {
    const harness = createConnectionHarness();
    const failure = new Error('Redis connection failed');
    harness.connect.mockRejectedValue(failure);

    await expect(checkWorkerHealth({}, factoryFor(harness.connection))).rejects.toBe(failure);
    expect(harness.ping).not.toHaveBeenCalled();
    expect(harness.disconnect).toHaveBeenCalledOnce();
  });

  it('propagates command failures after closing a ready connection', async () => {
    const harness = createConnectionHarness();
    const failure = new Error('Redis command failed');
    harness.ping.mockRejectedValue(failure);

    await expect(checkWorkerHealth({}, factoryFor(harness.connection))).rejects.toBe(failure);
    expect(harness.quit).toHaveBeenCalledOnce();
    expect(harness.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects when graceful connection cleanup fails', async () => {
    const harness = createConnectionHarness();
    harness.quit.mockRejectedValue(new Error('quit failed'));

    await expect(checkWorkerHealth({}, factoryFor(harness.connection))).rejects.toThrow(
      'connection cleanup failed',
    );
    expect(harness.disconnect).toHaveBeenCalledOnce();
  });

  it('does not expose credentials when configuration validation fails', async () => {
    const password = 'private-healthcheck-password';
    let message = '';

    try {
      await checkWorkerHealth(
        {
          REDIS_HOST: '',
          REDIS_PASSWORD: password,
        },
        factoryFor(createConnectionHarness().connection),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('Invalid worker environment configuration');
    expect(message).not.toContain(password);
  });
});
