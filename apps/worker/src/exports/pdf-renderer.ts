import { chromium } from 'playwright-core';

export interface PdfRenderer {
  render(html: string): Promise<Buffer>;
}

export class ChromiumPdfRenderer implements PdfRenderer {
  constructor(private readonly executablePath: string) {}

  async render(html: string): Promise<Buffer> {
    const browser = await chromium.launch({
      executablePath: this.executablePath,
      headless: true,
      ignoreDefaultArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
      const page = await context.newPage();
      await page.route('**/*', (route) => route.abort());
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const bytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        preferCSSPageSize: true,
      });
      await context.close();
      return Buffer.from(bytes);
    } finally {
      await browser.close();
    }
  }
}
