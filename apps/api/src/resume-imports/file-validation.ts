import { extname, basename } from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import type { SupportedResumeImportMimeType } from '@cv-builder/resume-schema';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const;

export function sanitizeFilename(value: string): string {
  const safe = basename(value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\p{L}\p{N} ._()-]/gu, '_')
    .trim();
  return (safe || 'resume').slice(0, 255);
}

export async function validateImportFile(
  name: string,
  declaredMime: string,
  bytes: Buffer,
): Promise<{ filename: string; mimeType: SupportedResumeImportMimeType }> {
  if (bytes.length === 0 || bytes.length > MAX_IMPORT_BYTES)
    throw new Error('File must be between 1 byte and 10 MB');
  const extension = extname(name).toLowerCase();
  const detected = await fileTypeFromBuffer(bytes);
  const expected =
    extension === '.pdf' ? 'application/pdf' : extension === '.docx' ? DOCX : undefined;
  if (expected === undefined || declaredMime !== expected || detected?.mime !== expected)
    throw new Error('Only valid PDF or DOCX files are accepted');
  return { filename: sanitizeFilename(name), mimeType: expected };
}
