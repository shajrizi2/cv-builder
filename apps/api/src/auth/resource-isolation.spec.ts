import type { ConfigService } from '@nestjs/config';
import { createEmptyResumeContent } from '@cv-builder/resume-schema';
import { describe, expect, it, vi } from 'vitest';

import type { ApplicationConfiguration } from '../config/configuration';
import type { DatabaseService } from '../database/database.module';
import { ResumeExportsService } from '../resume-exports/resume-exports.service';
import { ResumeImportsService } from '../resume-imports/resume-imports.service';
import { ResumesService } from '../resumes/resumes.service';

const userA = '550e8400-e29b-41d4-a716-446655440001';
const userB = '550e8400-e29b-41d4-a716-446655440002';
const resumeAId = '550e8400-e29b-41d4-a716-446655440010';
const importAId = '550e8400-e29b-41d4-a716-446655440020';
const exportAId = '550e8400-e29b-41d4-a716-446655440030';
const date = new Date('2026-08-15T12:00:00Z');

const resumeA = {
  id: resumeAId,
  ownerId: userA,
  title: 'User A resume',
  content: createEmptyResumeContent(),
  template: 'classic',
  createdAt: date,
  updatedAt: date,
};
const legacyResume = { ...resumeA, id: '550e8400-e29b-41d4-a716-446655440011', ownerId: null };
const importA = {
  id: importAId,
  ownerId: userA,
  originalFilename: 'synthetic.pdf',
  mimeType: 'application/pdf',
  fileSize: 10,
  objectKey: 'private',
  status: 'QUEUED',
  errorCode: null,
  errorMessage: null,
  resumeId: null,
  createdAt: date,
  updatedAt: date,
};
const legacyImport = {
  ...importA,
  id: '550e8400-e29b-41d4-a716-446655440021',
  ownerId: null,
};
const exportA = {
  id: exportAId,
  resumeId: resumeAId,
  template: 'classic',
  resumeTitle: resumeA.title,
  resumeContent: resumeA.content,
  status: 'COMPLETED',
  objectKey: 'exports/private.pdf',
  fileSize: 100,
  errorCode: null,
  errorMessage: null,
  createdAt: date,
  updatedAt: date,
};

function database(): DatabaseService {
  const resumes = [resumeA, legacyResume];
  const imports = [importA, legacyImport];
  return {
    client: {
      resume: {
        findMany: vi.fn(({ where }: { where: { ownerId: string } }) =>
          resumes.filter((record) => record.ownerId === where.ownerId),
        ),
        findFirst: vi.fn(
          ({ where }: { where: { id: string; ownerId: string } }) =>
            resumes.find((record) => record.id === where.id && record.ownerId === where.ownerId) ??
            null,
        ),
        updateMany: vi.fn(({ where }: { where: { id: string; ownerId: string } }) => ({
          count: resumes.some(
            (record) => record.id === where.id && record.ownerId === where.ownerId,
          )
            ? 1
            : 0,
        })),
        deleteMany: vi.fn(({ where }: { where: { id: string; ownerId: string } }) => ({
          count: resumes.some(
            (record) => record.id === where.id && record.ownerId === where.ownerId,
          )
            ? 1
            : 0,
        })),
      },
      resumeImport: {
        findMany: vi.fn(({ where }: { where: { ownerId: string } }) =>
          imports.filter((record) => record.ownerId === where.ownerId),
        ),
        findFirst: vi.fn(
          ({ where }: { where: { id: string; ownerId: string } }) =>
            imports.find((record) => record.id === where.id && record.ownerId === where.ownerId) ??
            null,
        ),
      },
      resumeExport: {
        findFirst: vi.fn(
          ({
            where,
          }: {
            where: { id?: string; resumeId?: string; resume: { ownerId: string } };
          }) =>
            where.resume.ownerId === userA &&
            (where.id === exportAId || where.resumeId === resumeAId)
              ? exportA
              : null,
        ),
      },
    },
  } as unknown as DatabaseService;
}

const config = { getOrThrow: vi.fn() } as unknown as ConfigService<ApplicationConfiguration, true>;

describe('resource isolation', () => {
  it('hides User A and legacy resumes from User B', async () => {
    const service = new ResumesService(database());
    await expect(service.list(userA)).resolves.toHaveLength(1);
    await expect(service.list(userB)).resolves.toEqual([]);
    await expect(service.get(userB, resumeAId)).rejects.toMatchObject({ status: 404 });
    await expect(service.get(userA, legacyResume.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.update(userB, resumeAId, { title: 'stolen' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.delete(userB, resumeAId)).rejects.toMatchObject({ status: 404 });
  });

  it('hides User A and legacy imports from User B recovery', async () => {
    const service = new ResumeImportsService(database(), config);
    await expect(service.list(userA)).resolves.toHaveLength(1);
    await expect(service.list(userB)).resolves.toEqual([]);
    await expect(service.get(userB, importAId)).rejects.toMatchObject({ status: 404 });
    await expect(service.get(userA, legacyImport.id)).rejects.toMatchObject({ status: 404 });
  });

  it('hides User A export creation, status, errors, and PDF from User B', async () => {
    const service = new ResumeExportsService(database(), config);
    await expect(service.create(userB, resumeAId)).rejects.toMatchObject({ status: 404 });
    await expect(service.get(userB, exportAId)).rejects.toMatchObject({ status: 404 });
    await expect(service.download(userB, exportAId)).rejects.toMatchObject({ status: 404 });
    await expect(service.latestForResume(userB, resumeAId)).rejects.toMatchObject({ status: 404 });
    await expect(service.get(userA, exportAId)).resolves.toMatchObject({ id: exportAId });
  });
});
