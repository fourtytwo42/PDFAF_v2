import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/semantic/openAiCompatClient.js', () => ({
  chatCompletionToolCall: vi.fn(),
}));

vi.mock('../../src/services/semantic/pdfPageRender.js', () => ({
  renderPageToJpegDataUrl: vi.fn().mockResolvedValue(
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  ),
}));

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

vi.mock('../../src/python/bridge.js', () => ({
  runPythonMutationBatch: vi.fn(),
}));

vi.mock('../../src/services/pdfAnalyzer.js', () => ({
  analyzePdf: vi.fn(),
}));

import { chatCompletionToolCall } from '../../src/services/semantic/openAiCompatClient.js';
import { runPythonMutationBatch } from '../../src/python/bridge.js';
import { analyzePdf } from '../../src/services/pdfAnalyzer.js';
import { applySemanticRepairs } from '../../src/services/semantic/semanticService.js';
import { score } from '../../src/services/scorer/scorer.js';
import type { DocumentSnapshot } from '../../src/types.js';

const META = { id: 's1', filename: 't.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

/** Many figures so alt_text stays below REMEDIATION_CATEGORY_THRESHOLD (bounded large-figure floor). */
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

function snapWithFigure(structRef: string): DocumentSnapshot {
  return {
    pageCount: 1,
    textByPage: ['hello world'],
    textCharCount: 11,
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
    figures: [{ hasAlt: false, isArtifact: false, page: 0, structRef }],
    tables: [],
    fonts: [{ name: 'Arial', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
  };
}

describe('applySemanticRepairs', () => {
  beforeEach(() => {
    vi.mocked(chatCompletionToolCall).mockReset();
    vi.mocked(runPythonMutationBatch).mockReset();
    vi.mocked(analyzePdf).mockReset();
  });

  it('skips when alt_text category is already sufficient', async () => {
    const snap = snapWithFigure('10_0');
    const analysis = score(snap, META);
    const alt = analysis.categories.find(c => c.key === 'alt_text');
    expect(alt?.applicable).toBe(true);
    const highFigSnap: DocumentSnapshot = {
      ...snap,
      figures: [{ hasAlt: true, altText: 'Detailed chart of revenue', isArtifact: false, page: 0, structRef: '10_0' }],
    };
    const good = score(highFigSnap, META);
    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticRepairs({
      buffer: buf,
      filename: 't.pdf',
      analysis: good,
      snapshot: highFigSnap,
    });
    expect(out.summary.skippedReason).toBe('alt_text_sufficient');
    expect(out.buffer.equals(buf)).toBe(true);
  });

  it('applies mutations and accepts when score improves', async () => {
    const snap = snapWithManyFiguresNoAlt();
    const analysis = score(snap, META);
    vi.mocked(chatCompletionToolCall).mockResolvedValue({
      endpoint: { baseUrl: 'x', apiKey: 'k', model: 'm', label: 'primary' },
      payload: {
        name: 'propose_alt_text',
        arguments: {
          proposals: [
            { id: '200_0', altText: 'Revenue trend chart', confidence: 0.95, isDecorative: false },
          ],
        },
      },
    });

    const mutated = Buffer.from('%PDF-mutated');
    vi.mocked(runPythonMutationBatch).mockResolvedValue({
      buffer: mutated,
      result: { success: true, applied: ['set_figure_alt_text'], failed: [] },
    });

    const improved = {
      ...analysis,
      score: Math.min(100, analysis.score + 5),
    };
    vi.mocked(analyzePdf).mockResolvedValue({
      result: improved,
      snapshot: snap,
    });

    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticRepairs({
      buffer: buf,
      filename: 't.pdf',
      analysis,
      snapshot: snap,
    });

    expect(out.summary.skippedReason).toBe('completed');
    expect(out.summary.proposalsAccepted).toBeGreaterThan(0);
    expect(out.buffer.equals(mutated)).toBe(true);
    expect(out.analysis.score).toBe(improved.score);
  });

  it('reverts when analyzePdf score regresses', async () => {
    const snap = snapWithManyFiguresNoAlt();
    const analysis = score(snap, META);
    vi.mocked(chatCompletionToolCall).mockResolvedValue({
      endpoint: { baseUrl: 'x', apiKey: 'k', model: 'm', label: 'primary' },
      payload: {
        name: 'propose_alt_text',
        arguments: {
          proposals: [{ id: '200_0', altText: 'x', confidence: 0.9, isDecorative: false }],
        },
      },
    });
    vi.mocked(runPythonMutationBatch).mockResolvedValue({
      buffer: Buffer.from('mut'),
      result: { success: true, applied: ['set_figure_alt_text'], failed: [] },
    });
    vi.mocked(analyzePdf).mockResolvedValue({
      result: { ...analysis, score: analysis.score - 10 },
      snapshot: snap,
    });

    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticRepairs({ buffer: buf, filename: 't.pdf', analysis, snapshot: snap });
    expect(out.summary.skippedReason).toBe('regression_reverted');
    expect(out.buffer.equals(buf)).toBe(true);
  });

  it('returns llm_timeout when a batch reports timeout-like error', async () => {
    const snap = snapWithManyFiguresNoAlt();
    const analysis = score(snap, META);
    vi.mocked(chatCompletionToolCall).mockRejectedValue(new Error('chat_completion_failed:timeout'));

    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticRepairs({ buffer: buf, filename: 't.pdf', analysis, snapshot: snap });
    expect(out.summary.skippedReason).toBe('llm_timeout');
    expect(out.buffer.equals(buf)).toBe(true);
    expect(runPythonMutationBatch).not.toHaveBeenCalled();
  });
});
