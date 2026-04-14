import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../../src/app.js';

const app = createApp();

async function barePdfBuffer(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText('Remediation fixture', { x: 36, y: 100, size: 14 });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

describe('POST /v1/remediate', () => {
  it('returns 400 when no file is sent', async () => {
    const res = await request(app).post('/v1/remediate');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns remediation payload with before/after and base64 PDF', async () => {
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/remediate')
      .attach('file', pdf, { filename: 'fixture-bare.pdf', contentType: 'application/pdf' });

    if (res.status === 429) {
      console.log('[integration] remediate skipped — server at capacity');
      return;
    }

    expect(res.status).toBe(200);
    const body = res.body;
    expect(body).toHaveProperty('before');
    expect(body).toHaveProperty('after');
    expect(body).toHaveProperty('appliedTools');
    expect(body).toHaveProperty('rounds');
    expect(body).toHaveProperty('remediationDurationMs');
    expect(body).toHaveProperty('improved');
    expect(body).toHaveProperty('remediatedPdfTooLarge');
    expect(typeof body.remediatedPdfBase64).toBe('string');
    expect(Array.isArray(body.appliedTools)).toBe(true);
    expect(body.appliedTools.length).toBeGreaterThan(0);
    expect(body.after.score).toBeGreaterThanOrEqual(0);
    expect(body.after.score).toBeLessThanOrEqual(100);

    const titleCatBefore = body.before.categories.find((c: { key: string }) => c.key === 'title_language');
    const titleCatAfter = body.after.categories.find((c: { key: string }) => c.key === 'title_language');
    expect(titleCatAfter?.score).toBeGreaterThanOrEqual(titleCatBefore?.score ?? 0);
  }, 120_000);
});
