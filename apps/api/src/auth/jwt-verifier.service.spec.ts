import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ConfigService } from '@nestjs/config';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ApplicationConfiguration } from '../config/configuration';
import { JwtVerifierService } from './jwt-verifier.service';

const issuer = 'https://auth.synthetic.example';
const audience = 'cv-builder-api';
const subject = '550e8400-e29b-41d4-a716-446655440001';
let server: Server;
let jwksUrl: string;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

function config(url: string): ConfigService<ApplicationConfiguration, true> {
  return {
    getOrThrow: () => ({
      authJwksUrl: url,
      apiJwtIssuer: issuer,
      apiJwtAudience: audience,
    }),
  } as unknown as ConfigService<ApplicationConfiguration, true>;
}

async function token(
  overrides: {
    issuer?: string;
    audience?: string;
    subject?: string;
    expiresAt?: string;
    notBefore?: string;
    key?: typeof privateKey;
  } = {},
): Promise<string> {
  const jwt = new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'synthetic-key' });
  if (overrides.subject !== '') jwt.setSubject(overrides.subject ?? subject);
  jwt
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? audience)
    .setIssuedAt()
    .setExpirationTime(overrides.expiresAt ?? '5m');
  if (overrides.notBefore) jwt.setNotBefore(overrides.notBefore);
  return jwt.sign(overrides.key ?? privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ keys: [{ ...publicJwk, alg: 'ES256', kid: 'synthetic-key' }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  jwksUrl = `http://127.0.0.1:${address.port}/jwks`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('JwtVerifierService', () => {
  it('cryptographically verifies a valid ES256 token and UUID subject', async () => {
    await expect(new JwtVerifierService(config(jwksUrl)).verify(await token())).resolves.toEqual({
      id: subject,
    });
  });

  it.each([
    ['wrong issuer', { issuer: 'https://wrong.example' }],
    ['wrong audience', { audience: 'wrong-api' }],
    ['expired', { expiresAt: '1s ago' }],
    ['not yet valid', { notBefore: '5m' }],
    ['missing subject', { subject: '' }],
    ['invalid subject', { subject: 'not-a-uuid' }],
  ])('rejects %s tokens', async (_name, overrides) => {
    await expect(
      new JwtVerifierService(config(jwksUrl)).verify(await token(overrides)),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects an invalid signature', async () => {
    const other = await generateKeyPair('ES256');
    await expect(
      new JwtVerifierService(config(jwksUrl)).verify(await token({ key: other.privateKey })),
    ).rejects.toBeInstanceOf(Error);
  });

  it('rejects unsigned, malformed, and disallowed-algorithm tokens', async () => {
    const unsigned = [
      Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url'),
      Buffer.from(
        JSON.stringify({ sub: subject, iss: issuer, aud: audience, exp: Date.now() / 1_000 + 300 }),
      ).toString('base64url'),
      '',
    ].join('.');
    const disallowed = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(subject)
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('synthetic-test-signing-secret'));
    const verifier = new JwtVerifierService(config(jwksUrl));

    await expect(verifier.verify('not-a-jwt')).rejects.toBeInstanceOf(Error);
    await expect(verifier.verify(unsigned)).rejects.toBeInstanceOf(Error);
    await expect(verifier.verify(disallowed)).rejects.toBeInstanceOf(Error);
  });

  it('fails closed when JWKS is unavailable', async () => {
    await expect(
      new JwtVerifierService(config('http://127.0.0.1:1/unavailable')).verify(await token()),
    ).rejects.toBeInstanceOf(Error);
  });
});
