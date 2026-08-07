import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import { ResumeImportProcessingError } from './import-error.js';
const MAX_TEXT = 100_000;
export async function extractDocument(bytes: Buffer, mimeType: string): Promise<string> {
  let text = '';
  try {
    if (mimeType === 'application/pdf') {
      const loadingTask = getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false });
      const pdf = await loadingTask.promise;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        text += `${content.items.map((item) => ('str' in item ? item.str : '')).join(' ')}\n`;
        if (text.length > MAX_TEXT) break;
      }
      await loadingTask.destroy();
    } else text = (await mammoth.extractRawText({ buffer: bytes })).value;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('password'))
      throw new ResumeImportProcessingError(
        'ENCRYPTED_DOCUMENT',
        'Encrypted documents are not supported.',
        false,
      );
    throw new ResumeImportProcessingError(
      'CORRUPT_DOCUMENT',
      'The document could not be read.',
      false,
    );
  }
  text = text.replace(/\u0000/g, '').trim();
  if (!text)
    throw new ResumeImportProcessingError(
      'NO_SELECTABLE_TEXT',
      'No selectable text was found. Upload a text-based PDF or DOCX file.',
      false,
    );
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);
  return text;
}
