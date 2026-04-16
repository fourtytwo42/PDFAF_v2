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
  analyzeLayout: vi.fn().mockResolvedValue({
    isMultiColumn: false,
    columnCount: 1,
    zones: [],
    captionCandidates: [],
    medianFontSizePtByPage: {},
    headerFooterBandTexts: [],
  }),
}));

import { chatCompletionToolCall } from '../../src/services/semantic/openAiCompatClient.js';
import { runPythonMutationBatch } from '../../src/python/bridge.js';
import { analyzePdf } from '../../src/services/pdfAnalyzer.js';
import { applySemanticUntaggedHeadingRepairs } from '../../src/services/semantic/untaggedHeadingSemantic.js';
import { score } from '../../src/services/scorer/scorer.js';
import type { DocumentSnapshot } from '../../src/types.js';

const META = { id: 'u1', filename: 'u.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

function goldenSnap(structRef: string): DocumentSnapshot {
  return {
    pageCount: 1,
    textByPage: ['Golden Title'],
    textCharCount: 12,
    imageOnlyPageCount: 0,
    metadata: { title: 'G', language: 'en' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en',
    pdfUaVersion: null,
    headings: [],
    figures: [],
    tables: [],
    paragraphStructElems: [{ tag: 'P', text: 'Golden Title', page: 0, structRef }],
    threeCcGoldenV1: true,
    mcidTextSpans: [{ page: 0, mcid: 0, snippet: '/MCID 0' }],
    fonts: [{ name: 'Helvetica', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
  };
}

describe('applySemanticUntaggedHeadingRepairs', () => {
  beforeEach(() => {
    vi.mocked(chatCompletionToolCall).mockReset();
    vi.mocked(runPythonMutationBatch).mockReset();
    vi.mocked(analyzePdf).mockReset();
  });

  it('skips with unsupported_pdf when not golden fixture', async () => {
    const snap = goldenSnap('9_0');
    const bad = { ...snap, threeCcGoldenV1: false };
    const analysis = score(bad, META);
    const buf = Buffer.from('%PDF');
    const out = await applySemanticUntaggedHeadingRepairs({
      buffer: buf,
      filename: 'u.pdf',
      analysis,
      snapshot: bad,
    });
    expect(out.summary.skippedReason).toBe('unsupported_pdf');
  });

  it('tier2: applies retag_struct_as_heading when PDFAF_SEMANTIC_UNTAGGED_TIER2=1', async () => {
    const prev = process.env.PDFAF_SEMANTIC_UNTAGGED_TIER2;
    process.env.PDFAF_SEMANTIC_UNTAGGED_TIER2 = '1';
    const snap = { ...goldenSnap('9_0'), threeCcGoldenV1: false, threeCcGoldenOrphanV1: false };
    const analysis = score(snap, META);
    vi.mocked(chatCompletionToolCall).mockResolvedValue({
      endpoint: { baseUrl: 'x', apiKey: 'k', model: 'm', label: 'primary' },
      payload: {
        name: 'propose_untagged_heading_promote',
        arguments: {
          proposals: [{ id: '9_0', level: 2, confidence: 0.95 }],
        },
      },
    });
    const mutated = Buffer.from('%PDF-tier2');
    vi.mocked(runPythonMutationBatch).mockResolvedValue({
      buffer: mutated,
      result: { success: true, applied: ['retag_struct_as_heading'], failed: [] },
    });
    const improved = { ...analysis, score: Math.min(100, analysis.score + 5) };
    vi.mocked(analyzePdf).mockResolvedValue({ result: improved, snapshot: snap });
    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticUntaggedHeadingRepairs({
      buffer: buf,
      filename: 'u.pdf',
      analysis,
      snapshot: snap,
    });
    expect(out.summary.skippedReason).toBe('completed');
    expect(runPythonMutationBatch).toHaveBeenCalledWith(
      buf,
      [{ op: 'retag_struct_as_heading', params: { structRef: '9_0', level: 2 } }],
      expect.any(Object),
    );
    if (prev === undefined) delete process.env.PDFAF_SEMANTIC_UNTAGGED_TIER2;
    else process.env.PDFAF_SEMANTIC_UNTAGGED_TIER2 = prev;
  });

  it('applies golden_v1_promote_p_to_heading on golden PDF path', async () => {
    const snap = goldenSnap('9_0');
    const analysis = score(snap, META);
    vi.mocked(chatCompletionToolCall).mockResolvedValue({
      endpoint: { baseUrl: 'x', apiKey: 'k', model: 'm', label: 'primary' },
      payload: {
        name: 'propose_untagged_heading_promote',
        arguments: {
          proposals: [{ id: '9_0', level: 2, confidence: 0.95 }],
        },
      },
    });
    const mutated = Buffer.from('%PDF-mut');
    vi.mocked(runPythonMutationBatch).mockResolvedValue({
      buffer: mutated,
      result: { success: true, applied: ['golden_v1_promote_p_to_heading'], failed: [] },
    });
    const improved = { ...analysis, score: Math.min(100, analysis.score + 5) };
    vi.mocked(analyzePdf).mockResolvedValue({ result: improved, snapshot: snap });
    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticUntaggedHeadingRepairs({
      buffer: buf,
      filename: 'u.pdf',
      analysis,
      snapshot: snap,
    });
    expect(out.summary.skippedReason).toBe('completed');
    expect(runPythonMutationBatch).toHaveBeenCalledWith(
      buf,
      [{ op: 'golden_v1_promote_p_to_heading', params: { structRef: '9_0', level: 2 } }],
      expect.any(Object),
    );
  });
});
