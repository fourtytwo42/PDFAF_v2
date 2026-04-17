import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/layout/layoutAnalyzer.js', () => ({
  analyzeLayout: vi.fn().mockResolvedValue({
    isMultiColumn: false,
    columnCount: 1,
    zones: [],
    captionCandidates: [],
    medianFontSizePtByPage: {},
    headerFooterBandTexts: [],
  }),
}));

vi.mock('../../src/services/semantic/pdfPageRender.js', () => ({
  renderPageToJpegDataUrl: vi.fn().mockResolvedValue(
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  ),
}));

vi.mock('../../src/python/bridge.js', () => ({
  runPythonMutationBatch: vi.fn(),
}));

vi.mock('../../src/services/pdfAnalyzer.js', () => ({
  analyzePdf: vi.fn(),
}));

vi.mock('../../src/services/remediation/orchestrator.js', () => ({
  remediatePdf: vi.fn(),
}));

import { analyzePdf } from '../../src/services/pdfAnalyzer.js';
import { runPythonMutationBatch } from '../../src/python/bridge.js';
import { remediatePdf } from '../../src/services/remediation/orchestrator.js';
import { score } from '../../src/services/scorer/scorer.js';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';
const META = { id: 'llm-int', filename: 'llm.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

async function barePdfBuffer(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText('Semantic LLM fixture', { x: 36, y: 100, size: 14 });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

function snapWithManyFiguresNoAlt(): DocumentSnapshot {
  const figures = Array.from({ length: 30 }, (_, i) => ({
    hasAlt: false,
    isArtifact: false,
    page: i % 20,
    structRef: `${200 + i}_0`,
  }));
  return {
    pageCount: 20,
    textByPage: Array(20).fill('hello world'),
    textCharCount: 220,
    imageOnlyPageCount: 0,
    metadata: { title: 'Doc', language: 'en', author: '', subject: '' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en',
    pdfUaVersion: '1',
    structTitle: 'Doc',
    headings: [],
    figures,
    tables: [],
    fonts: [{ name: 'Arial', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
  };
}

describe('POST /v1/remediate with configured LLM', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...prev,
      OPENAI_COMPAT_BASE_URL: 'http://llm.example/v1',
      OPENAI_COMPAT_MODEL: 'test-model',
      OPENAI_COMPAT_API_KEY: 'secret',
      SEMANTIC_REMEDIATE_FIGURE_PASSES: '1',
    };
    vi.mocked(analyzePdf).mockReset();
    vi.mocked(remediatePdf).mockReset();
    vi.mocked(runPythonMutationBatch).mockReset();
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.unstubAllGlobals();
  });

  it('returns a completed semantic summary when the fake LLM proposes alt text', async () => {
    const snapshot = snapWithManyFiguresNoAlt();
    const initialAnalysis = score(snapshot, META);
    const improvedAnalysis: AnalysisResult = {
      ...initialAnalysis,
      score: Math.min(100, initialAnalysis.score + 5),
    };
    const pdf = await barePdfBuffer();
    const mutated = Buffer.from('%PDF-mutated');
    const { createApp } = await import('../../src/app.js');
    const app = createApp();

    vi.mocked(analyzePdf)
      .mockResolvedValueOnce({ result: initialAnalysis, snapshot })
      .mockResolvedValue({ result: improvedAnalysis, snapshot });
    vi.mocked(remediatePdf).mockResolvedValue({
      remediation: {
        before: initialAnalysis,
        after: initialAnalysis,
        improved: false,
        appliedTools: [],
        rounds: [],
        remediationDurationMs: 1,
        remediatedPdfBase64: null,
        remediatedPdfTooLarge: false,
      },
      buffer: pdf,
      snapshot,
    });
    vi.mocked(runPythonMutationBatch).mockResolvedValue({
      buffer: mutated,
      result: { success: true, applied: ['set_figure_alt_text'], failed: [] },
    });

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://llm.example/v1/chat/completions');
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer secret');
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body['model']).toBe('test-model');
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    function: {
                      name: 'propose_alt_text',
                      arguments: JSON.stringify({
                        proposals: [
                          { id: '200_0', altText: 'Revenue trend chart', confidence: 0.95, isDecorative: false },
                        ],
                      }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .post('/v1/remediate')
      .field('options', JSON.stringify({ semantic: true }))
      .attach('file', pdf, { filename: 'fixture-llm.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.semantic).toBeDefined();
    expect(res.body.semantic.skippedReason).toBe('completed');
    expect(res.body.semantic.proposalsAccepted).toBeGreaterThan(0);
    expect(res.body.semantic.batches.length).toBeGreaterThan(0);
    expect(runPythonMutationBatch).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
  }, 120_000);
});
