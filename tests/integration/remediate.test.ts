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

  it('includes htmlReport when options.htmlReport is true', async () => {
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/remediate')
      .field('options', JSON.stringify({ htmlReport: true, maxRounds: 1 }))
      .attach('file', pdf, { filename: 'fixture-html.pdf', contentType: 'application/pdf' });
    if (res.status === 429) return;
    expect(res.status).toBe(200);
    expect(typeof res.body.htmlReport).toBe('string');
    expect(res.body.htmlReport.length).toBeGreaterThan(100);
    expect(res.body.htmlReport).toContain('<!DOCTYPE html>');
  }, 120_000);

  it('returns 400 when options is not valid JSON', async () => {
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/remediate')
      .field('options', '{not json')
      .attach('file', pdf, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid JSON/i);
  });

  it('returns 400 when options fails schema (strict)', async () => {
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/remediate')
      .field('options', JSON.stringify({ semantic: true, unknownKey: 1 }))
      .attach('file', pdf, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  it('includes semantic summary when semantic true and LLM base URL is unset', async () => {
    if (process.env['OPENAI_COMPAT_BASE_URL']) {
      console.log('[integration] OPENAI_COMPAT_BASE_URL set — skipping no_llm_config assertion');
      return;
    }
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/remediate')
      .field('options', JSON.stringify({ semantic: true }))
      .attach('file', pdf, { filename: 'x.pdf', contentType: 'application/pdf' });
    if (res.status === 429) return;
    expect(res.status).toBe(200);
    expect(res.body.semantic).toBeDefined();
    expect(res.body.semantic.skippedReason).toBe('no_llm_config');
  }, 120_000);

  it('includes semanticHeadings summary when requested without LLM base URL', async () => {
    if (process.env['OPENAI_COMPAT_BASE_URL']) {
      console.log('[integration] OPENAI_COMPAT_BASE_URL set — skipping heading no_llm assertion');
      return;
    }
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/remediate')
      .field('options', JSON.stringify({ semanticHeadings: true }))
      .attach('file', pdf, { filename: 'x.pdf', contentType: 'application/pdf' });
    if (res.status === 429) return;
    expect(res.status).toBe(200);
    expect(res.body.semanticHeadings).toBeDefined();
    expect(res.body.semanticHeadings.skippedReason).toBe('no_llm_config');
  }, 120_000);

  it('accepts semanticHeadingTimeoutMs in options', async () => {
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/remediate')
      .field(
        'options',
        JSON.stringify({ semanticHeadings: true, semanticHeadingTimeoutMs: 60000 }),
      )
      .attach('file', pdf, { filename: 'x.pdf', contentType: 'application/pdf' });
    if (res.status === 429) return;
    expect(res.status).toBe(200);
  }, 120_000);

  it('includes semanticPromoteHeadings summary when requested without LLM base URL', async () => {
    if (process.env['OPENAI_COMPAT_BASE_URL']) {
      console.log('[integration] OPENAI_COMPAT_BASE_URL set — skipping promote no_llm assertion');
      return;
    }
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/remediate')
      .field('options', JSON.stringify({ semanticPromoteHeadings: true }))
      .attach('file', pdf, { filename: 'x.pdf', contentType: 'application/pdf' });
    if (res.status === 429) return;
    expect(res.status).toBe(200);
    expect(res.body.semanticPromoteHeadings).toBeDefined();
    expect(res.body.semanticPromoteHeadings.skippedReason).toBe('no_llm_config');
  }, 120_000);

  it('accepts semanticPromoteHeadingTimeoutMs in options', async () => {
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/remediate')
      .field(
        'options',
        JSON.stringify({ semanticPromoteHeadings: true, semanticPromoteHeadingTimeoutMs: 60000 }),
      )
      .attach('file', pdf, { filename: 'x.pdf', contentType: 'application/pdf' });
    if (res.status === 429) return;
    expect(res.status).toBe(200);
  }, 120_000);

  it('includes semanticUntaggedHeadings summary when requested without LLM base URL', async () => {
    if (process.env['OPENAI_COMPAT_BASE_URL']) {
      console.log('[integration] OPENAI_COMPAT_BASE_URL set — skipping untagged no_llm assertion');
      return;
    }
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/remediate')
      .field('options', JSON.stringify({ semanticUntaggedHeadings: true }))
      .attach('file', pdf, { filename: 'x.pdf', contentType: 'application/pdf' });
    if (res.status === 429) return;
    expect(res.status).toBe(200);
    expect(res.body.semanticUntaggedHeadings).toBeDefined();
    expect(res.body.semanticUntaggedHeadings.skippedReason).toBe('no_llm_config');
  }, 120_000);

  it('accepts semanticUntaggedHeadingTimeoutMs in options', async () => {
    const pdf = await barePdfBuffer();
    const res = await request(app)
      .post('/v1/remediate')
      .field(
        'options',
        JSON.stringify({ semanticUntaggedHeadings: true, semanticUntaggedHeadingTimeoutMs: 60000 }),
      )
      .attach('file', pdf, { filename: 'x.pdf', contentType: 'application/pdf' });
    if (res.status === 429) return;
    expect(res.status).toBe(200);
  }, 120_000);
});
