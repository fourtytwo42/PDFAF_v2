import { describe, expect, it } from 'vitest';
import type { AnalysisResult, CategoryKey, DocumentSnapshot } from '../../src/types.js';
import { classifyStage180MixedTablePdfUa } from '../../src/services/remediation/stage180MixedTablePdfua.js';

function analysis(overrides: Partial<Record<CategoryKey, number>> = {}): AnalysisResult {
  const categories: Partial<Record<CategoryKey, number>> = {
    heading_structure: 94,
    reading_order: 96,
    link_quality: 95,
    alt_text: 20,
    table_markup: 44,
    pdf_ua_compliance: 50,
    ...overrides,
  };
  return {
    score: 74,
    grade: 'C',
    pdfClass: 'native_tagged',
    categories: Object.entries(categories).map(([key, score]) => ({
      key: key as CategoryKey,
      score: score ?? 0,
      applicable: true,
    })),
    issues: [],
    suggestions: [],
    scoreCapsApplied: [],
  } as unknown as AnalysisResult;
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pdfClass: 'native_tagged',
    pageCount: 34,
    textByPage: ['title'],
    textCharCount: 7000,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [{}],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [{ level: 1, text: 'Title', page: 0, structRef: '10_0' }],
    figures: [],
    checkerFigureTargets: [],
    tables: [{
      structRef: '2216_0',
      page: 0,
      hasHeaders: true,
      headerCount: 2,
      totalCells: 14,
      rowCount: 8,
      cellsMisplacedCount: 0,
      irregularRows: 2,
      dominantColumnCount: 2,
      reachable: true,
      directContent: false,
      subtreeMcidCount: 20,
    }],
    paragraphStructElems: [],
    orphanMcids: [],
    taggedContentAudit: { orphanMcidCount: 64, mcidTextSpanCount: 500, suspectedPathPaintOutsideMc: 0 },
    annotationAccessibility: {
      pagesMissingTabsS: 0,
      pagesAnnotationOrderDiffers: 0,
      linkAnnotationsMissingStructure: 28,
      nonLinkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingContents: 0,
      linkAnnotationsMissingStructParent: 0,
      nonLinkAnnotationsMissingStructParent: 0,
    },
    detectionProfile: {
      pdfUaSignals: { orphanMcidCount: 64, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 28 },
      annotationSignals: { linkAnnotationsMissingStructure: 28, linkAnnotationsMissingStructParent: 0 },
    },
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    imageToTextRatio: 0,
    ...overrides,
  } as unknown as DocumentSnapshot;
}

describe('Stage 180 diagnostic classification', () => {
  it('classifies a stable mixed table/PDF-UA row as an ordered transaction candidate', () => {
    expect(classifyStage180MixedTablePdfUa({
      analysis: analysis(),
      snapshot: snapshot(),
    })).toMatchObject({
      classification: 'mixed_ordered_transaction_candidate',
      shouldAttempt: true,
    });
  });

  it('parks protected/analyzer volatility controls', () => {
    expect(classifyStage180MixedTablePdfUa({
      analysis: analysis(),
      snapshot: snapshot(),
      parked: true,
    })).toMatchObject({
      classification: 'protected_or_analyzer_volatility',
      shouldAttempt: false,
    });
  });
});
