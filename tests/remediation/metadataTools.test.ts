import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
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
});
