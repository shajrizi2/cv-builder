import {
  resumeImportSchema,
  resumeImportSourceSchema,
  resumeExportSchema,
  resumeSchema,
  type CreateResumeInput,
  type Resume,
  type UpdateResumeInput,
  type ResumeImport,
  type ResumeImportSource,
  type ResumeExport,
} from '@cv-builder/resume-schema';

import { publicEnv } from './env';

let cachedToken: { value: string; expiresAt: number } | undefined;
let tokenRequest: Promise<string> | undefined;

export class AuthenticationExpiredError extends Error {
  constructor() {
    super('Your session has expired. Sign in again to continue.');
    this.name = 'AuthenticationExpiredError';
  }
}

function tokenExpiration(token: string): number {
  try {
    const encoded = token.split('.')[1];
    if (!encoded) return 0;
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as {
      exp?: unknown;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1_000 : 0;
  } catch {
    return 0;
  }
}

export function clearApiAuthentication(): void {
  cachedToken = undefined;
  tokenRequest = undefined;
}

function reportExpiredAuthentication(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('cv-builder:auth-expired'));
}

async function getApiToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt - Date.now() > 30_000) {
    return cachedToken.value;
  }
  if (tokenRequest) return tokenRequest;
  const active = fetch('/api/auth/token', { credentials: 'include', cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new AuthenticationExpiredError();
      const body = (await response.json()) as { token?: unknown };
      if (typeof body.token !== 'string') throw new AuthenticationExpiredError();
      const expiresAt = tokenExpiration(body.token);
      if (expiresAt <= Date.now()) throw new AuthenticationExpiredError();
      cachedToken = { value: body.token, expiresAt };
      return body.token;
    })
    .catch((error: unknown) => {
      cachedToken = undefined;
      reportExpiredAuthentication();
      throw error instanceof AuthenticationExpiredError ? error : new AuthenticationExpiredError();
    })
    .finally(() => {
      tokenRequest = undefined;
    });
  tokenRequest = active;
  return active;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  async function authenticatedFetch(forceRefresh = false) {
    const token = await getApiToken(forceRefresh);
    return fetch(`${publicEnv.NEXT_PUBLIC_API_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body !== undefined && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init?.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  }

  let response = await authenticatedFetch();
  if (response.status === 401) {
    cachedToken = undefined;
    response = await authenticatedFetch(true);
  }
  if (!response.ok) {
    if (response.status === 401) {
      reportExpiredAuthentication();
      throw new AuthenticationExpiredError();
    }
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  return response.status === 204 ? undefined : response.json();
}
export async function createResumeImport(file: File): Promise<ResumeImport> {
  const body = new FormData();
  body.append('file', file);
  return resumeImportSchema.parse(await request('/resume-imports', { method: 'POST', body }));
}
export async function listResumeImports(): Promise<ResumeImport[]> {
  return resumeImportSchema.array().parse(await request('/resume-imports'));
}
export async function getResumeImport(id: string): Promise<ResumeImport> {
  return resumeImportSchema.parse(await request(`/resume-imports/${id}`));
}
export async function getResumeImportSource(id: string): Promise<ResumeImportSource> {
  return resumeImportSourceSchema.parse(await request(`/resumes/${id}/import-source`));
}

export async function listResumes(): Promise<Resume[]> {
  const value = await request('/resumes');
  return resumeSchema.array().parse(value);
}
export async function getResume(id: string): Promise<Resume> {
  return resumeSchema.parse(await request(`/resumes/${id}`));
}
export async function createResume(input: CreateResumeInput): Promise<Resume> {
  return resumeSchema.parse(
    await request('/resumes', { method: 'POST', body: JSON.stringify(input) }),
  );
}
export async function updateResume(id: string, input: UpdateResumeInput): Promise<Resume> {
  return resumeSchema.parse(
    await request(`/resumes/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  );
}
export async function deleteResume(id: string): Promise<void> {
  await request(`/resumes/${id}`, { method: 'DELETE' });
}
export async function createResumeExport(resumeId: string): Promise<ResumeExport> {
  return resumeExportSchema.parse(
    await request(`/resumes/${resumeId}/exports`, { method: 'POST' }),
  );
}
export async function getResumeExport(id: string): Promise<ResumeExport> {
  return resumeExportSchema.parse(await request(`/resume-exports/${id}`));
}
export async function getLatestResumeExport(resumeId: string): Promise<ResumeExport | null> {
  const value = await request(`/resumes/${resumeId}/exports/latest`);
  return value === null ? null : resumeExportSchema.parse(value);
}
export async function downloadResumeExport(id: string): Promise<void> {
  async function download(forceRefresh = false) {
    const token = await getApiToken(forceRefresh);
    return fetch(`${publicEnv.NEXT_PUBLIC_API_URL}/resume-exports/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  let response = await download();
  if (response.status === 401) {
    cachedToken = undefined;
    response = await download(true);
  }
  if (!response.ok) {
    if (response.status === 401) {
      reportExpiredAuthentication();
      throw new AuthenticationExpiredError();
    }
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Download failed (${response.status})`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const filename = encodedName ? decodeURIComponent(encodedName) : 'resume.pdf';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
