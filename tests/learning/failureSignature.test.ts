import { describe, it, expect } from 'vitest';
import { buildFailureSignature, describeSignature } from '../../src/services/learning/failureSignature.js';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';

const baseAnalysis = (over: Partial<AnalysisResult> = {}): AnalysisResult =>
  ({
    id: 'a',
    filename: 'x.pdf',
    timestamp: new Date().toISOString(),
    pageCount: 3,
    pdfClass: 'native_untagged',
    score: 40,
    grade: 'F',
    analysisDurationMs: 1,
    findings: [],
    categories: [
      { key: 'title_language', applicable: true, score: 50, severity: 'moderate', rationale: '' },
      { key: 'alt_text', applicable: true, score: 50, severity: 'moderate', rationale: '' },
    ],
    ...over,
  }) as AnalysisResult;

const baseSnapshot = (over: Partial<DocumentSnapshot> = {}): DocumentSnapshot =>
  ({
    pageCount: 3,
    textByPage: ['a'],
    textCharCount: 1,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: false,
    markInfo: null,
    lang: null,
    pdfUaVersion: null,
    headings: [],
    figures: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: null,
    pdfClass: 'native_untagged',
    imageToTextRatio: 0,
    ...over,
  }) as DocumentSnapshot;

describe('failureSignature', () => {
  it('produces the same hash when failing category order differs', () => {
    const a = baseAnalysis({
      categories: [
        { key: 'alt_text', applicable: true, score: 50, severity: 'moderate', rationale: '' },
        { key: 'title_language', applicable: true, score: 50, severity: 'moderate', rationale: '' },
      ],
    });
    const b = baseAnalysis({
      categories: [
        { key: 'title_language', applicable: true, score: 50, severity: 'moderate', rationale: '' },
        { key: 'alt_text', applicable: true, score: 50, severity: 'moderate', rationale: '' },
      ],
    });
    const snap = baseSnapshot();
    expect(buildFailureSignature(a, snap)).toBe(buildFailureSignature(b, snap));
  });

  it('differs by page bucket', () => {
    const snap1 = baseSnapshot({ pageCount: 4 });
    const snap2 = baseSnapshot({ pageCount: 8 });
    const a1 = baseAnalysis({ pageCount: 4 });
    const a2 = baseAnalysis({ pageCount: 8 });
    expect(buildFailureSignature(a1, snap1)).not.toBe(buildFailureSignature(a2, snap2));
  });

  it('differs by pdfClass', () => {
    const snap = baseSnapshot();
    const tagged = baseAnalysis({ pdfClass: 'native_tagged' });
    const untagged = baseAnalysis({ pdfClass: 'native_untagged' });
    expect(buildFailureSignature(tagged, { ...snap, pdfClass: 'native_tagged' })).not.toBe(
      buildFailureSignature(untagged, snap),
    );
  });

  it('describeSignature marks scanned and structure tree', () => {
    const scanned = baseAnalysis({ pdfClass: 'scanned' });
    const snap = baseSnapshot({ structureTree: { type: 'Document', children: [] } });
    const d = describeSignature(scanned, snap);
    expect(d.isScanned).toBe(true);
    expect(d.hasStructureTree).toBe(true);
    expect(d.failingCategories).toEqual(['alt_text', 'title_language']);
  });
});
