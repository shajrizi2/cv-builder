import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440001';
export const testJwtVerifier = {
  verify: (): Promise<{ id: string }> => Promise.resolve({ id: TEST_USER_ID }),
};

export function addSyntheticAuthorization(app: NestFastifyApplication): void {
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, _reply, done) => {
      request.headers.authorization ??= 'Bearer synthetic-test-token';
      done();
    });
}
