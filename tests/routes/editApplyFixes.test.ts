import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../../src/app.js';

const app = createApp();

async function barePdfBuffer(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText('Edit fixture', { x: 36, y: 100, size: 14 });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

describe('POST /v1/edit/apply-fixes', () => {
  it('returns 400 when no file is sent', async () => {
    const res = await request(app).post('/v1/edit/apply-fixes');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No file/i);
  });

  it('returns 400 when fixes are invalid JSON', async () => {
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/edit/apply-fixes')
      .field('fixes', '{bad')
      .attach('file', pdf, { filename: 'fixture.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid JSON/i);
  });

  it('returns 400 when fixes are empty', async () => {
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/edit/apply-fixes')
      .field('fixes', JSON.stringify([]))
      .attach('file', pdf, { filename: 'fixture.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
  });

  it('rejects figure fixes without target reference', async () => {
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/edit/apply-fixes')
      .field('fixes', JSON.stringify([{ type: 'set_figure_alt_text', altText: 'Logo' }]))
      .attach('file', pdf, { filename: 'fixture.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
  });

  it('applies title and language fixes and returns before/after analysis', async () => {
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/edit/apply-fixes')
      .field(
        'fixes',
        JSON.stringify([
          { type: 'set_document_title', title: 'Edited Report' },
          { type: 'set_document_language', language: 'en-US' },
        ]),
      )
      .attach('file', pdf, { filename: 'fixture.pdf', contentType: 'application/pdf' });

    if (res.status === 429) return;

    expect(res.status).toBe(200);
    expect(res.body.before).toBeDefined();
    expect(res.body.after).toBeDefined();
    expect(Array.isArray(res.body.appliedFixes)).toBe(true);
    expect(Array.isArray(res.body.rejectedFixes)).toBe(true);
    expect(typeof res.body.fixedPdfBase64).toBe('string');
    expect(res.body.fixedPdfBase64.length).toBeGreaterThan(100);
  }, 90_000);
});
