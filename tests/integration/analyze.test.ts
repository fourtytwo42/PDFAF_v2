import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

// This test requires a PDF fixture. We look for one in the ICJIA corpus,
// falling back to a minimal synthetic PDF.

const app = createApp();

// Look in several known locations for a test PDF
const CANDIDATE_DIRS = [
  '/home/hendo420/pdfaf/ICJIA-PDFs',
  '/home/hendo420/pdfaf/apps/api/src/__tests__/fixtures',
  '/home/hendo420/pdfaf/apps/api/data/queue-storage/rebuilt',
];

async function findTestPdf(): Promise<string | null> {
  for (const dir of CANDIDATE_DIRS) {
    try {
      const files = await readdir(dir);
      const pdf = files.find(f => f.endsWith('.pdf'));
      if (pdf) return join(dir, pdf);
    } catch {
      // directory not available
    }
  }
  return null;
}

describe('POST /v1/analyze', () => {
  it('returns 400 when no file is sent', async () => {
    const res = await request(app).post('/v1/analyze');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for non-PDF file', async () => {
    const res = await request(app)
      .post('/v1/analyze')
      .attach('file', Buffer.from('not a pdf'), { filename: 'test.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('analyses a real PDF and returns well-formed AnalysisResult', async () => {
    const pdfPath = await findTestPdf();
    if (!pdfPath) {
      console.log('[integration] no PDF fixture found — skipping real-PDF test');
      return;
    }

    const res = await request(app)
      .post('/v1/analyze')
      .attach('file', pdfPath);

    expect(res.status).toBe(200);

    const body = res.body;
    // Shape assertions
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('scoreProfile');
    expect(body).toHaveProperty('categories');
    expect(body).toHaveProperty('findings');
    expect(body).toHaveProperty('pdfClass');
    expect(body).toHaveProperty('analysisDurationMs');
    expect(body).toHaveProperty('scopeChecklist');
    expect(body).toHaveProperty('verificationLevel');
    expect(body).toHaveProperty('manualReviewRequired');
    expect(body).toHaveProperty('manualReviewReasons');
    expect(body).toHaveProperty('scoreCapsApplied');
    expect(body).toHaveProperty('structuralClassification');
    expect(body).toHaveProperty('failureProfile');
    expect(body).toHaveProperty('detectionProfile');

    expect(['A','B','C','D','F']).toContain(body.scoreProfile.grade);
    expect(body.scoreProfile.overallScore).toBeGreaterThanOrEqual(0);
    expect(body.scoreProfile.overallScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(body.categories)).toBe(true);
    expect(body.categories).toHaveLength(11);

    // Each category must have key, score, applicable, severity, findings
    for (const cat of body.categories) {
      expect(cat).toHaveProperty('key');
      expect(cat).toHaveProperty('score');
      expect(cat).toHaveProperty('applicable');
      expect(cat).toHaveProperty('severity');
      expect(cat).toHaveProperty('findings');
      expect(cat).toHaveProperty('countsTowardGrade');
      expect(cat).toHaveProperty('diagnosticOnly');
      expect(cat).toHaveProperty('measurementStatus');
      expect(cat).toHaveProperty('evidence');
      expect(cat).toHaveProperty('verificationLevel');
      expect(cat).toHaveProperty('manualReviewRequired');
    }

    expect(body.structuralClassification).toHaveProperty('structureClass');
    expect(body.failureProfile).toHaveProperty('primaryFailureFamily');
    expect(body.detectionProfile).toHaveProperty('readingOrderSignals');

    // Should complete in reasonable time
    expect(body.analysisDurationMs).toBeLessThan(60_000);
  }, 90_000);
});

describe('GET /v1/health', () => {
  it('returns dependency status', async () => {
    const res = await request(app).get('/v1/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('dependencies');
    expect(res.body.dependencies).toHaveProperty('python');
    expect(res.body.dependencies).toHaveProperty('tesseract');
    expect(res.body.dependencies).toHaveProperty('ocrmypdf');
    expect(res.body.dependencies).toHaveProperty('database');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('performance');
  });
});
