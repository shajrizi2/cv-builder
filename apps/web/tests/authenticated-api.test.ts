import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthenticationExpiredError,
  clearApiAuthentication,
  createResumeExport,
  downloadResumeExport,
  listResumes,
} from '@/lib/resumes-api';

function syntheticToken(expiresAt: number): string {
  const payload = btoa(JSON.stringify({ exp: expiresAt }));
  return `header.${payload}.signature`;
}

afterEach(() => {
  clearApiAuthentication();
  vi.restoreAllMocks();
});

describe('authenticated API client', () => {
  it('sends an in-memory bearer token without browser storage', async () => {
    const token = syntheticToken(Math.floor(Date.now() / 1_000) + 300);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ token }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const consoleLog = vi.spyOn(console, 'log');
    const consoleError = vi.spyOn(console, 'error');

    await expect(listResumes()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/resumes'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
      }),
    );
    expect(local).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[1]![0])).not.toContain(token);
  });

  it('shares one in-flight token request across concurrent protected calls', async () => {
    const token = syntheticToken(Math.floor(Date.now() / 1_000) + 300);
    let resolveToken!: (response: Response) => void;
    const pendingToken = new Promise<Response>((resolve) => {
      resolveToken = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (String(input) === '/api/auth/token') return pendingToken;
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    const first = listResumes();
    const second = listResumes();
    resolveToken(new Response(JSON.stringify({ token }), { status: 200 }));

    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
    expect(fetchMock.mock.calls.filter(([input]) => input === '/api/auth/token')).toHaveLength(1);
  });

  it('clears a rejected token, refreshes once, and caches the replacement', async () => {
    const firstToken = syntheticToken(Math.floor(Date.now() / 1_000) + 300);
    const replacementToken = syntheticToken(Math.floor(Date.now() / 1_000) + 600);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: firstToken }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: replacementToken }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    await expect(listResumes()).resolves.toEqual([]);
    await expect(listResumes()).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.filter(([input]) => input === '/api/auth/token')).toHaveLength(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('/resumes'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${replacementToken}` }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('/resumes'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${replacementToken}` }),
      }),
    );
  });

  it('reports an expired session without claiming a protected request succeeded', async () => {
    const firstToken = syntheticToken(Math.floor(Date.now() / 1_000) + 300);
    const secondToken = syntheticToken(Math.floor(Date.now() / 1_000) + 600);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: firstToken }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: secondToken }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const expired = vi.fn();
    window.addEventListener('cv-builder:auth-expired', expired, { once: true });
    await expect(listResumes()).rejects.toBeInstanceOf(AuthenticationExpiredError);
    expect(expired).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('drops the in-memory token when the user signs out', async () => {
    const firstToken = syntheticToken(Math.floor(Date.now() / 1_000) + 300);
    const secondToken = syntheticToken(Math.floor(Date.now() / 1_000) + 600);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: firstToken }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: secondToken }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    await listResumes();
    clearApiAuthentication();
    await listResumes();

    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/auth/token', {
      credentials: 'include',
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('/resumes'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${secondToken}` }),
      }),
    );
  });

  it('does not label an empty export request as JSON', async () => {
    const token = syntheticToken(Math.floor(Date.now() / 1_000) + 300);
    const exportRecord = {
      id: '10000000-0000-4000-8000-000000000001',
      resumeId: '10000000-0000-4000-8000-000000000002',
      template: 'classic',
      status: 'QUEUED',
      errorCode: null,
      errorMessage: null,
      fileSize: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ token }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(exportRecord), { status: 200 }));

    await createResumeExport(exportRecord.resumeId);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/exports'),
      expect.objectContaining({ headers: { Authorization: `Bearer ${token}` }, method: 'POST' }),
    );
  });

  it('refreshes an authenticated PDF download once without putting the token in its URL', async () => {
    const firstToken = syntheticToken(Math.floor(Date.now() / 1_000) + 300);
    const replacementToken = syntheticToken(Math.floor(Date.now() / 1_000) + 600);
    const exportId = '10000000-0000-4000-8000-000000000003';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: firstToken }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: replacementToken }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response('%PDF', {
          status: 200,
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': "attachment; filename*=UTF-8''synthetic.pdf",
          },
        }),
      );
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:synthetic-download'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await downloadResumeExport(exportId);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.filter(([input]) => input === '/api/auth/token')).toHaveLength(2);
    const downloadUrl = String(fetchMock.mock.calls[3]![0]);
    expect(downloadUrl.endsWith(`/resume-exports/${exportId}/download`)).toBe(true);
    expect(downloadUrl).not.toContain('?');
    expect(downloadUrl).not.toContain(replacementToken);
    expect(fetchMock).toHaveBeenNthCalledWith(4, downloadUrl, {
      headers: { Authorization: `Bearer ${replacementToken}` },
    });
  });
});
