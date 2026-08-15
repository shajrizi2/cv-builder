import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabaseClient, disconnectDatabase } from '@cv-builder/database';

import { auth } from '@/lib/auth';

const enabled = process.env.RUN_AUTH_INTEGRATION_TESTS === 'true';
const integration = enabled ? describe : describe.skip;
const databaseUrl = process.env.TEST_DATABASE_URL;
const baseUrl = 'http://localhost:3000';
const issuer = 'http://localhost:3000';
const audience = 'cv-builder-api';
const email = `cvb023-auth-${Date.now()}@example.test`;
const password = 'Synthetic1!StrongPassword';

function createIntegrationDatabase(): ReturnType<typeof createDatabaseClient> | undefined {
  if (!enabled) return undefined;
  if (!databaseUrl || process.env.DATABASE_URL !== databaseUrl) {
    throw new Error(
      'RUN_AUTH_INTEGRATION_TESTS requires matching explicit TEST_DATABASE_URL and DATABASE_URL values',
    );
  }
  return createDatabaseClient({ databaseUrl });
}

const database = createIntegrationDatabase();

function sessionCookie(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';', 1)[0])
    .join('; ');
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`${baseUrl}/api/auth${path}`, {
    ...init,
    headers: {
      origin: baseUrl,
      ...init.headers,
    },
  });
}

afterAll(async () => {
  if (!database) return;
  await database.user.deleteMany({ where: { email } });
  await database.$disconnect();
  await disconnectDatabase();
});

integration('Better Auth JWT integration', () => {
  it('uses persistent sessions, emits minimal ES256 claims, and encrypts the private key', async () => {
    expect(databaseUrl).toMatch(/^postgres(?:ql)?:\/\//);

    const signup = await auth.handler(
      request('/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Synthetic Auth User', email, password }),
      }),
    );
    expect(signup.status).toBe(200);
    const cookie = sessionCookie(signup);
    expect(cookie).not.toBe('');

    const sessionResponse = await auth.handler(request('/get-session', { headers: { cookie } }));
    expect(sessionResponse.status).toBe(200);
    const session = (await sessionResponse.json()) as { user: { id: string; email: string } };
    expect(session.user.email).toBe(email);
    expect(session.user.id).toMatch(/^[0-9a-f-]{36}$/i);

    const tokenResponse = await auth.handler(request('/token', { headers: { cookie } }));
    expect(tokenResponse.status).toBe(200);
    const { token } = (await tokenResponse.json()) as { token: string };
    expect(decodeProtectedHeader(token).alg).toBe('ES256');

    const jwksResponse = await auth.handler(request('/jwks'));
    expect(jwksResponse.status).toBe(200);
    const jwks = (await jwksResponse.json()) as Parameters<typeof createLocalJWKSet>[0];
    const { payload, protectedHeader } = await jwtVerify(token, createLocalJWKSet(jwks), {
      algorithms: ['ES256'],
      issuer,
      audience,
    });
    expect(protectedHeader.alg).toBe('ES256');
    expect(payload.sub).toBe(session.user.id);
    expect(payload.iss).toBe(issuer);
    expect(payload.aud).toBe(audience);
    expect(payload.iat).toEqual(expect.any(Number));
    expect(payload.exp).toEqual(expect.any(Number));
    expect(payload.exp! - payload.iat!).toBe(15 * 60);
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sub']);

    const storedKey = await database!.jwks.findFirstOrThrow({
      select: { privateKey: true },
    });
    expect(storedKey.privateKey).not.toContain('BEGIN PRIVATE KEY');
    expect(storedKey.privateKey).not.toContain('"kty"');
    expect(storedKey.privateKey).not.toContain('"d"');
    const encrypted = JSON.parse(storedKey.privateKey) as unknown;
    expect(typeof encrypted).toBe('string');
    expect((encrypted as string).length).toBeGreaterThan(100);

    const signout = await auth.handler(
      request('/sign-out', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(signout.status).toBe(200);
    const signedOutSession = await auth.handler(request('/get-session', { headers: { cookie } }));
    expect(await signedOutSession.json()).toBeNull();

    const signin = await auth.handler(
      request('/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(signin.status).toBe(200);
    const refreshedSession = await auth.handler(
      request('/get-session', { headers: { cookie: sessionCookie(signin) } }),
    );
    expect((await refreshedSession.json()) as object).toMatchObject({
      user: { id: session.user.id, email },
    });
  });
});
