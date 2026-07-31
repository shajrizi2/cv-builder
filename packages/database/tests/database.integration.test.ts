import { afterEach, describe, expect, it } from 'vitest';

import { createDatabaseClient } from '../src/client.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

const integrationEnabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
let client: PrismaClient | undefined;

afterEach(async () => {
  await client?.$disconnect();
  client = undefined;
});

describe.runIf(integrationEnabled)('PostgreSQL integration', () => {
  it('requires a dedicated test database URL', () => {
    expect(testDatabaseUrl).toBeTypeOf('string');
    expect(testDatabaseUrl?.trim()).not.toBe('');
  });

  it('connects, executes SELECT 1, and returns the expected result', async () => {
    if (testDatabaseUrl === undefined || testDatabaseUrl.trim() === '') {
      throw new Error('TEST_DATABASE_URL is required when database integration tests are enabled');
    }

    client = createDatabaseClient({ databaseUrl: testDatabaseUrl });
    const result = await client.$queryRaw<Array<{ value: number }>>`SELECT 1 AS value`;

    expect(result).toEqual([{ value: 1 }]);
  });
});
