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

import { chatCompletionToolCall } from '../../src/services/semantic/openAiCompatClient.js';
import { runPythonMutationBatch } from '../../src/python/bridge.js';
import { analyzePdf } from '../../src/services/pdfAnalyzer.js';
import { applySemanticHeadingRepairs } from '../../src/services/semantic/headingSemantic.js';
import { score } from '../../src/services/scorer/scorer.js';
import type { DocumentSnapshot } from '../../src/types.js';

const META = { id: 'h1', filename: 'h.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

function snapGoodSinglePage(): DocumentSnapshot {
  return {
    pageCount: 1,
    textByPage: ['Hello'],
    textCharCount: 5,
    imageOnlyPageCount: 0,
    metadata: { title: 'Report', language: 'en', author: '', subject: '' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en',
    pdfUaVersion: '1',
    structTitle: 'Report',
    headings: [{ level: 1, text: 'Report', page: 0, structRef: '20_0' }],
    figures: [],
    tables: [],
    fonts: [{ name: 'Arial', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
  };
}

describe('applySemanticHeadingRepairs', () => {
  beforeEach(() => {
    vi.mocked(chatCompletionToolCall).mockReset();
    vi.mocked(runPythonMutationBatch).mockReset();
    vi.mocked(analyzePdf).mockReset();
  });

  it('skips when heading_structure score is already sufficient', async () => {
    const snap = snapGoodSinglePage();
    const analysis = score(snap, META);
    const hs = analysis.categories.find(c => c.key === 'heading_structure');
    expect(hs?.score).toBeGreaterThanOrEqual(90);
    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticHeadingRepairs({
      buffer: buf,
      filename: 'h.pdf',
      analysis,
      snapshot: snap,
    });
    expect(out.summary.skippedReason).toBe('heading_structure_sufficient');
    expect(out.buffer.equals(buf)).toBe(true);
  });

  it('applies heading mutations when LLM proposes level changes', async () => {
    const snap = snapGoodSinglePage();
    const badSnap: DocumentSnapshot = {
      ...snap,
      pdfClass: 'native_untagged',
      isTagged: false,
      textCharCount: 200,
      pageCount: 4,
      textByPage: Array(4).fill('Body'),
      headings: [
        { level: 1, text: 'Report', page: 0, structRef: '20_0' },
        { level: 4, text: 'Background', page: 1, structRef: '21_0' },
      ],
    };
    const analysis = score(badSnap, META);
    const hs = analysis.categories.find(c => c.key === 'heading_structure');
    expect(hs?.score).toBeLessThan(90);

    vi.mocked(chatCompletionToolCall).mockResolvedValue({
      endpoint: { baseUrl: 'x', apiKey: 'k', model: 'm', label: 'primary' },
      payload: {
        name: 'propose_heading_levels',
        arguments: {
          proposals: [{ id: '21_0', proposedLevel: 2, confidence: 0.9 }],
        },
      },
    });
    const mutated = Buffer.from('%PDF-heading');
    vi.mocked(runPythonMutationBatch).mockResolvedValue({
      buffer: mutated,
      result: { success: true, applied: ['set_heading_level'], failed: [] },
    });
    const improved = { ...analysis, score: Math.min(100, analysis.score + 3) };
    vi.mocked(analyzePdf).mockResolvedValue({ result: improved, snapshot: badSnap });

    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticHeadingRepairs({
      buffer: buf,
      filename: 'h.pdf',
      analysis,
      snapshot: badSnap,
    });
    expect(out.summary.skippedReason).toBe('completed');
    expect(out.buffer.equals(mutated)).toBe(true);
    expect(chatCompletionToolCall).toHaveBeenCalled();
  });

  it('reverts on score regression after heading apply', async () => {
    const snap = snapGoodSinglePage();
    const badSnap: DocumentSnapshot = {
      ...snap,
      pdfClass: 'native_untagged',
      textCharCount: 200,
      pageCount: 4,
      textByPage: Array(4).fill('Body'),
      headings: [
        { level: 1, text: 'Report', page: 0, structRef: '20_0' },
        { level: 4, text: 'Background', page: 1, structRef: '21_0' },
      ],
    };
    const analysis = score(badSnap, META);
    vi.mocked(chatCompletionToolCall).mockResolvedValue({
      endpoint: { baseUrl: 'x', apiKey: 'k', model: 'm', label: 'primary' },
      payload: {
        name: 'propose_heading_levels',
        arguments: {
          proposals: [{ id: '21_0', proposedLevel: 2, confidence: 0.95 }],
        },
      },
    });
    vi.mocked(runPythonMutationBatch).mockResolvedValue({
      buffer: Buffer.from('x'),
      result: { success: true, applied: ['set_heading_level'], failed: [] },
    });
    vi.mocked(analyzePdf).mockResolvedValue({
      result: { ...analysis, score: analysis.score - 15 },
      snapshot: badSnap,
    });
    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticHeadingRepairs({
      buffer: buf,
      filename: 'h.pdf',
      analysis,
      snapshot: badSnap,
    });
    expect(out.summary.skippedReason).toBe('regression_reverted');
    expect(out.buffer.equals(buf)).toBe(true);
  });

  it('returns llm_timeout when LLM batch fails with timeout', async () => {
    const snap = snapGoodSinglePage();
    const badSnap: DocumentSnapshot = {
      ...snap,
      pdfClass: 'native_untagged',
      textCharCount: 200,
      pageCount: 12,
      textByPage: Array(12).fill('Body'),
      headings: [
        { level: 1, text: 'Report', page: 0, structRef: '20_0' },
        { level: 4, text: 'Background', page: 1, structRef: '21_0' },
      ],
    };
    const analysis = score(badSnap, META);
    vi.mocked(chatCompletionToolCall).mockRejectedValue(new Error('timeout'));
    const buf = Buffer.from('%PDF-1.4\n');
    const out = await applySemanticHeadingRepairs({
      buffer: buf,
      filename: 'h.pdf',
      analysis,
      snapshot: badSnap,
    });
    expect(out.summary.skippedReason).toBe('llm_timeout');
    expect(runPythonMutationBatch).not.toHaveBeenCalled();
  });
});
