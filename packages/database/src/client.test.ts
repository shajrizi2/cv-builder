import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDatabaseClient, disconnectDatabase, getDatabaseClient } from './client.js';

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(async () => {
  await disconnectDatabase();
  vi.restoreAllMocks();

  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe('database client lifecycle', () => {
  it('does not require a database URL merely to import the module', () => {
    delete process.env.DATABASE_URL;

    expect(createDatabaseClient).toBeTypeOf('function');
  });

  it('fails clearly when no database URL exists', () => {
    delete process.env.DATABASE_URL;

    expect(() => createDatabaseClient()).toThrowError(
      'DATABASE_URL is required to create a database client',
    );
  });

  it('reuses one shared client in the current process', () => {
    process.env.DATABASE_URL = 'postgresql://disposable:disposable@127.0.0.1:1/disposable';

    expect(getDatabaseClient()).toBe(getDatabaseClient());
  });

  it('disconnects and clears the shared client explicitly', async () => {
    process.env.DATABASE_URL = 'postgresql://disposable:disposable@127.0.0.1:1/disposable';
    const firstClient = getDatabaseClient();
    const disconnect = vi.spyOn(firstClient, '$disconnect');

    await disconnectDatabase();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(getDatabaseClient()).not.toBe(firstClient);
  });

  it('allows disconnect before a shared client has been created', async () => {
    await expect(disconnectDatabase()).resolves.toBeUndefined();
  });
});
