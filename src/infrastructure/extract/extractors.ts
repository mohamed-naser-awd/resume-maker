import type { DocumentTextExtractor, UploadedDocument } from '@/ports/DocumentTextExtractor';

const ext = (name: string) => name.toLowerCase().split('.').pop() ?? '';

export class PlainTextExtractor implements DocumentTextExtractor {
  supports(doc: Pick<UploadedDocument, 'name' | 'mimeType'>): boolean {
    return doc.mimeType.startsWith('text/') || ['txt', 'md'].includes(ext(doc.name));
  }
  async extract(doc: UploadedDocument): Promise<string> {
    return new TextDecoder().decode(doc.data);
  }
}

/** PDF text via pdf.js (loaded lazily so the panel opens fast). */
export class PdfTextExtractor implements DocumentTextExtractor {
  supports(doc: Pick<UploadedDocument, 'name' | 'mimeType'>): boolean {
    return doc.mimeType === 'application/pdf' || ext(doc.name) === 'pdf';
  }

  async extract(doc: UploadedDocument): Promise<string> {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    const task = pdfjs.getDocument({ data: new Uint8Array(doc.data.slice(0)) });
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let line = '';
      const lines: string[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = '';
        } else if (item.str && !item.str.endsWith(' ')) {
          line += ' ';
        }
      }
      if (line.trim()) lines.push(line);
      pages.push(lines.map((l) => l.replace(/\s+/g, ' ').trim()).join('\n'));
    }
    await task.destroy();
    return pages.join('\n\n');
  }
}

/** DOCX text via mammoth's browser build. */
export class DocxTextExtractor implements DocumentTextExtractor {
  supports(doc: Pick<UploadedDocument, 'name' | 'mimeType'>): boolean {
    return (
      doc.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext(doc.name) === 'docx'
    );
  }

  async extract(doc: UploadedDocument): Promise<string> {
    const mammoth = (await import('mammoth/mammoth.browser.js')).default;
    const result = await mammoth.extractRawText({ arrayBuffer: doc.data });
    return result.value;
  }
}

/** Delegates to the first extractor that supports the file. */
export class CompositeTextExtractor implements DocumentTextExtractor {
  constructor(private readonly extractors: DocumentTextExtractor[]) {}

  supports(doc: Pick<UploadedDocument, 'name' | 'mimeType'>): boolean {
    return this.extractors.some((e) => e.supports(doc));
  }

  extract(doc: UploadedDocument): Promise<string> {
    const extractor = this.extractors.find((e) => e.supports(doc));
    if (!extractor) return Promise.reject(new Error('Unsupported file type. Use PDF, DOCX or TXT.'));
    return extractor.extract(doc);
  }
}
