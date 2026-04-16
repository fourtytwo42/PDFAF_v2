import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/semantic/openAiCompatClient.js', () => ({
  chatCompletionToolCall: vi.fn(),
}));

vi.mock('../../src/python/bridge.js', () => ({
  runPythonMutationBatch: vi.fn(),
}));

vi.mock('../../src/services/pdfAnalyzer.js', () => ({
  analyzePdf: vi.fn(),
}));

vi.mock('../../src/services/layout/layoutAnalyzer.js', () => ({
  analyzeLayout: vi.fn(),
}));

import { chatCompletionToolCall } from '../../src/services/semantic/openAiCompatClient.js';
import { runPythonMutationBatch } from '../../src/python/bridge.js';
import { analyzePdf } from '../../src/services/pdfAnalyzer.js';
import { analyzeLayout } from '../../src/services/layout/layoutAnalyzer.js';
import {
  applySemanticPromoteHeadingRepairs,
  filterPromoteCandidatesByLayout,
} from '../../src/services/semantic/promoteHeadingSemantic.js';
import { score } from '../../src/services/scorer/scorer.js';
import type { DocumentSnapshot } from '../../src/types.js';

const META = { id: 'p1', filename: 'p.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

function snapWithParagraphs(
  paragraphs: NonNullable<DocumentSnapshot['paragraphStructElems']>,
  overrides: Partial<DocumentSnapshot> = {},
): DocumentSnapshot {
  return {
    pageCount: 3,
    textByPage: ['A', 'B', 'C'],
    textCharCount: 3,
    imageOnlyPageCount: 0,
    metadata: { title: 'Report', language: 'en' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en',
    pdfUaVersion: '1',
    structTitle: 'Report',
    headings: [{ level: 1, text: 'Report', page: 0, structRef: '10_0' }],
    figures: [],
    tables: [],
    paragraphStructElems: paragraphs,
    fonts: [{ name: 'Arial', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...overrides,
  };
}

const emptyLayoutFields = {
  medianFontSizePtByPage: {} as Record<number, number>,
  headerFooterBandTexts: [] as Array<{ pageNumber: number; kind: 'header' | 'footer'; text: string }>,
};

describe('filterPromoteCandidatesByLayout', () => {
  it('returns all candidates when layout has no header/footer band texts', () => {
    const cands = [{ structRef: '1_0', text: 'Introduction chapter', page: 0 }];
    const out = filterPromoteCandidatesByLayout(cands, {
      isMultiColumn: false,
      columnCount: 1,
      zones: [{ type: 'unknown', pageNumber: 0, bbox: [0, 0, 100, 100] }],
      captionCandidates: [],
      ...emptyLayoutFields,
    });
    expect(out).toEqual(cands);
  });

  it('returns all when typed header zones exist but bandTexts empty', () => {
    const cands = [{ structRef: '1_0', text: 'Section title here', page: 0 }];
    const out = filterPromoteCandidatesByLayout(cands, {
      isMultiColumn: false,
      columnCount: 1,
      zones: [{ type: 'header', pageNumber: 0, bbox: [0, 0, 100, 20] }],
      captionCandidates: [],
      ...emptyLayoutFields,
    });
    expect(out).toEqual(cands);
  });

  it('drops candidates whose bbox intersects a typed header/footer zone on the same page', () => {
    const cands = [
      { structRef: '1_0', text: 'Unique heading text xyz', page: 0, bbox: [40, 700, 400, 760] as const },
      { structRef: '2_0', text: 'Body in footer band', page: 0, bbox: [40, 20, 400, 50] as const },
    ];
    const out = filterPromoteCandidatesByLayout(cands, {
      isMultiColumn: false,
      columnCount: 1,
      zones: [{ type: 'footer', pageNumber: 0, bbox: [0, 0, 612, 80] }],
      captionCandidates: [],
      medianFontSizePtByPage: {},
      headerFooterBandTexts: [],
    });
    expect(out.map(c => c.structRef)).toEqual(['1_0']);
  });

  it('drops candidates whose text matches repeated header/footer band on same page', () => {
    const cands = [
      { structRef: '1_0', text: 'OFFICIAL REPORT HEADER LINE', page: 0 },
      { structRef: '2_0', text: 'Real section title', page: 0 },
    ];
    const out = filterPromoteCandidatesByLayout(cands, {
      isMultiColumn: false,
      columnCount: 1,
      zones: [],
      captionCandidates: [],
      medianFontSizePtByPage: {},
      headerFooterBandTexts: [{ pageNumber: 0, kind: 'header', text: 'OFFICIAL REPORT HEADER LINE' }],
    });
    expect(out.map(c => c.structRef)).toEqual(['2_0']);
  });
});

describe('applySemanticPromoteHeadingRepairs', () => {
  beforeEach(() => {
    vi.mocked(chatCompletionToolCall).mockReset();
    vi.mocked(runPythonMutationBatch).mockReset();
    vi.mocked(analyzePdf).mockReset();
    vi.mocked(analyzeLayout).mockResolvedValue({
      isMultiColumn: false,
      columnCount: 1,
      zones: [],
      captionCandidates: [],
      medianFontSizePtByPage: {},
      headerFooterBandTexts: [],
    });
  });

  it('skips when heading_structure score is already sufficient', async () => {
    const snap = snapWithParagraphs([
      { tag: 'P', text: 'Body', page: 1, structRef: '20_0' },
    ]);
    const analysis = score(snap, META);
    const hs = analysis.categories.find(c => c.key === 'heading_structure');
    expect(hs?.score).toBeGreaterThanOrEqual(90);
    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticPromoteHeadingRepairs({
      buffer: buf,
      filename: 'p.pdf',
      analysis,
      snapshot: snap,
    });
    expect(out.summary.skippedReason).toBe('heading_structure_sufficient');
    expect(out.buffer.equals(buf)).toBe(true);
  });

  it('skips paragraph roles outside P / Span / Div allowlist', async () => {
    const snap = snapWithParagraphs([{ tag: 'LBody', text: 'Section', page: 0, structRef: '5_0' }], {
      pageCount: 12,
      textByPage: Array(12).fill('x'),
    });
    const analysis = score(snap, META);
    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticPromoteHeadingRepairs({
      buffer: buf,
      filename: 'p.pdf',
      analysis,
      snapshot: snap,
    });
    expect(out.summary.skippedReason).toBe('no_candidates');
  });

  it('applies retag_struct_as_heading when LLM proposes promotions', async () => {
    const snap = snapWithParagraphs(
      [
        { tag: 'P', text: 'Introduction', page: 0, structRef: '30_0' },
        { tag: 'P', text: 'Long body text '.repeat(20), page: 1, structRef: '31_0' },
      ],
      {
        pageCount: 12,
        textByPage: Array(12).fill('body'),
        pdfClass: 'native_untagged',
        isTagged: false,
        textCharCount: 200,
      },
    );
    const analysis = score(snap, META);
    const hs = analysis.categories.find(c => c.key === 'heading_structure');
    expect(hs?.score).toBeLessThan(90);

    vi.mocked(chatCompletionToolCall).mockResolvedValue({
      endpoint: { baseUrl: 'x', apiKey: 'k', model: 'm', label: 'primary' },
      payload: {
        name: 'propose_promote_to_heading',
        arguments: {
          proposals: [{ id: '30_0', level: 2, confidence: 0.95 }],
        },
      },
    });
    const mutated = Buffer.from('%PDF-promote');
    vi.mocked(runPythonMutationBatch).mockResolvedValue({
      buffer: mutated,
      result: { success: true, applied: ['retag_struct_as_heading'], failed: [] },
    });
    const improved = { ...analysis, score: Math.min(100, analysis.score + 2) };
    vi.mocked(analyzePdf).mockResolvedValue({ result: improved, snapshot: snap });

    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticPromoteHeadingRepairs({
      buffer: buf,
      filename: 'p.pdf',
      analysis,
      snapshot: snap,
    });
    expect(out.summary.skippedReason).toBe('completed');
    expect(out.buffer.equals(mutated)).toBe(true);
    expect(runPythonMutationBatch).toHaveBeenCalledWith(
      buf,
      [{ op: 'retag_struct_as_heading', params: { structRef: '30_0', level: 2 } }],
      expect.any(Object),
    );
  });

  it('reverts on score regression after promote apply', async () => {
    const snap = snapWithParagraphs(
      [{ tag: 'P', text: 'Methods', page: 2, structRef: '40_0' }],
      { pageCount: 12, textByPage: Array(12).fill('body') },
    );
    const analysis = score(snap, META);
    vi.mocked(chatCompletionToolCall).mockResolvedValue({
      endpoint: { baseUrl: 'x', apiKey: 'k', model: 'm', label: 'primary' },
      payload: {
        name: 'propose_promote_to_heading',
        arguments: {
          proposals: [{ id: '40_0', level: 3, confidence: 0.95 }],
        },
      },
    });
    vi.mocked(runPythonMutationBatch).mockResolvedValue({
      buffer: Buffer.from('x'),
      result: { success: true, applied: ['retag_struct_as_heading'], failed: [] },
    });
    vi.mocked(analyzePdf).mockResolvedValue({
      result: { ...analysis, score: analysis.score - 15 },
      snapshot: snap,
    });
    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticPromoteHeadingRepairs({
      buffer: buf,
      filename: 'p.pdf',
      analysis,
      snapshot: snap,
    });
    expect(out.summary.skippedReason).toBe('regression_reverted');
    expect(out.buffer.equals(buf)).toBe(true);
  });

  it('returns llm_timeout when LLM batch fails with timeout', async () => {
    const snap = snapWithParagraphs(
      [{ tag: 'P', text: 'Methods', page: 2, structRef: '40_0' }],
      { pageCount: 12, textByPage: Array(12).fill('body') },
    );
    const analysis = score(snap, META);
    vi.mocked(chatCompletionToolCall).mockRejectedValue(new Error('AbortError'));
    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticPromoteHeadingRepairs({
      buffer: buf,
      filename: 'p.pdf',
      analysis,
      snapshot: snap,
    });
    expect(out.summary.skippedReason).toBe('llm_timeout');
    expect(runPythonMutationBatch).not.toHaveBeenCalled();
  });
});
