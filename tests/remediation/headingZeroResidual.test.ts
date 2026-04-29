import { describe, expect, it } from 'vitest';
import { score } from '../../src/services/scorer/scorer.js';
import { classifyStage153HeadingZeroResidual } from '../../src/services/remediation/headingZeroResidual.js';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';

const META = { id: 'stage153', filename: 'stage153.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

function detection(overrides: Partial<NonNullable<DocumentSnapshot['detectionProfile']>> = {}): NonNullable<DocumentSnapshot['detectionProfile']> {
  return {
    readingOrderSignals: {
      missingStructureTree: false,
      structureTreeDepth: 4,
      degenerateStructureTree: false,
      annotationOrderRiskCount: 0,
      annotationStructParentRiskCount: 0,
      headerFooterPollutionRisk: false,
      sampledStructurePageOrderDriftCount: 0,
      multiColumnOrderRiskPages: 0,
      suspiciousPageCount: 0,
    },
    headingSignals: { extractedHeadingCount: 0, treeHeadingCount: 0, headingTreeDepth: 0, extractedHeadingsMissingFromTree: false },
    figureSignals: { extractedFigureCount: 0, treeFigureCount: 0, nonFigureRoleCount: 0, treeFigureMissingForExtractedFigures: false },
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
    ...overrides,
  };
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 8,
    textByPage: ['Demystifying Program Evaluation in Criminal Justice A Guide for Practitioners Abstract body.'],
    textCharCount: 4000,
    imageOnlyPageCount: 0,
    metadata: { title: 'Demystifying Program Evaluation in Criminal Justice', language: 'en-US' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    structTitle: null,
    headings: [],
    figures: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [{ type: 'P', children: [] }] },
    paragraphStructElems: [],
    mcidTextSpans: [
      { page: 0, mcid: 0, snippet: '/Span <</MCID 0>> BDC BT /T1 1 Tf 30 0 0 30 53 690 Tm', resolvedText: 'Demystifying Program Evaluation' },
      { page: 0, mcid: 1, snippet: '/Span <</MCID 1>> BDC BT /T1 1 Tf 30 0 0 30 53 660 Tm', resolvedText: 'in Criminal Justice' },
      { page: 0, mcid: 2, snippet: '/Span <</MCID 2>> BDC BT /T1 1 Tf 30 0 0 30 53 630 Tm', resolvedText: 'A Guide for Practitioners' },
    ],
    taggedContentAudit: { orphanMcidCount: 0, mcidTextSpanCount: 3, suspectedPathPaintOutsideMc: 0 },
    detectionProfile: detection(),
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...overrides,
  };
}

function analysisFor(snap: DocumentSnapshot): AnalysisResult {
  const base = score(snap, META);
  return {
    ...base,
    score: 59,
    pdfClass: snap.pdfClass,
    categories: base.categories.map(category => {
      if (category.key === 'heading_structure') return { ...category, applicable: true, score: 0 };
      if (category.key === 'text_extractability') return { ...category, applicable: true, score: 96 };
      if (category.key === 'reading_order') return { ...category, applicable: true, score: 96 };
      return { ...category, score: 100 };
    }),
  };
}

describe('Stage 153 heading-zero residual classifier', () => {
  it('classifies split first-page MCID title rows as safe visible heading anchors', () => {
    const snap = snapshot();
    const disposition = classifyStage153HeadingZeroResidual(analysisFor(snap), snap);
    expect(disposition.classification).toBe('safe_visible_heading_anchor');
    expect(disposition.candidate).toMatchObject({
      text: 'Demystifying Program Evaluation in Criminal Justice A Guide for Practitioners',
      page: 0,
    });
  });

  it('classifies no-owner native shells as structure bootstrap required', () => {
    const snap = snapshot({
      isTagged: false,
      structureTree: null,
      paragraphStructElems: [],
      mcidTextSpans: [],
      taggedContentAudit: { orphanMcidCount: 0, mcidTextSpanCount: 0, suspectedPathPaintOutsideMc: 0 },
      detectionProfile: detection({
        readingOrderSignals: { ...detection().readingOrderSignals, missingStructureTree: true, structureTreeDepth: 0 },
      }),
      pdfClass: 'native_untagged',
    });
    expect(classifyStage153HeadingZeroResidual(analysisFor(snap), snap).classification).toBe('structure_bootstrap_required');
  });

  it('keeps OCR rows with no content owner out of heading mutation', () => {
    const snap = snapshot({
      metadata: { title: 'Scanned report', creator: 'OCRmyPDF' },
      remediationProvenance: { engineAppliedOcr: true, engineTaggedOcrText: true, bookmarkStrategy: 'page_outlines' },
      paragraphStructElems: [],
      mcidTextSpans: [],
      taggedContentAudit: { orphanMcidCount: 0, mcidTextSpanCount: 0, suspectedPathPaintOutsideMc: 0 },
    });
    expect(classifyStage153HeadingZeroResidual(analysisFor(snap), snap).classification).toBe('content_owner_missing');
  });
});
