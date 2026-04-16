import { describe, it, expect } from 'vitest';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { PDFDocument, PDFName } from 'pdf-lib';
import { extractStructure } from '../../src/services/structureService.js';
import { setDocumentTitle, setDocumentLanguage, setPdfUaIdentification } from '../../src/services/remediation/tools/metadata.js';

async function minimalPdfBuffer(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText('x', { x: 50, y: 100, size: 12 });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

describe('metadata remediation tools', () => {
  it('sets document title', async () => {
    const before = await minimalPdfBuffer();
    const after = await setDocumentTitle(before, '  My Title  ');
    expect(after.equals(before)).toBe(false);
    const doc = await PDFDocument.load(after);
    expect(doc.getTitle()).toBe('My Title');
  });

  it('sets document title with Unicode (UTF-16 PDF string via pikepdf)', async () => {
    const before = await minimalPdfBuffer();
    const title = 'Rapport annuel Café 中文';
    const after = await setDocumentTitle(before, title);
    expect(after.equals(before)).toBe(false);
    const doc = await PDFDocument.load(after);
    expect(doc.getTitle()).toBe(title);
  });

  it('sets document language', async () => {
    const before = await minimalPdfBuffer();
    const after = await setDocumentLanguage(before, 'fr-FR');
    const doc = await PDFDocument.load(after);
    const lang = doc.catalog.lookup(PDFName.of('Lang'));
    expect(lang?.toString()).toContain('fr-FR');
  });

  it('sets language and updates bytes for PDF/UA-style identification', async () => {
    const before = await minimalPdfBuffer();
    const after = await setPdfUaIdentification(before, 'en-GB');
    expect(after.equals(before)).toBe(false);
    const doc = await PDFDocument.load(after);
    const lang = doc.catalog.lookup(PDFName.of('Lang'));
    expect(lang?.toString()).toContain('en-GB');
  });

  it('setPdfUaIdentification exposes pdfUaVersion to structure analysis', async () => {
    const before = await minimalPdfBuffer();
    const stamped = await setPdfUaIdentification(before, 'en-US');
    expect(stamped.equals(before)).toBe(false);
    const p = join(tmpdir(), `pdfaf-ua-${randomUUID()}.pdf`);
    await writeFile(p, stamped);
    try {
      const struct = await extractStructure(p);
      expect(struct.pdfUaVersion).toBeTruthy();
    } finally {
      await unlink(p).catch(() => {});
    }
  });
});
