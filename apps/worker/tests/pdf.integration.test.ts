import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createEmptyResumeContent } from '@cv-builder/resume-schema';
import { renderResumeHtml } from '@cv-builder/templates';
import { describe, expect, it } from 'vitest';
import { ChromiumPdfRenderer } from '../src/exports/pdf-renderer.js';

const run = process.env.RUN_PDF_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

run('Chromium PDF integration', () => {
  it.each(['classic', 'modern'] as const)(
    'generates A4 selectable multi-page Unicode output for %s',
    async (template) => {
      const content = createEmptyResumeContent();
      content.personalInfo.fullName = 'Synthetic Candidate — مرشح تجريبي';
      content.summary = 'Unicode résumé test: Ελληνικά, 中文, العربية.\n'.repeat(30);
      content.experience = Array.from({ length: 18 }, (_, index) => ({
        id: crypto.randomUUID(),
        company: `Example Company ${index}`,
        position: 'Software Engineer',
        location: 'Example City',
        startDate: '2020',
        endDate: '2026',
        current: false,
        description: 'Synthetic project delivery and measurable outcomes. '.repeat(5),
      }));
      const renderer = new ChromiumPdfRenderer(
        process.env.CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium',
      );
      const pdf = await renderer.render(
        renderResumeHtml({ title: 'Synthetic resume', content, template }),
      );
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      expect(pdf.length).toBeGreaterThan(10_000);
      const loadingTask = getDocument({ data: new Uint8Array(pdf) });
      const document = await loadingTask.promise;
      expect(document.numPages).toBeGreaterThan(1);
      const page = await document.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      expect(viewport.width).toBeCloseTo(595, -1);
      expect(viewport.height).toBeCloseTo(842, -1);
      const text = (await page.getTextContent()).items
        .filter((item): item is typeof item & { str: string } => 'str' in item)
        .map((item) => item.str)
        .join(' ');
      expect(text).toContain('Synthetic Candidate');
      expect(text).toContain('مرشح');
      expect(text).toContain('تجريبي');
      await loadingTask.destroy();
    },
  );
});
