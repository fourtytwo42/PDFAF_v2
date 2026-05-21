import { describe, it, expect } from 'vitest';
import { score, SCORING_WEIGHTS } from '../src/services/scorer/scorer.js';
import { finalizeScoringEvidence } from '../src/services/scorer/finalizeEvidence.js';
import { SCORE_TAGGED_MARKED_NO_EXTRACTABLE_TEXT } from '../src/config.js';
import type { CategoryKey, DocumentSnapshot, ScoredCategory } from '../src/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSnap(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 20,
    textByPage: Array(20).fill('Some text content here'),
    textCharCount: 20 * 22,
    imageOnlyPageCount: 0,
    metadata: { title: 'Test Doc', language: 'en-US', author: 'Author', subject: 'Test' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    structTitle: 'Test Doc',
    headings: [
      { level: 1, text: 'Introduction', page: 0 },
      { level: 2, text: 'Background',  page: 2 },
      { level: 2, text: 'Methods',     page: 5 },
      { level: 1, text: 'Results',     page: 8 },
      { level: 2, text: 'Discussion',  page: 12 },
      { level: 1, text: 'Conclusion',  page: 16 },
    ],
    figures: [],
    tables: [],
    fonts: [{ name: 'Calibri', isEmbedded: true, hasUnicode: true }],
    bookmarks: [
      { title: 'Introduction', level: 1 },
      { title: 'Background',   level: 2 },
      { title: 'Results',      level: 1 },
    ],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...overrides,
  };
}

const META = { id: 'test-1', filename: 'test.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 100 };

function scoredCategory(key: CategoryKey, scoreValue = 100, applicable = true): ScoredCategory {
  return {
    key,
    score: scoreValue,
    weight: SCORING_WEIGHTS[key],
    applicable,
    severity: scoreValue >= 90 ? 'pass' : scoreValue >= 70 ? 'minor' : scoreValue >= 40 ? 'moderate' : 'critical',
    findings: [],
  };
}

// ─── Weight integrity ─────────────────────────────────────────────────────────

describe('scoring weights', () => {
  it('sum to exactly 1.0', () => {
    const sum = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('has 11 categories', () => {
    expect(Object.keys(SCORING_WEIGHTS)).toHaveLength(11);
  });
});

describe('Stage 40 legal_pdf_strict_v2 policy', () => {
  it('uses the v2 score profile and keeps PDF/UA, bookmarks, and color contrast diagnostic-only', () => {
    const result = score(makeSnap(), META);
    expect(result.scoreProfile.id).toBe('legal_pdf_strict_v2');
    expect(result.scoreProfile.gradedCategories).toEqual([
      'text_extractability',
      'title_language',
      'heading_structure',
      'alt_text',
      'table_markup',
      'link_quality',
      'reading_order',
      'form_accessibility',
    ]);
    expect(result.scoreProfile.nonGradedCategories).toEqual([
      'bookmarks',
      'pdf_ua_compliance',
      'color_contrast',
    ]);
    for (const key of result.scoreProfile.nonGradedCategories) {
      const category = result.categories.find(c => c.key === key)!;
      expect(category.countsTowardGrade).toBe(false);
    }
  });

  it('matches the Stage 40 graded weight rebalance', () => {
    expect(SCORING_WEIGHTS).toMatchObject({
      text_extractability: 0.18,
      title_language: 0.07,
      heading_structure: 0.18,
      alt_text: 0.18,
      table_markup: 0.13,
      link_quality: 0.07,
      reading_order: 0.12,
      form_accessibility: 0.07,
      pdf_ua_compliance: 0,
      bookmarks: 0,
      color_contrast: 0,
    });
  });

  it('does not let PDF/UA diagnostic findings change the weighted legal score', () => {
    const base = makeSnap();
    const withPdfUaDebt = makeSnap({
      taggedContentAudit: {
        orphanMcidCount: 4,
        mcidTextSpanCount: 8,
        suspectedPathPaintOutsideMc: 40,
      },
    });
    const baseResult = score(base, META);
    const debtResult = score(withPdfUaDebt, META);
    const pdfUa = debtResult.categories.find(c => c.key === 'pdf_ua_compliance')!;
    expect(pdfUa.score).toBeLessThan(100);
    expect(pdfUa.countsTowardGrade).toBe(false);
    expect(debtResult.score).toBe(baseResult.score);
  });

  it('caps multi-page documents with zero checker-visible headings at 59', () => {
    const result = score(makeSnap({
      headings: [],
      paragraphStructElems: [],
      pageCount: 12,
      textByPage: Array(12).fill('Body '.repeat(100)),
      textCharCount: 12 * 500,
    }), META);
    expect(result.score).toBeLessThanOrEqual(59);
    expect(result.scoreProfile.criticalBlockers).toContain('no_real_headings');
  });

  it('does not fail single-page body text solely for missing headings', () => {
    const result = score(makeSnap({
      pageCount: 1,
      textByPage: ['Single page memo body text'],
      textCharCount: 900,
      headings: [],
      paragraphStructElems: [{ tag: 'P', text: 'Single page memo body text', page: 0, structRef: '1_0' }],
    }), META);
    const heading = result.categories.find(c => c.key === 'heading_structure')!;
    expect(heading.score).toBeGreaterThanOrEqual(70);
    expect(result.scoreProfile.criticalBlockers).not.toContain('no_real_headings');
  });

  it('caps informative figures when checker-visible figure alt ownership is missing', () => {
    const result = score(makeSnap({
      headings: [
        { level: 1, text: 'Report', page: 0 },
        { level: 2, text: 'Findings', page: 4 },
        { level: 2, text: 'Appendix', page: 10 },
      ],
      figures: [{ hasAlt: true, altText: 'Chart showing case counts', isArtifact: false, page: 1, role: 'Figure' }],
      checkerFigureTargets: [{
        hasAlt: false,
        isArtifact: false,
        page: 1,
        role: 'Figure',
        resolvedRole: 'Figure',
        structRef: '10_0',
        reachable: true,
        directContent: true,
        parentPath: ['Document'],
      }],
    }), META);
    expect(result.score).toBeLessThanOrEqual(59);
    expect(result.scoreProfile.criticalBlockers).toContain('no_checker_visible_alt_on_informative_figures');
  });

  it('does not apply the tree-figure alt cap when checker-visible figures are fully alt-owned', () => {
    const result = score(makeSnap({
      figures: [
        { hasAlt: true, altText: 'Chart showing quarterly trends', isArtifact: false, page: 1, role: 'Figure' },
        { hasAlt: true, altText: 'Map showing reporting regions', isArtifact: false, page: 2, role: 'Figure' },
      ],
      checkerFigureTargets: [
        {
          hasAlt: true,
          altText: 'Chart showing quarterly trends',
          isArtifact: false,
          page: 1,
          role: 'Figure',
          resolvedRole: 'Figure',
          structRef: '10_0',
          reachable: true,
          directContent: true,
          parentPath: ['Document'],
        },
        {
          hasAlt: true,
          altText: 'Map showing reporting regions',
          isArtifact: false,
          page: 2,
          role: 'Figure',
          resolvedRole: 'Figure',
          structRef: '20_0',
          reachable: true,
          directContent: true,
          parentPath: ['Document'],
        },
      ],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 3,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 6,
          treeHeadingCount: 6,
          headingTreeDepth: 2,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 2,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: true,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [1, 2],
        confidence: 'high',
      },
    }), META);
    const alt = result.categories.find(c => c.key === 'alt_text')!;
    expect(alt.score).toBe(89);
    expect(alt.manualReviewRequired).toBe(true);
    expect(alt.findings.some(f => f.message.includes('none are reachable as /Figure nodes'))).toBe(true);
    expect(result.scoreProfile.criticalBlockers).not.toContain('no_checker_visible_alt_on_informative_figures');
  });

  it('keeps the tree-figure alt cap when checker-visible figure alt coverage is partial', () => {
    const result = score(makeSnap({
      figures: [
        { hasAlt: true, altText: 'Chart showing quarterly trends', isArtifact: false, page: 1, role: 'Figure' },
        { hasAlt: true, altText: 'Map showing reporting regions', isArtifact: false, page: 2, role: 'Figure' },
      ],
      checkerFigureTargets: [
        {
          hasAlt: true,
          altText: 'Chart showing quarterly trends',
          isArtifact: false,
          page: 1,
          role: 'Figure',
          resolvedRole: 'Figure',
          structRef: '10_0',
          reachable: true,
          directContent: true,
          parentPath: ['Document'],
        },
        {
          hasAlt: false,
          isArtifact: false,
          page: 2,
          role: 'Figure',
          resolvedRole: 'Figure',
          structRef: '20_0',
          reachable: true,
          directContent: true,
          parentPath: ['Document'],
        },
      ],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 3,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 6,
          treeHeadingCount: 6,
          headingTreeDepth: 2,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 2,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: true,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [1, 2],
        confidence: 'high',
      },
    }), META);
    const alt = result.categories.find(c => c.key === 'alt_text')!;
    expect(alt.score).toBe(20);
    expect(result.score).toBeLessThanOrEqual(59);
    expect(result.scoreProfile.criticalBlockers).toContain('no_checker_visible_alt_on_informative_figures');
  });

  it('caps dense rowless table structures at 69', () => {
    const result = score(makeSnap({
      tables: [{ hasHeaders: true, headerCount: 1, totalCells: 8, rowCount: 1, cellsMisplacedCount: 0, irregularRows: 0, page: 0 }],
    }), META);
    expect(result.score).toBeLessThanOrEqual(69);
    expect(result.scoreProfile.majorBlockers).toContain('poor_table_markup');
  });

  it('does not cap mild advisory table regularity below 70', () => {
    const result = score(makeSnap({
      tables: [{
        hasHeaders: true,
        headerCount: 1,
        totalCells: 18,
        page: 1,
        rowCount: 5,
        cellsMisplacedCount: 0,
        irregularRows: 4,
        rowCellCounts: [2, 4, 4, 4, 4],
        dominantColumnCount: 4,
        maxRowSpan: 1,
        maxColSpan: 1,
      }],
    }), META);
    const table = result.categories.find(c => c.key === 'table_markup')!;
    expect(table.score).toBeGreaterThanOrEqual(70);
    expect(result.scoreProfile.majorBlockers).not.toContain('poor_table_markup');
  });

  it('caps multi-page tagged PDFs with externally shallow reading-order depth at 69', () => {
    const result = score(makeSnap({
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 1,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 1,
        },
        headingSignals: {
          extractedHeadingCount: 6,
          treeHeadingCount: 6,
          headingTreeDepth: 2,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0],
        confidence: 'medium',
      },
    }), META);
    expect(result.score).toBeLessThanOrEqual(69);
    expect(result.scoreProfile.majorBlockers).toContain('weak_reading_order');
  });

  it('caps link annotation ownership debt but not weak link text alone', () => {
    const ownershipDebt = score(makeSnap({
      links: [{ text: 'Annual report', url: 'https://example.com/report', page: 0 }],
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 3,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 2,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    }), META);
    expect(ownershipDebt.score).toBeLessThanOrEqual(79);
    expect(ownershipDebt.scoreProfile.majorBlockers).toContain('link_annotation_ownership_debt');

    const weakText = score(makeSnap({
      links: [{ text: 'click here', url: 'https://example.com/report', page: 0 }],
    }), META);
    expect(weakText.scoreProfile.majorBlockers).not.toContain('link_annotation_ownership_debt');
  });
});

// ─── N/A redistribution ───────────────────────────────────────────────────────

describe('N/A weight redistribution', () => {
  it('redistributes bookmark weight when pageCount < 10', () => {
    const snap = makeSnap({ pageCount: 5, textByPage: Array(5).fill('text'), headings: [] });
    const result = score(snap, META);
    const bookmarks = result.categories.find(c => c.key === 'bookmarks')!;
    expect(bookmarks.applicable).toBe(false);
    // All applicable categories should have weight > their base
    const applicable = result.categories.filter(c => c.applicable);
    const totalApplicableWeight = applicable.reduce((s, c) => s + c.weight, 0);
    expect(totalApplicableWeight).toBeCloseTo(1.0, 3);
  });

  it('redistributes form weight when no form fields', () => {
    const snap = makeSnap({ formFields: [], formFieldsFromPdfjs: [] });
    const result = score(snap, META);
    const forms = result.categories.find(c => c.key === 'form_accessibility')!;
    expect(forms.applicable).toBe(false);
  });

  it('redistributes alt_text weight when no figures', () => {
    const snap = makeSnap({ figures: [] });
    const result = score(snap, META);
    const alt = result.categories.find(c => c.key === 'alt_text')!;
    expect(alt.applicable).toBe(false);
  });
});

// ─── Grade derivation ─────────────────────────────────────────────────────────

describe('grade derivation', () => {
  it('grades a well-formed tagged document as A', () => {
    const snap = makeSnap({
      headings: [
        { level: 1, text: 'Annual Report', page: 0 },
        { level: 2, text: 'Introduction', page: 1 },
        { level: 2, text: 'Results', page: 8 },
        { level: 2, text: 'Conclusion', page: 16 },
      ],
      figures: [{ hasAlt: true, altText: 'Chart showing data', isArtifact: false, page: 1 }],
      tables: [{ hasHeaders: true, headerCount: 3, totalCells: 12, page: 2, rowCount: 4, irregularRows: 0, cellsMisplacedCount: 0 }],
      links: [{ text: 'Read the full report', url: 'https://example.com', page: 1 }],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 2,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 4,
          treeHeadingCount: 4,
          headingTreeDepth: 2,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 1,
          treeFigureCount: 1,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: {
          orphanMcidCount: 0,
          suspectedPathPaintOutsideMc: 0,
          taggedAnnotationRiskCount: 0,
        },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: {
          listItemMisplacedCount: 0,
          lblBodyMisplacedCount: 0,
          listsWithoutItems: 0,
        },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [],
        confidence: 'high',
      },
    });
    const result = score(snap, META);
    expect(result.grade).toBe('A');
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it('grades a fully scanned document as F', () => {
    const snap = makeSnap({
      pageCount: 20,
      textCharCount: 0,
      textByPage: Array(20).fill(''),
      imageOnlyPageCount: 20,
      isTagged: false,
      markInfo: null,
      lang: null,
      pdfUaVersion: null,
      structureTree: null,
      headings: [],
      bookmarks: [],
      pdfClass: 'scanned',
      imageToTextRatio: 1.0,
    });
    const result = score(snap, META);
    expect(result.grade).toBe('F');
  });

  it('grades an untagged doc with text as D or F', () => {
    const snap = makeSnap({
      isTagged: false,
      markInfo: null,
      lang: null,
      pdfUaVersion: null,
      structureTree: null,
      headings: [],
      bookmarks: [],
      pdfClass: 'native_untagged',
      imageToTextRatio: 0,
    });
    const result = score(snap, META);
    expect(['D', 'F']).toContain(result.grade);
  });
});

// ─── Individual category edge cases ──────────────────────────────────────────

describe('textExtractability', () => {
  it('returns score 0 for scanned documents', () => {
    const snap = makeSnap({ pdfClass: 'scanned', textCharCount: 0, imageToTextRatio: 1.0, imageOnlyPageCount: 20 });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBe(0);
    expect(cat.severity).toBe('critical');
  });

  it('returns 100 for native_tagged with text', () => {
    const snap = makeSnap({ pdfClass: 'native_tagged', textCharCount: 5000 });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBe(100);
    expect(cat.evidence).toBe('verified');
  });

  it('caps OCR-derived text extractability below a full-confidence pass', () => {
    const snap = makeSnap({
      pdfClass: 'native_tagged',
      textCharCount: 5000,
      metadata: {
        title: 'Test Doc',
        language: 'en-US',
        author: 'Author',
        subject: 'Test',
        producer: 'OCRmyPDF 17.0',
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBe(89);
    expect(cat.evidence).toBe('manual_review_required');
    expect(cat.manualReviewRequired).toBe(true);
    expect(cat.findings.some(f => f.message.includes('OCR'))).toBe(true);
    expect(result.manualReviewRequired).toBe(true);
    expect(result.scoreCapsApplied?.some(cap => cap.category === 'text_extractability')).toBe(true);
  });

  it('returns capped score for tagged Marked native_tagged when pdf.js extracts no text', () => {
    const snap = makeSnap({
      pdfClass: 'native_tagged',
      textCharCount: 0,
      textByPage: Array(20).fill(''),
      headings: [],
      bookmarks: [],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBe(SCORE_TAGGED_MARKED_NO_EXTRACTABLE_TEXT);
  });

  it('penalises native_tagged when fonts have encodingRisk (Acrobat Character encoding proxy)', () => {
    const snap = makeSnap({
      pdfClass: 'native_tagged',
      textCharCount: 5000,
      fonts: [
        { name: 'Arial', isEmbedded: false, hasUnicode: false, encodingRisk: true },
        { name: 'Times', isEmbedded: false, hasUnicode: false, encodingRisk: true },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => /Character encoding|encoding/i.test(f.message))).toBe(true);
  });

  it('applies full encoding penalty when text layer is sparse (relax thresholds not met)', () => {
    const snap = makeSnap({
      pdfClass: 'native_tagged',
      pageCount: 40,
      textByPage: Array(40).fill('short'),
      textCharCount: 2000,
      fonts: [
        { name: 'Arial', isEmbedded: false, hasUnicode: false, encodingRisk: true },
        { name: 'Times', isEmbedded: false, hasUnicode: false, encodingRisk: true },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBeLessThanOrEqual(90);
    expect(cat.severity).toBe('moderate');
  });

  it('does not penalize replacement characters below threshold', () => {
    const snap = makeSnap({
      pdfClass: 'native_tagged',
      textCharCount: 10_000,
      fontSyntaxAudit: {
        fontsChecked: 1,
        missingToUnicodeCMapCount: 0,
        invalidToUnicodeCMapCount: 0,
        emptyToUnicodeCMapCount: 0,
        cidToGidMapRiskCount: 0,
        trueTypeEncodingMismatchCount: 0,
        wModeMismatchCount: 0,
        externalCMapReferenceCount: 0,
        type0DescendantFontRiskCount: 0,
        replacementCharacterCount: 99,
        replacementCharacterRatio: 0.0099,
        highReplacementCharacterPageCount: 0,
      },
    });
    const cat = score(snap, META).categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBe(100);
    expect(cat.findings.some(f => f.message.includes('U+FFFD'))).toBe(false);
  });

  it('caps minor replacement-character extraction risk at 90', () => {
    const snap = makeSnap({
      pdfClass: 'native_tagged',
      textCharCount: 10_000,
      fontSyntaxAudit: {
        fontsChecked: 1,
        missingToUnicodeCMapCount: 0,
        invalidToUnicodeCMapCount: 0,
        emptyToUnicodeCMapCount: 0,
        cidToGidMapRiskCount: 0,
        trueTypeEncodingMismatchCount: 0,
        wModeMismatchCount: 0,
        externalCMapReferenceCount: 0,
        type0DescendantFontRiskCount: 0,
        replacementCharacterCount: 100,
        replacementCharacterRatio: 0.01,
        highReplacementCharacterPageCount: 0,
      },
    });
    const cat = score(snap, META).categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBe(90);
    expect(cat.findings.some(f => f.message.includes('U+FFFD'))).toBe(true);
  });

  it('caps moderate replacement-character extraction risk at 70', () => {
    const snap = makeSnap({
      pdfClass: 'native_tagged',
      textCharCount: 10_000,
      fontSyntaxAudit: {
        fontsChecked: 1,
        missingToUnicodeCMapCount: 0,
        invalidToUnicodeCMapCount: 0,
        emptyToUnicodeCMapCount: 0,
        cidToGidMapRiskCount: 0,
        trueTypeEncodingMismatchCount: 0,
        wModeMismatchCount: 0,
        externalCMapReferenceCount: 0,
        type0DescendantFontRiskCount: 0,
        replacementCharacterCount: 500,
        replacementCharacterRatio: 0.05,
        highReplacementCharacterPageCount: 0,
      },
    });
    const cat = score(snap, META).categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBe(70);
    expect(cat.severity).toBe('moderate');
  });

  it('caps severe replacement-character extraction risk at 40', () => {
    const snap = makeSnap({
      pdfClass: 'native_tagged',
      pageCount: 20,
      textCharCount: 10_000,
      fontSyntaxAudit: {
        fontsChecked: 1,
        missingToUnicodeCMapCount: 0,
        invalidToUnicodeCMapCount: 0,
        emptyToUnicodeCMapCount: 0,
        cidToGidMapRiskCount: 0,
        trueTypeEncodingMismatchCount: 0,
        wModeMismatchCount: 0,
        externalCMapReferenceCount: 0,
        type0DescendantFontRiskCount: 0,
        replacementCharacterCount: 2_000,
        replacementCharacterRatio: 0.2,
        highReplacementCharacterPageCount: 5,
      },
    });
    const cat = score(snap, META).categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBe(40);
    expect(cat.severity).toBe('critical');
  });

  it('does not trigger replacement-character penalties for tiny text samples', () => {
    const snap = makeSnap({
      pdfClass: 'native_tagged',
      textCharCount: 99,
      fontSyntaxAudit: {
        fontsChecked: 1,
        missingToUnicodeCMapCount: 0,
        invalidToUnicodeCMapCount: 0,
        emptyToUnicodeCMapCount: 0,
        cidToGidMapRiskCount: 0,
        trueTypeEncodingMismatchCount: 0,
        wModeMismatchCount: 0,
        externalCMapReferenceCount: 0,
        type0DescendantFontRiskCount: 0,
        replacementCharacterCount: 50,
        replacementCharacterRatio: 0.51,
        highReplacementCharacterPageCount: 20,
      },
    });
    const cat = score(snap, META).categories.find(c => c.key === 'text_extractability')!;
    expect(cat.score).toBe(100);
  });
});

describe('titleLanguage', () => {
  it('penalises missing language', () => {
    const snap = makeSnap({ lang: null, metadata: { title: 'Document Title', language: undefined } });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'title_language')!;
    expect(cat.score).toBe(50);
  });

  it('penalises missing title', () => {
    const snap = makeSnap({ structTitle: undefined, metadata: { title: undefined, language: 'en-US' } });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'title_language')!;
    expect(cat.score).toBe(50);
  });

  it('scores 0 when both are missing', () => {
    const snap = makeSnap({ lang: null, structTitle: undefined, metadata: {} });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'title_language')!;
    expect(cat.score).toBe(0);
  });

  it('treats filename-like metadata titles as missing', () => {
    const snap = makeSnap({ metadata: { title: 'report_v3_final.pdf', language: 'en-US' } });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'title_language')!;
    expect(cat.score).toBe(50);
    expect(cat.findings.some(f => /filename-like/i.test(f.message))).toBe(true);
  });
});

describe('headingStructure', () => {
  it('does not treat single-page tagged body text as heading-passing without checker-visible headings', () => {
    const snap = makeSnap({
      pageCount: 1,
      headings: [],
      isTagged: true,
      pdfClass: 'native_tagged',
      textCharCount: 800,
      textByPage: ['Single-page body text'],
      paragraphStructElems: [{ tag: 'P', text: 'Body text', page: 0, structRef: '1_0' }],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 2,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 0,
          treeHeadingCount: 0,
          headingTreeDepth: 0,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0],
        confidence: 'high',
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'heading_structure')!;
    expect(cat.score).toBe(80);
    expect(cat.severity).toBe('minor');
    expect(cat.findings.some(f => /checker-visible H1-H6/i.test(f.message))).toBe(true);
  });

  it('scores 0 for multi-page doc with no headings and sparse paragraph structure', () => {
    const snap = makeSnap({
      headings: [],
      pageCount: 10,
      paragraphStructElems: [{ tag: 'P', text: 'x', page: 0, structRef: '1_0' }],
      textCharCount: 80,
      textByPage: Array(10).fill('short'),
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'heading_structure')!;
    expect(cat.score).toBe(0);
    expect(cat.severity).toBe('critical');
  });

  it('scores 100 when tagged Marked multi-page doc has no H tags but many P-structure elements', () => {
    const elems = Array.from({ length: 6 }, (_, i) => ({
      tag: 'P' as const,
      text: `Section ${i}`,
      page: Math.floor(i / 3),
      structRef: `${i}_0`,
    }));
    const snap = makeSnap({ headings: [], pageCount: 10, paragraphStructElems: elems });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'heading_structure')!;
    expect(cat.score).toBe(0);
    expect(cat.severity).toBe('critical');
  });

  it('does not treat tagged body text as equivalent to heading navigation', () => {
    const snap = makeSnap({
      headings: [],
      pageCount: 10,
      paragraphStructElems: [],
      textCharCount: 5000,
      textByPage: Array(10).fill('x'.repeat(500)),
      pdfClass: 'native_tagged',
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'heading_structure')!;
    expect(cat.score).toBe(0);
  });

  it('does not pass heading_structure when exported headings are not reachable in the tree', () => {
    const snap = makeSnap({
      structureTree: { type: 'Document', children: [{ type: 'P', children: [] }] },
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 1,
          degenerateStructureTree: true,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 1,
        },
        headingSignals: {
          extractedHeadingCount: 6,
          treeHeadingCount: 0,
          headingTreeDepth: 0,
          extractedHeadingsMissingFromTree: true,
        },
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0],
        confidence: 'medium',
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'heading_structure')!;
    expect(cat.score).toBeLessThanOrEqual(45);
    expect(cat.findings.some(f => /reachable as H1/i.test(f.message))).toBe(true);
  });

  it('uses tree heading evidence when exported heading labels are missing but root-reachable H roles exist', () => {
    const snap = makeSnap({
      headings: [],
      pageCount: 8,
      structureTree: { type: 'Document', children: [{ type: 'H1', children: [] }, { type: 'H2', children: [] }] },
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 3,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 0,
          treeHeadingCount: 2,
          headingTreeDepth: 3,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0],
        confidence: 'high',
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'heading_structure')!;
    expect(cat.score).toBeGreaterThanOrEqual(70);
    expect(cat.score).toBeLessThan(90);
    expect(cat.findings.some(f => /tree exposes/i.test(f.message))).toBe(true);
  });

  it('uses extra tree heading evidence to avoid false no-H1 penalties when exported labels are incomplete', () => {
    const snap = makeSnap({
      pageCount: 16,
      headings: [
        { level: 2, text: 'Background', page: 1 },
        { level: 2, text: 'Findings', page: 2 },
      ],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 3,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 2,
        },
        headingSignals: {
          extractedHeadingCount: 2,
          treeHeadingCount: 3,
          headingTreeDepth: 3,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0],
        confidence: 'high',
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'heading_structure')!;
    expect(cat.score).toBeGreaterThanOrEqual(90);
    expect(cat.findings.some(f => /partial checker-visible heading evidence/i.test(f.message))).toBe(true);
  });

  it('does not pass heading_structure for tagged Marked multi-page with no H tags and pdf.js text length 0', () => {
    const snap = makeSnap({
      headings: [],
      pageCount: 12,
      paragraphStructElems: [],
      textCharCount: 0,
      textByPage: Array(12).fill(''),
      pdfClass: 'native_tagged',
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'heading_structure')!;
    expect(cat.score).toBe(0);
  });

  it('penalises skipped levels', () => {
    const snap = makeSnap({
      pdfClass: 'native_untagged',
      isTagged: false,
      pageCount: 8,
      textByPage: Array(8).fill('Some text content here'),
      textCharCount: 8 * 22,
      headings: [
        { level: 1, text: 'A', page: 0 },
        { level: 3, text: 'B', page: 1 }, // skipped H2
      ],
    });
    const withSkip = score(snap, META);
    const catSkip = withSkip.categories.find(c => c.key === 'heading_structure')!;

    const snap2 = makeSnap({
      pdfClass: 'native_untagged',
      isTagged: false,
      pageCount: 8,
      textByPage: Array(8).fill('Some text content here'),
      textCharCount: 8 * 22,
      headings: [
        { level: 1, text: 'A', page: 0 },
        { level: 2, text: 'B', page: 1 },
      ],
    });
    const noSkip = score(snap2, META);
    const catNoSkip = noSkip.categories.find(c => c.key === 'heading_structure')!;

    expect(catSkip.score).toBeLessThan(catNoSkip.score);
  });
});

describe('readingOrder', () => {
  it('caps reading order for external parity risk when tree depth is <= 1', () => {
    const snap = makeSnap({
      structureTree: { type: 'Document', children: [] },
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 1,
          degenerateStructureTree: true,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 1,
        },
        headingSignals: {
          extractedHeadingCount: 6,
          treeHeadingCount: 0,
          headingTreeDepth: 0,
          extractedHeadingsMissingFromTree: true,
        },
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0],
        confidence: 'medium',
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'reading_order')!;
    expect(cat.score).toBeLessThanOrEqual(30);
    expect(cat.findings.some(f => /external parity risk/i.test(f.message))).toBe(true);
  });
});

describe('altText', () => {
  it('is N/A when there are no figures', () => {
    const snap = makeSnap({ figures: [] });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.applicable).toBe(false);
  });

  it('scores 100 when all figures have alt text', () => {
    const snap = makeSnap({
      figures: [
        { hasAlt: true, altText: 'A bar chart', isArtifact: false, page: 1, role: 'Figure' },
        { hasAlt: true, altText: 'A map',       isArtifact: false, page: 2, role: 'Figure' },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBe(100);
    expect(cat.evidence).toBe('verified');
  });

  it('scores 0 when no figures have alt text (untagged class; small native_tagged floor is separate)', () => {
    const snap = makeSnap({
      pdfClass: 'native_untagged',
      isTagged: false,
      markInfo: null,
      figures: [
        { hasAlt: false, isArtifact: false, page: 1 },
        { hasAlt: false, isArtifact: false, page: 2 },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBe(0);
  });

  it('does not inflate alt_text for native_tagged figures with no alt (Acrobat FigAltText alignment)', () => {
    const snap = makeSnap({
      figures: [
        { hasAlt: false, isArtifact: false, page: 1 },
        { hasAlt: false, isArtifact: false, page: 2 },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBe(0);
  });

  it('ignores artifact figures', () => {
    const snap = makeSnap({
      figures: [
        { hasAlt: true, altText: 'Acme brand mark on title page', isArtifact: false, page: 1 },
        { hasAlt: false, isArtifact: true, page: 2 },   // decorative, don't penalise
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBe(100);
  });

  it('penalises generic alternate text on figures (Tier A)', () => {
    const snap = makeSnap({
      figures: [
        { hasAlt: true, altText: 'image', isArtifact: false, page: 1, role: 'Figure' },
        { hasAlt: true, altText: 'A bar chart', isArtifact: false, page: 2, role: 'Figure' },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('generic'))).toBe(true);
    expect(cat.evidence).toBe('heuristic');
  });

  it('scores non-link annotations missing /Contents when there are no figures', () => {
    const snap = makeSnap({
      figures: [],
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 3,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.applicable).toBe(true);
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('non-link'))).toBe(true);
  });

  it('penalises figure-like content that is not exported as real /Figure roles', () => {
    const snap = makeSnap({
      figures: [
        { hasAlt: true, altText: 'A diagram', isArtifact: false, page: 1, role: 'Shape' },
      ],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 3,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 1,
        },
        headingSignals: {
          extractedHeadingCount: 6,
          treeHeadingCount: 6,
          headingTreeDepth: 2,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 1,
          treeFigureCount: 0,
          nonFigureRoleCount: 1,
          treeFigureMissingForExtractedFigures: true,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [1],
        confidence: 'high',
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBeLessThanOrEqual(20);
    expect(cat.findings.some(f => /non-Figure roles/i.test(f.message))).toBe(true);
  });
});

describe('annotationAccessibility signals', () => {
  it('penalises pdf_ua when many visible annotations lack structure association', () => {
    const snap = makeSnap({
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 13,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'pdf_ua_compliance')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('annotation'))).toBe(true);
  });

  it('penalises reading_order when many pages lack /Tabs /S', () => {
    const snap = makeSnap({
      pdfClass: 'native_untagged',
      isTagged: false,
      markInfo: null,
      pageCount: 20,
      textByPage: Array(20).fill('Some text content here'),
      annotationAccessibility: {
        pagesMissingTabsS: 10,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'reading_order')!;
    expect(cat.score).toBeLessThanOrEqual(50);
    expect(cat.findings.some(f => f.message.includes('/Tabs'))).toBe(true);
    expect(cat.manualReviewRequired).toBe(true);
  });

  it('penalises reading_order for shallow or degenerate structure trees', () => {
    const snap = makeSnap({
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 1,
          degenerateStructureTree: true,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 2,
        },
        headingSignals: {
          extractedHeadingCount: 6,
          treeHeadingCount: 0,
          headingTreeDepth: 0,
          extractedHeadingsMissingFromTree: true,
        },
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0, 1],
        confidence: 'medium',
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'reading_order')!;
    expect(cat.score).toBeLessThanOrEqual(35);
    expect(cat.findings.some(f => /too shallow/i.test(f.message))).toBe(true);
  });

  it('penalises pdf_ua for tagged-content audit orphan MCIDs (Acrobat TaggedCont proxy)', () => {
    const snap = makeSnap({
      taggedContentAudit: {
        orphanMcidCount: 2,
        mcidTextSpanCount: 6,
        suspectedPathPaintOutsideMc: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'pdf_ua_compliance')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('orphan'))).toBe(true);
  });

  it('penalises pdf_ua for path paint outside marked-content (heuristic)', () => {
    const snap = makeSnap({
      taggedContentAudit: {
        orphanMcidCount: 0,
        mcidTextSpanCount: 4,
        suspectedPathPaintOutsideMc: 50,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'pdf_ua_compliance')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('path paint'))).toBe(true);
  });

  it('penalises link_quality for link annotations missing structure', () => {
    const snap = makeSnap({
      links: [{ text: 'Good label', url: 'https://example.com', page: 0 }],
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 2,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'link_quality')!;
    expect(cat.score).toBe(95);
    expect(cat.findings.some(f => f.message.includes('structure tree'))).toBe(true);
  });

  it('scores link_quality from structure issues when pdfjs extracted no links', () => {
    const snap = makeSnap({
      links: [],
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 1,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'link_quality')!;
    expect(cat.applicable).toBe(true);
    expect(cat.score).toBeLessThan(100);
  });

  it('penalises reading_order when link annotations lack /StructParent (Tier A)', () => {
    const snap = makeSnap({
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 5,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'reading_order')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('StructParent'))).toBe(true);
    expect(cat.manualReviewRequired).toBe(true);
  });

  it('penalises reading_order for sampled structure drift and header/footer pollution signals', () => {
    const snap = makeSnap({
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: true,
          sampledStructurePageOrderDriftCount: 2,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 4,
        },
        pdfUaSignals: {
          orphanMcidCount: 0,
          suspectedPathPaintOutsideMc: 0,
          taggedAnnotationRiskCount: 0,
        },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: {
          listItemMisplacedCount: 0,
          lblBodyMisplacedCount: 0,
          listsWithoutItems: 0,
        },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0, 1, 2, 3],
        confidence: 'high',
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'reading_order')!;
    expect(cat.score).toBeLessThan(96);
    expect(cat.findings.some(f => f.message.includes('sampled structure-order drift'))).toBe(true);
    expect(cat.findings.some(f => f.message.includes('header/footer'))).toBe(true);
  });

  it('does not preserve the tagged reading-order floor when annotation order risk is present', () => {
    const snap = makeSnap({
      pageCount: 20,
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          annotationOrderRiskCount: 4,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 10,
        },
        pdfUaSignals: {
          orphanMcidCount: 0,
          suspectedPathPaintOutsideMc: 0,
          taggedAnnotationRiskCount: 0,
        },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 4,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: {
          listItemMisplacedCount: 0,
          lblBodyMisplacedCount: 0,
          listsWithoutItems: 0,
        },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0, 1, 2, 3],
        confidence: 'high',
      },
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 4,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'reading_order')!;
    expect(cat.score).toBeLessThan(95);
    expect(cat.findings.some(f => f.message.includes('annotations ordered differently'))).toBe(true);
  });

  it('penalises link_quality for /Link missing /StructParent (distinct from ParentTree)', () => {
    const snap = makeSnap({
      links: [{ text: 'Good label', url: 'https://example.com', page: 0 }],
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 4,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'link_quality')!;
    expect(cat.score).toBeLessThan(100);
    expect(cat.findings.some(f => f.message.includes('/StructParent'))).toBe(true);
  });

  it('flags pdfaf-style generic link phrase (find out more)', () => {
    const snap = makeSnap({
      links: [{ text: 'Find out more', url: 'https://example.com', page: 0 }],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'link_quality')!;
    expect(cat.findings.some(f => f.message.includes('non-descriptive'))).toBe(true);
  });

  it('applies advisory table regularity when row pattern matches pdfaf heuristic', () => {
    const snap = makeSnap({
      tables: [
        {
          hasHeaders: true,
          headerCount: 1,
          totalCells: 18,
          page: 1,
          rowCount: 5,
          cellsMisplacedCount: 0,
          irregularRows: 4,
          rowCellCounts: [2, 4, 4, 4, 4],
          dominantColumnCount: 4,
          maxRowSpan: 1,
          maxColSpan: 1,
        },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'table_markup')!;
    expect(cat.findings.some(f => f.message.includes('advisory'))).toBe(true);
  });

  it('penalises table_markup for strongly irregular Stage 3 table structure', () => {
    const snap = makeSnap({
      tables: [{ hasHeaders: true, headerCount: 1, totalCells: 8, page: 1 }],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 1,
        },
        pdfUaSignals: {
          orphanMcidCount: 0,
          suspectedPathPaintOutsideMc: 0,
          taggedAnnotationRiskCount: 0,
        },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: {
          listItemMisplacedCount: 0,
          lblBodyMisplacedCount: 0,
          listsWithoutItems: 0,
        },
        tableSignals: {
          tablesWithMisplacedCells: 1,
          misplacedCellCount: 3,
          irregularTableCount: 1,
          stronglyIrregularTableCount: 1,
          directCellUnderTableCount: 3,
        },
        sampledPages: [1],
        confidence: 'high',
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'table_markup')!;
    expect(cat.score).toBeLessThan(90);
    expect(cat.findings.some(f => f.message.includes('strongly irregular'))).toBe(true);
  });
});

describe('tableMarkup', () => {
  it('penalises dense tables with almost no row structure', () => {
    const snap = makeSnap({
      tables: [
        {
          hasHeaders: true,
          headerCount: 1,
          totalCells: 8,
          rowCount: 1,
          cellsMisplacedCount: 0,
          irregularRows: 0,
          page: 0,
        },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'table_markup')!;
    expect(cat.score).toBeLessThanOrEqual(70);
    expect(cat.findings.some(f => /almost no row structure/i.test(f.message))).toBe(true);
  });
});

describe('bookmarks', () => {
  it('is N/A for docs under BOOKMARKS_PAGE_THRESHOLD pages', () => {
    const snap = makeSnap({ pageCount: 5, textByPage: Array(5).fill('text'), headings: [{ level: 1, text: 'A', page: 0 }] });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.applicable).toBe(false);
  });

  it('scores 88 for a 20-page doc with no bookmarks and sparse headings (long-doc floor)', () => {
    const snap = makeSnap({
      bookmarks: [],
      headings: [{ level: 1, text: 'Only', page: 0 }],
      markInfo: null,
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.score).toBe(88);
  });

  it('scores partial credit for tagged Marked long doc with no outlines and a single heading', () => {
    const snap = makeSnap({
      bookmarks: [],
      headings: [{ level: 1, text: 'Only', page: 0 }],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.score).toBe(94);
  });

  it('gives partial credit when there are no outlines but many tagged headings', () => {
    const snap = makeSnap({ bookmarks: [] });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.score).toBe(92);
  });

  it('gives 88 when there are no outlines but only two headings', () => {
    const snap = makeSnap({
      bookmarks: [],
      headings: [
        { level: 1, text: 'A', page: 0 },
        { level: 2, text: 'B', page: 1 },
      ],
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.score).toBe(88);
  });

  it('scores 97 when bookmarks exist without headings but paragraph tagging is rich', () => {
    const paras = Array.from({ length: 25 }, (_, i) => ({
      tag: 'P' as const,
      text: `p${i}`,
      page: i % 20,
      structRef: `${i}_0`,
    }));
    const snap = makeSnap({
      pageCount: 20,
      bookmarks: [
        { title: 'Ch1', level: 1 },
        { title: 'Ch2', level: 1 },
      ],
      headings: [],
      paragraphStructElems: paras,
      textByPage: Array(20).fill('word '.repeat(50)),
      textCharCount: 20_000,
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'bookmarks')!;
    expect(cat.score).toBe(97);
  });
});

describe('findings ordering', () => {
  it('sorts findings critical → moderate → minor → pass', () => {
    const snap = makeSnap({
      pdfClass: 'native_untagged',
      isTagged: false,
      markInfo: null,
      lang: null,
      pdfUaVersion: null,
      structureTree: null,
      headings: [],
      bookmarks: [],
      imageToTextRatio: 0,
    });
    const result = score(snap, META);
    const severities = result.findings.map(f => f.severity);
    const ORDER = ['critical', 'moderate', 'minor', 'pass'];
    for (let i = 1; i < severities.length; i++) {
      expect(ORDER.indexOf(severities[i]!)).toBeGreaterThanOrEqual(ORDER.indexOf(severities[i - 1]!));
    }
  });
});

describe('stage 1 evidence model', () => {
  it('marks heuristic reading-order fallback without a structure tree and caps it below full confidence', () => {
    const snap = makeSnap({
      structureTree: null,
      headings: [
        { level: 1, text: 'Intro', page: 0 },
        { level: 2, text: 'Body', page: 1 },
      ],
      paragraphStructElems: [],
      pdfClass: 'native_tagged',
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'reading_order')!;
    expect(cat.score).toBe(89);
    expect(cat.evidence).toBe('manual_review_required');
    expect(cat.manualReviewRequired).toBe(true);
    expect(result.verificationLevel).toBe('manual_review_required');
  });

  it('surfaces color contrast as manual-review-required even when it is not applicable', () => {
    const result = score(makeSnap(), META);
    const cat = result.categories.find(c => c.key === 'color_contrast')!;
    expect(cat.applicable).toBe(false);
    expect(cat.evidence).toBe('heuristic');
    expect(cat.manualReviewRequired).toBe(true);
    expect(result.manualReviewRequired).toBe(false);
    expect(result.verificationLevel).toBe('mixed');
    expect(result.manualReviewReasons?.some(reason => reason.includes('Color contrast'))).toBe(true);
  });

  it('marks alt-text ownership risks as manual-review-required and caps high scores', () => {
    const snap = makeSnap({
      figures: [{ hasAlt: true, altText: 'Chart', isArtifact: false, page: 1 }],
      acrobatStyleAltRisks: {
        nonFigureWithAltCount: 1,
        nestedFigureAltCount: 0,
        orphanedAltEmptyElementCount: 0,
      },
    });
    const result = score(snap, META);
    const cat = result.categories.find(c => c.key === 'alt_text')!;
    expect(cat.score).toBe(89);
    expect(cat.evidence).toBe('manual_review_required');
    expect(cat.manualReviewRequired).toBe(true);
  });
});

describe('phase 3 PAC scoring influence', () => {
  it('keeps verified missing ToUnicode CMap evidence diagnostic-only for scoring', () => {
    const snap = makeSnap({
      fontSyntaxAudit: {
        fontsChecked: 2,
        missingToUnicodeCMapCount: 1,
        invalidToUnicodeCMapCount: 0,
        emptyToUnicodeCMapCount: 0,
        cidToGidMapRiskCount: 0,
        trueTypeEncodingMismatchCount: 0,
        wModeMismatchCount: 0,
        externalCMapReferenceCount: 0,
        type0DescendantFontRiskCount: 0,
      },
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('text_extractability', 100),
    ]);
    const cat = finalized.categories[0]!;

    expect(cat.score).toBe(100);
    expect(cat.scoreCapsApplied).toBeUndefined();
    expect(cat.evidence).toBe('verified');
    expect(cat.manualReviewRequired).toBe(false);
  });

  it('keeps verified invalid ToUnicode CMap evidence diagnostic-only for scoring', () => {
    const snap = makeSnap({
      fontSyntaxAudit: {
        fontsChecked: 2,
        missingToUnicodeCMapCount: 0,
        invalidToUnicodeCMapCount: 1,
        emptyToUnicodeCMapCount: 1,
        cidToGidMapRiskCount: 0,
        trueTypeEncodingMismatchCount: 0,
        wModeMismatchCount: 0,
        externalCMapReferenceCount: 0,
        type0DescendantFontRiskCount: 0,
      },
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('text_extractability', 100),
    ]);
    const cat = finalized.categories[0]!;

    expect(cat.score).toBe(100);
    expect(cat.scoreCapsApplied).toBeUndefined();
    expect(cat.evidence).toBe('verified');
    expect(cat.manualReviewRequired).toBe(false);
  });

  it('caps verified table header association evidence under strict PAC grading', () => {
    const snap = makeSnap({
      tableHeaderAudit: {
        tablesChecked: 1,
        headerAssociationMissingCount: 0,
        orphanHeaderCellCount: 0,
        dataCellsWithoutHeaderCount: 2,
      },
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('table_markup', 100),
    ]);
    const cat = finalized.categories[0]!;

    expect(cat.score).toBe(79);
    expect(cat.scoreCapsApplied).toEqual([
      {
        category: 'table_markup',
        cap: 79,
        rawScore: 100,
        finalScore: 79,
        reason: 'PAC rule failure: pdfua.table.header_association_present',
      },
    ]);
    expect(cat.evidence).toBe('manual_review_required');
    expect(cat.manualReviewRequired).toBe(true);
  });

  it('does not lower already-low font or strict table categories', () => {
    const snap = makeSnap({
      fontSyntaxAudit: {
        fontsChecked: 1,
        missingToUnicodeCMapCount: 1,
        invalidToUnicodeCMapCount: 0,
        emptyToUnicodeCMapCount: 0,
        cidToGidMapRiskCount: 0,
        trueTypeEncodingMismatchCount: 0,
        wModeMismatchCount: 0,
        externalCMapReferenceCount: 0,
        type0DescendantFontRiskCount: 0,
      },
      tableHeaderAudit: {
        tablesChecked: 1,
        headerAssociationMissingCount: 1,
        orphanHeaderCellCount: 0,
        dataCellsWithoutHeaderCount: 1,
      },
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('text_extractability', 70),
      scoredCategory('table_markup', 65),
    ]);

    expect(finalized.categories.find(c => c.key === 'text_extractability')?.score).toBe(70);
    expect(finalized.categories.find(c => c.key === 'text_extractability')?.scoreCapsApplied).toBeUndefined();
    expect(finalized.categories.find(c => c.key === 'table_markup')?.score).toBe(65);
    expect(finalized.categories.find(c => c.key === 'table_markup')?.scoreCapsApplied).toBeUndefined();
  });

  it('does not cap for noisy non-promoted font evidence', () => {
    const snap = makeSnap({
      fontSyntaxAudit: {
        fontsChecked: 1,
        missingToUnicodeCMapCount: 0,
        invalidToUnicodeCMapCount: 0,
        emptyToUnicodeCMapCount: 0,
        cidToGidMapRiskCount: 1,
        trueTypeEncodingMismatchCount: 1,
        wModeMismatchCount: 0,
        externalCMapReferenceCount: 0,
        type0DescendantFontRiskCount: 0,
      },
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('text_extractability', 100),
    ]);
    const cat = finalized.categories[0]!;

    expect(cat.score).toBe(100);
    expect(cat.scoreCapsApplied).toBeUndefined();
    expect(cat.manualReviewRequired).toBe(false);
  });

  it('caps a high applicable category when a selected verified PAC rule fails', () => {
    const snap = makeSnap({
      formFields: [{ name: 'approve', page: 0 }],
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('form_accessibility', 100),
    ]);
    const cat = finalized.categories[0]!;

    expect(cat.score).toBe(89);
    expect(cat.evidence).toBe('manual_review_required');
    expect(cat.verificationLevel).toBe('manual_review_required');
    expect(cat.manualReviewRequired).toBe(true);
    expect(cat.scoreCapsApplied).toEqual([
      {
        category: 'form_accessibility',
        cap: 89,
        rawScore: 100,
        finalScore: 89,
        reason: 'PAC rule failure: pdfua.form.tu_present',
      },
    ]);
    expect(finalized.manualReviewReasons).toContain('PAC rule failure requires manual review: pdfua.form.tu_present.');
  });

  it('applies stricter caps for verified PAC content-tagging leaf failures', () => {
    const snap = makeSnap({
      contentTaggingAudit: {
        pageStreamsChecked: 2,
        totalPageStreams: 2,
        textOutsideMarkedContentOrArtifact: 3,
        imageOutsideMarkedContentOrArtifact: 0,
        pathOutsideMarkedContentOrArtifact: 0,
        artifactInsideTaggedContent: 0,
        taggedContentInsideArtifact: 0,
        malformedMarkedContentStack: 0,
        contentOutsidePageBounds: 0,
      },
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('reading_order', 100),
    ]);
    const cat = finalized.categories[0]!;

    expect(cat.score).toBe(79);
    expect(cat.scoreCapsApplied).toEqual([
      {
        category: 'reading_order',
        cap: 79,
        rawScore: 100,
        finalScore: 79,
        reason: 'PAC rule failure: pdfua.content.text_tagged_or_artifacted',
      },
    ]);
  });

  it('applies stricter caps for fully measured Form XObject content-tagging failures', () => {
    const snap = makeSnap({
      contentTaggingAudit: {
        pageStreamsChecked: 2,
        totalPageStreams: 2,
        formXObjectsChecked: 1,
        totalFormXObjects: 1,
        formXObjectParseErrorCount: 0,
        formXObjectSampleLimitHitCount: 0,
        textOutsideMarkedContentOrArtifact: 0,
        imageOutsideMarkedContentOrArtifact: 1,
        pathOutsideMarkedContentOrArtifact: 0,
        artifactInsideTaggedContent: 0,
        taggedContentInsideArtifact: 0,
        malformedMarkedContentStack: 0,
        contentOutsidePageBounds: 0,
      },
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('pdf_ua_compliance', 100),
    ]);
    const cat = finalized.categories[0]!;

    expect(cat.score).toBe(79);
    expect(cat.scoreCapsApplied).toEqual([
      {
        category: 'pdf_ua_compliance',
        cap: 79,
        rawScore: 100,
        finalScore: 79,
        reason: 'PAC rule failure: pdfua.content.image_tagged_or_artifacted',
      },
    ]);
  });

  it('keeps partial Form XObject content-tagging failures heuristic', () => {
    const snap = makeSnap({
      contentTaggingAudit: {
        pageStreamsChecked: 2,
        totalPageStreams: 2,
        formXObjectsChecked: 1,
        totalFormXObjects: 2,
        formXObjectParseErrorCount: 0,
        formXObjectSampleLimitHitCount: 0,
        textOutsideMarkedContentOrArtifact: 0,
        imageOutsideMarkedContentOrArtifact: 1,
        pathOutsideMarkedContentOrArtifact: 0,
        artifactInsideTaggedContent: 0,
        taggedContentInsideArtifact: 0,
        malformedMarkedContentStack: 0,
        contentOutsidePageBounds: 0,
      },
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('pdf_ua_compliance', 100),
    ]);
    const cat = finalized.categories[0]!;

    expect(cat.score).toBe(100);
    expect(cat.scoreCapsApplied).toBeUndefined();
  });

  it('applies stricter caps for verified PAC structure-syntax leaf failures', () => {
    const snap = makeSnap({
      structureSyntaxAudit: {
        missingStructureTypeCount: 0,
        missingRoleCount: 0,
        missingParentCount: 1,
        wrongParentCount: 0,
        invalidChildRoleCount: 0,
        invalidMcrObjrCount: 0,
        circularRoleMapCount: 0,
        standardRoleRemappedCount: 0,
        unmappedNonstandardRoleCount: 0,
      },
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('reading_order', 100),
    ]);
    const cat = finalized.categories[0]!;

    expect(cat.score).toBe(79);
    expect(cat.scoreCapsApplied?.map(cap => `${cap.cap}:${cap.reason}`)).toEqual([
      '79:PAC rule failure: pdfua.structure.parent_links_valid',
    ]);
  });

  it('applies stricter caps for verified PAC heading and table leaf failures', () => {
    const snap = makeSnap({
      headings: [{ level: 3, text: 'Skipped', page: 0, structRef: '12 0 R' }],
      tableHeaderAudit: {
        tablesChecked: 1,
        headerAssociationMissingCount: 1,
        orphanHeaderCellCount: 0,
        dataCellsWithoutHeaderCount: 1,
      },
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('heading_structure', 100),
      scoredCategory('table_markup', 100),
    ]);
    const heading = finalized.categories.find(category => category.key === 'heading_structure')!;
    const table = finalized.categories.find(category => category.key === 'table_markup')!;

    expect(heading.score).toBe(79);
    expect(heading.scoreCapsApplied?.map(cap => cap.reason)).toEqual([
      'PAC rule failure: pdfua.heading.first_heading_h1',
    ]);
    expect(table.score).toBe(79);
    expect(table.scoreCapsApplied?.map(cap => cap.reason)).toEqual([
      'PAC rule failure: pdfua.table.header_association_present',
    ]);
  });

  it('does not lower an already-low category for a selected verified PAC failure', () => {
    const snap = makeSnap({
      formFields: [{ name: 'approve', page: 0 }],
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('form_accessibility', 70),
    ]);
    const cat = finalized.categories[0]!;

    expect(cat.score).toBe(70);
    expect(cat.scoreCapsApplied).toBeUndefined();
    expect(cat.evidence).toBe('manual_review_required');
    expect(cat.manualReviewRequired).toBe(true);
  });

  it('does not cap from heuristic warning or incomplete PAC evidence', () => {
    const snap = makeSnap({
      metadata: { ...makeSnap().metadata, title: 'report_final_v3.pdf' },
      structTitle: '',
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('title_language', 100),
    ]);
    const cat = finalized.categories[0]!;

    expect(cat.score).toBe(100);
    expect(cat.scoreCapsApplied).toBeUndefined();
    expect(cat.evidence).toBe('verified');
    expect(cat.manualReviewRequired).toBe(false);
  });

  it('does not cap non-applicable categories', () => {
    const snap = makeSnap({
      formFields: [{ name: 'approve', page: 0 }],
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('form_accessibility', 100, false),
    ]);
    const cat = finalized.categories[0]!;

    expect(cat.score).toBe(100);
    expect(cat.scoreCapsApplied).toBeUndefined();
    expect(cat.manualReviewRequired).toBe(false);
  });

  it('records multiple same-category PAC failures deterministically', () => {
    const snap = makeSnap({
      figures: [{ hasAlt: false, isArtifact: false, page: 0, role: 'Figure' }],
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 2,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('alt_text', 100),
    ]);
    const cat = finalized.categories[0]!;

    expect(cat.score).toBe(79);
    expect(cat.scoreCapsApplied?.map(cap => cap.reason)).toEqual([
      'PAC rule failure: pdfua.annotation.alt_or_contents_present',
      'PAC rule failure: pdfua.annotations.nonlink_contents_present',
      'PAC rule failure: pdfua.figure.alt_present',
    ]);
    expect(cat.manualReviewReasons).toEqual([
      'PAC rule failure requires manual review: pdfua.annotation.alt_or_contents_present.',
      'PAC rule failure requires manual review: pdfua.annotations.nonlink_contents_present.',
      'PAC rule failure requires manual review: pdfua.figure.alt_present.',
    ]);
  });

  it('preserves existing heuristic caps while adding PAC caps independently', () => {
    const snap = makeSnap({
      metadata: {
        title: 'Test Doc',
        language: 'en-US',
        author: 'Author',
        subject: 'Test',
        producer: 'OCRmyPDF 17.0',
      },
      formFields: [{ name: 'approve', page: 0 }],
    });

    const finalized = finalizeScoringEvidence(snap, [
      scoredCategory('text_extractability', 100),
      scoredCategory('form_accessibility', 100),
    ]);
    const text = finalized.categories.find(category => category.key === 'text_extractability')!;
    const form = finalized.categories.find(category => category.key === 'form_accessibility')!;

    expect(text.score).toBe(89);
    expect(text.scoreCapsApplied?.map(cap => cap.reason)).toEqual([
      'OCR-generated text layers cannot be treated as a full-confidence extractability pass.',
    ]);
    expect(form.score).toBe(89);
    expect(form.scoreCapsApplied?.map(cap => cap.reason)).toEqual([
      'PAC rule failure: pdfua.form.tu_present',
    ]);
    expect(finalized.scoreCapsApplied.map(cap => cap.category)).toEqual([
      'text_extractability',
      'form_accessibility',
    ]);
  });
});
