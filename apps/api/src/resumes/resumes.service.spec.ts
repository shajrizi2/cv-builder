import { createEmptyResumeContent } from '@cv-builder/resume-schema';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../database/database.module';
import { ResumesService } from './resumes.service';

const id = '550e8400-e29b-41d4-a716-446655440000';
const now = new Date('2026-08-03T12:00:00.000Z');
const record = {
  id,
  title: 'My CV',
  content: createEmptyResumeContent(),
  createdAt: now,
  updatedAt: now,
};

function makeService(overrides: Record<string, unknown> = {}): {
  service: ResumesService;
  resume: Record<string, ReturnType<typeof vi.fn>>;
} {
  const resume = {
    create: vi.fn().mockResolvedValue(record),
    findMany: vi.fn().mockResolvedValue([record]),
    findUnique: vi.fn().mockResolvedValue(record),
    update: vi.fn().mockResolvedValue(record),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    ...overrides,
  };
  return {
    service: new ResumesService({ client: { resume } } as unknown as DatabaseService),
    resume: resume as Record<string, ReturnType<typeof vi.fn>>,
  };
}

describe('ResumesService', () => {
  it('creates valid default content and maps persistence values', async () => {
    const { service, resume } = makeService();
    await expect(service.create({ title: 'My CV' })).resolves.toMatchObject({
      id,
      title: 'My CV',
      content: createEmptyResumeContent(),
    });
    expect(resume.create).toHaveBeenCalledWith({
      data: { title: 'My CV', content: createEmptyResumeContent(), template: 'classic' },
    });
  });
  it('lists newest resumes and validates stored JSON', async () => {
    const { service, resume } = makeService();
    await expect(service.list()).resolves.toHaveLength(1);
    expect(resume.findMany).toHaveBeenCalledWith({ orderBy: { updatedAt: 'desc' } });
    const invalid = makeService({
      findMany: vi.fn().mockResolvedValue([{ ...record, content: {} }]),
    });
    await expect(invalid.service.list()).rejects.toThrow();
  });
  it('returns consistent not found errors for get, update, and delete', async () => {
    await expect(
      makeService({ findUnique: vi.fn().mockResolvedValue(null) }).service.get(id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      makeService({ findUnique: vi.fn().mockResolvedValue(null) }).service.update(id, {
        title: 'New',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      makeService({ deleteMany: vi.fn().mockResolvedValue({ count: 0 }) }).service.delete(id),
    ).rejects.toMatchObject({ status: 404 });
  });
});
