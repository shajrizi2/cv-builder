import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { createApplication } from '../src/application';

const environmentKeys = [
  'NODE_ENV',
  'API_PORT',
  'API_HOST',
  'CORS_ORIGINS',
  'SWAGGER_ENABLED',
] as const;

let app: NestFastifyApplication | undefined;

async function startApplication(
  environment: Partial<Record<(typeof environmentKeys)[number], string>>,
): Promise<NestFastifyApplication> {
  for (const key of environmentKeys) {
    delete process.env[key];
  }
  Object.assign(process.env, environment);

  app = await createApplication();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

afterEach(async () => {
  if (app !== undefined) {
    await app.close();
    app = undefined;
  }
  for (const key of environmentKeys) {
    delete process.env[key];
  }
});

describe('API application', () => {
  it('serves the health endpoint under the global API prefix', async () => {
    const testApp = await startApplication({ NODE_ENV: 'test' });
    const response = await testApp.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'api',
    });
  });

  it('exposes Swagger when enabled', async () => {
    const testApp = await startApplication({
      NODE_ENV: 'test',
      SWAGGER_ENABLED: 'true',
    });
    const response = await testApp.inject({
      method: 'GET',
      url: '/api/docs/',
    });

    expect(response.statusCode).toBe(200);
  });

  it('does not expose Swagger when disabled', async () => {
    const testApp = await startApplication({
      NODE_ENV: 'test',
      SWAGGER_ENABLED: 'false',
    });
    const response = await testApp.inject({
      method: 'GET',
      url: '/api/docs/',
    });

    expect(response.statusCode).toBe(404);
  });
});
