import { randomUUID } from 'node:crypto';
import { Client } from 'minio';
import { describe, expect, it } from 'vitest';
const enabled = process.env.RUN_MINIO_INTEGRATION_TESTS === 'true';
describe.runIf(enabled)('private MinIO integration', () => {
  it('puts, reads, and deletes a private object', async () => {
    const client = new Client({
      endPoint: process.env.MINIO_ENDPOINT ?? '127.0.0.1',
      port: Number(process.env.MINIO_PORT ?? 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY ?? '',
      secretKey: process.env.MINIO_SECRET_KEY ?? '',
    });
    const bucket = process.env.MINIO_BUCKET ?? 'cv-imports-test';
    const key = `integration/${randomUUID()}`;
    if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket);
    await client.putObject(bucket, key, Buffer.from('private fixture'));
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of await client.getObject(bucket, key))
        chunks.push(Buffer.from(chunk as Uint8Array));
      expect(Buffer.concat(chunks).toString()).toBe('private fixture');
    } finally {
      await client.removeObject(bucket, key);
    }
  });
});
