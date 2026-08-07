import multipart from '@fastify/multipart';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/application';
import { DatabaseService } from '../src/database/database.module';

let app: NestFastifyApplication;
const boundary = 'cv-builder-boundary';
function body(
  parts: Array<{ name: string; filename?: string; type?: string; value: string }>,
): Buffer {
  const chunks = parts.map(
    (part) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ''}\r\n${part.type ? `Content-Type: ${part.type}\r\n` : ''}\r\n${part.value}\r\n`,
  );
  return Buffer.from(`${chunks.join('')}--${boundary}--\r\n`);
}
async function post(parts: Parameters<typeof body>[0]): Promise<{ statusCode: number }> {
  return app.inject({
    method: 'POST',
    url: '/api/resume-imports',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body(parts),
  });
}
const pdf = (name = 'file'): { name: string; filename: string; type: string; value: string } => ({
  name,
  filename: 'cv.pdf',
  type: 'application/pdf',
  value: '%PDF-1.7',
});
beforeEach(async () => {
  process.env.NODE_ENV = 'test';
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue({ client: { resumeImport: {} } })
    .compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.register(multipart, { limits: { files: 1, fileSize: 10 * 1024 * 1024 } });
  configureApplication(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterEach(async () => {
  await app.close();
  delete process.env.NODE_ENV;
});
describe('resume import multipart shape', () => {
  it('rejects missing file', async () => expect((await post([])).statusCode).toBe(400));
  it('rejects wrong file field', async () =>
    expect((await post([pdf('document')])).statusCode).toBe(400));
  it('rejects unexpected text fields', async () =>
    expect((await post([{ name: 'note', value: 'unexpected' }, pdf()])).statusCode).toBe(400));
  it('rejects a second file field', async () =>
    expect((await post([pdf(), pdf()])).statusCode).toBeGreaterThanOrEqual(400));
  it('rejects an additional differently named file', async () =>
    expect((await post([pdf(), pdf('extra')])).statusCode).toBeGreaterThanOrEqual(400));
  it('accepts the strict shape before safely reporting unavailable infrastructure', async () =>
    expect((await post([pdf()])).statusCode).toBe(503));
});
