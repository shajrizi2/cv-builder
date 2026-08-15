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

  it('persists and updates structured resume JSON', async () => {
    if (testDatabaseUrl === undefined || testDatabaseUrl.trim() === '')
      throw new Error('TEST_DATABASE_URL is required');
    client = createDatabaseClient({ databaseUrl: testDatabaseUrl });
    const created = await client.resume.create({
      data: { title: 'Integration CV', content: { metadata: { version: 1 } } },
    });
    try {
      const updated = await client.resume.update({
        where: { id: created.id },
        data: { title: 'Updated CV', content: { metadata: { version: 1 }, summary: 'Saved' } },
      });
      expect(updated.title).toBe('Updated CV');
      expect(await client.resume.findUnique({ where: { id: created.id } })).toMatchObject({
        content: { metadata: { version: 1 }, summary: 'Saved' },
      });
    } finally {
      await client.resume.delete({ where: { id: created.id } });
    }
  });

  it('keeps legacy imports readable and persists CVB-024 fallback fields', async () => {
    if (testDatabaseUrl === undefined || testDatabaseUrl.trim() === '')
      throw new Error('TEST_DATABASE_URL is required');
    client = createDatabaseClient({ databaseUrl: testDatabaseUrl });
    const created = await client.resumeImport.create({
      data: {
        originalFilename: 'synthetic.pdf',
        mimeType: 'application/pdf',
        fileSize: 42,
        objectKey: `imports/${crypto.randomUUID()}`,
      },
    });
    try {
      expect(created).toMatchObject({ completionMode: null, extractedText: null });
      const updated = await client.resumeImport.update({
        where: { id: created.id },
        data: {
          completionMode: 'MANUAL_FALLBACK',
          extractedText: 'Synthetic source text',
          objectKey: null,
        },
      });
      expect(updated).toMatchObject({
        completionMode: 'MANUAL_FALLBACK',
        extractedText: 'Synthetic source text',
        objectKey: null,
      });
    } finally {
      await client.resumeImport.delete({ where: { id: created.id } });
    }
  });
});
