import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { analyzeLayout } from '../../src/services/layout/layoutAnalyzer.js';

async function onePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  page.drawText('Figure 1 shows results', { x: 50, y: 300, size: 12 });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

async function threePageRepeatHeader(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const label = 'OFFICIAL REPORT HEADER LINE';
  for (let i = 0; i < 3; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(label, { x: 72, y: 740, size: 11 });
    page.drawText(`Body content page ${i + 1}`, { x: 72, y: 400, size: 12 });
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

async function threePageRepeatFooter(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const label = 'CONFIDENTIAL FOOTER STAMP';
  for (let i = 0; i < 3; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Section ${i + 1}`, { x: 72, y: 600, size: 12 });
    page.drawText(label, { x: 72, y: 48, size: 10 });
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

describe('analyzeLayout', () => {
  it('returns layout analysis for a minimal PDF', async () => {
    const buf = await onePagePdf();
    const layout = await analyzeLayout(buf, 5);
    expect(layout.columnCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(layout.zones)).toBe(true);
    expect(Array.isArray(layout.captionCandidates)).toBe(true);
    expect(layout.medianFontSizePtByPage).toBeDefined();
    expect(layout.headerFooterBandTexts).toBeDefined();
  }, 30_000);

  it('detects repeated header text as header zones on multiple pages', async () => {
    const buf = await threePageRepeatHeader();
    const layout = await analyzeLayout(buf, 20);
    const headers = layout.zones.filter(z => z.type === 'header');
    expect(headers.length).toBeGreaterThanOrEqual(1);
    const band = layout.headerFooterBandTexts.find(b => b.kind === 'header');
    expect(band?.text).toContain('OFFICIAL');
  }, 60_000);

  it('detects repeated footer text as footer zones', async () => {
    const buf = await threePageRepeatFooter();
    const layout = await analyzeLayout(buf, 20);
    const footers = layout.zones.filter(z => z.type === 'footer');
    expect(footers.length).toBeGreaterThanOrEqual(1);
    const band = layout.headerFooterBandTexts.find(b => b.kind === 'footer');
    expect(band?.text).toContain('CONFIDENTIAL');
  }, 60_000);

  it('records median font size for sampled pages', async () => {
    const buf = await threePageRepeatHeader();
    const layout = await analyzeLayout(buf, 20);
    const keys = Object.keys(layout.medianFontSizePtByPage).map(Number);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    const m0 = layout.medianFontSizePtByPage[0];
    expect(m0).toBeDefined();
    expect(m0!).toBeGreaterThan(0);
  }, 60_000);
});
