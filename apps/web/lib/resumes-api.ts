import {
  resumeImportSchema,
  resumeSchema,
  type CreateResumeInput,
  type Resume,
  type UpdateResumeInput,
  type ResumeImport,
} from '@cv-builder/resume-schema';

import { publicEnv } from './env';

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${publicEnv.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
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
