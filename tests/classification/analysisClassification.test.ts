import { describe, expect, it } from 'vitest';
import { deriveAnalysisClassification } from '../../src/services/classification/analysisClassification.js';
import type { AnalysisResult, DocumentSnapshot, ScoredCategory } from '../../src/types.js';

function category(
  key: ScoredCategory['key'],
  score: number,
  overrides: Partial<ScoredCategory> = {},
): ScoredCategory {
  return {
    key,
    score,
    weight: 1,
    applicable: true,
    severity: score >= 90 ? 'pass' : 'moderate',
    findings: [],
    evidence: overrides.manualReviewRequired ? 'manual_review_required' : 'verified',
    verificationLevel: overrides.manualReviewRequired ? 'manual_review_required' : 'verified',
    manualReviewRequired: false,
    manualReviewReasons: [],
    ...overrides,
  };
}

function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  const categories: ScoredCategory[] = [
    category('text_extractability', 100),
    category('title_language', 100),
    category('heading_structure', 100),
    category('alt_text', 100, { applicable: false }),
    category('pdf_ua_compliance', 100),
    category('bookmarks', 100, { applicable: false }),
    category('table_markup', 100, { applicable: false }),
    category('color_contrast', 100, { applicable: false }),
    category('link_quality', 100, { applicable: false }),
    category('reading_order', 100),
    category('form_accessibility', 100, { applicable: false }),
  ];
  return {
    id: 'a',
    timestamp: '2026-04-18T00:00:00.000Z',
    filename: 'sample.pdf',
    pageCount: 3,
    pdfClass: 'native_tagged',
    score: 95,
    grade: 'A',
    categories,
    findings: [],
    analysisDurationMs: 1,
    verificationLevel: 'verified',
    manualReviewRequired: false,
    manualReviewReasons: [],
    scoreCapsApplied: [],
    ...overrides,
  };
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 3,
    textByPage: ['abc'],
    textCharCount: 1000,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [{ level: 1, text: 'Intro', page: 0 }],
    figures: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    paragraphStructElems: [],
    orphanMcids: [],
    mcidTextSpans: [],
    taggedContentAudit: { orphanMcidCount: 0, mcidTextSpanCount: 0, suspectedPathPaintOutsideMc: 0 },
    listStructureAudit: {
      listCount: 0,
      listItemCount: 0,
      listItemMisplacedCount: 0,
      lblBodyMisplacedCount: 0,
      listsWithoutItems: 0,
    },
    acrobatStyleAltRisks: {
      nonFigureWithAltCount: 0,
      nestedFigureAltCount: 0,
      orphanedAltEmptyElementCount: 0,
      sampleOwnershipModes: [],
    },
    annotationAccessibility: {
      pagesMissingTabsS: 0,
      pagesAnnotationOrderDiffers: 0,
      linkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingContents: 0,
      linkAnnotationsMissingStructParent: 0,
      nonLinkAnnotationsMissingStructParent: 0,
    },
    ...overrides,
  };
}

describe('deriveAnalysisClassification', () => {
  it('classifies scanned files without new extraction passes', () => {
    const result = deriveAnalysisClassification(
      snapshot({ pdfClass: 'scanned', textCharCount: 0, imageOnlyPageCount: 3, imageToTextRatio: 1, isTagged: false, markInfo: null, structureTree: null }),
      analysis({ pdfClass: 'scanned', score: 10, grade: 'F' }),
    );
    expect(result.structuralClassification?.structureClass).toBe('scanned');
    expect(result.failureProfile?.primaryFailureFamily).toBe('mixed_structural');
  });

  it('classifies untagged digital files', () => {
    const result = deriveAnalysisClassification(
      snapshot({ isTagged: false, markInfo: null, structureTree: null, pdfClass: 'native_untagged' }),
      analysis({ pdfClass: 'native_untagged' }),
    );
    expect(result.structuralClassification?.structureClass).toBe('untagged_digital');
  });

  it('classifies partially tagged files with structure debt', () => {
    const result = deriveAnalysisClassification(
      snapshot({
        annotationAccessibility: {
          pagesMissingTabsS: 1,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingContents: 0,
          linkAnnotationsMissingStructParent: 1,
          nonLinkAnnotationsMissingStructParent: 0,
        },
      }),
      analysis({
        verificationLevel: 'manual_review_required',
        manualReviewRequired: true,
        categories: [
          category('text_extractability', 100),
          category('title_language', 100),
          category('heading_structure', 100),
          category('alt_text', 100, { applicable: false }),
          category('pdf_ua_compliance', 96),
          category('bookmarks', 100, { applicable: false }),
          category('table_markup', 100, { applicable: false }),
          category('color_contrast', 100, { applicable: false }),
          category('link_quality', 100, { applicable: false }),
          category('reading_order', 88, {
            manualReviewRequired: true,
            manualReviewReasons: ['Annotation tab order or /StructParent issues mean reading order should be checked manually with assistive technology.'],
          }),
          category('form_accessibility', 100, { applicable: false }),
        ],
      }),
    );
    expect(result.structuralClassification?.structureClass).toBe('partially_tagged');
    expect(result.failureProfile?.primaryFailureFamily).toBe('structure_reading_order_heavy');
    expect(result.failureProfile?.routingHints).toContain('prefer_annotation_normalization');
  });

  it('classifies well-tagged near-pass residual files', () => {
    const result = deriveAnalysisClassification(snapshot(), analysis({ score: 96, grade: 'A' }));
    expect(result.structuralClassification?.structureClass).toBe('well_tagged');
    expect(result.failureProfile?.primaryFailureFamily).toBe('near_pass_residual');
  });

  it('classifies native tagged files that are usable but not clearly strong', () => {
    const result = deriveAnalysisClassification(
      snapshot({
        markInfo: null,
        bookmarks: [{ title: 'Intro', level: 1 }],
      }),
      analysis({ score: 92, grade: 'A' }),
    );
    expect(result.structuralClassification?.structureClass).toBe('native_tagged');
  });

  it('classifies font-heavy and figure-heavy cases deterministically', () => {
    const fontHeavy = deriveAnalysisClassification(
      snapshot({
        metadata: { producer: 'OCRmyPDF 17.0' },
        fonts: [
          { name: 'A', isEmbedded: false, hasUnicode: false, encodingRisk: true },
          { name: 'B', isEmbedded: false, hasUnicode: false, encodingRisk: true },
        ],
      }),
      analysis({
        score: 70,
        categories: [
          category('text_extractability', 89, {
            manualReviewRequired: true,
            manualReviewReasons: ['OCR metadata indicates a machine-generated text layer that was not verified for recognition accuracy, logical order, or assistive-technology usability.'],
          }),
          category('title_language', 100),
          category('heading_structure', 100),
          category('alt_text', 100, { applicable: false }),
          category('pdf_ua_compliance', 100),
          category('bookmarks', 100, { applicable: false }),
          category('table_markup', 100, { applicable: false }),
          category('color_contrast', 100, { applicable: false }),
          category('link_quality', 100, { applicable: false }),
          category('reading_order', 100),
          category('form_accessibility', 100, { applicable: false }),
        ],
      }),
    );
    expect(fontHeavy.failureProfile?.primaryFailureFamily).toBe('font_extractability_heavy');
    expect(fontHeavy.failureProfile?.routingHints).toContain('prefer_font_repair');

    const figureHeavy = deriveAnalysisClassification(
      snapshot({
        figures: [{ hasAlt: false, isArtifact: false, page: 0 }],
        acrobatStyleAltRisks: {
          nonFigureWithAltCount: 1,
          nestedFigureAltCount: 1,
          orphanedAltEmptyElementCount: 0,
          sampleOwnershipModes: [],
        },
      }),
      analysis({
        score: 72,
        categories: [
          category('text_extractability', 100),
          category('title_language', 100),
          category('heading_structure', 100),
          category('alt_text', 89, {
            applicable: true,
            manualReviewRequired: true,
            manualReviewReasons: ['Alt text ownership or nested/orphaned alternate text risks were detected and need manual verification.'],
          }),
          category('pdf_ua_compliance', 100),
          category('bookmarks', 100, { applicable: false }),
          category('table_markup', 100, { applicable: false }),
          category('color_contrast', 100, { applicable: false }),
          category('link_quality', 100, { applicable: false }),
          category('reading_order', 100),
          category('form_accessibility', 100, { applicable: false }),
        ],
      }),
    );
    expect(figureHeavy.failureProfile?.primaryFailureFamily).toBe('figure_alt_ownership_heavy');
    expect(figureHeavy.failureProfile?.semanticIssues).toContain('alt_text');
    expect(figureHeavy.failureProfile?.manualOnlyIssues).toContain('alt_text');
  });
});
