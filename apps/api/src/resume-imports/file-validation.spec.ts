import { describe, expect, it } from 'vitest';
import { sanitizeFilename, validateImportFile } from './file-validation';
describe('import file validation', () => {
  it('sanitizes supplied paths', () =>
    expect(sanitizeFilename('../../private resume.pdf')).toBe('private resume.pdf'));
  it('accepts matching PDF metadata and signature', async () => {
    await expect(
      validateImportFile('cv.pdf', 'application/pdf', Buffer.from('%PDF-1.7\n')),
    ).resolves.toMatchObject({ mimeType: 'application/pdf' });
  });
  it('rejects empty, mismatched, and unsupported input', async () => {
    await expect(validateImportFile('cv.pdf', 'application/pdf', Buffer.alloc(0))).rejects.toThrow(
      'between',
    );
    await expect(
      validateImportFile('cv.pdf', 'application/pdf', Buffer.from('not a pdf')),
    ).rejects.toThrow('valid PDF');
    await expect(validateImportFile('cv.txt', 'text/plain', Buffer.from('text'))).rejects.toThrow(
      'valid PDF',
    );
  });
});
