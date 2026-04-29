import { describe, expect, it } from 'vitest';
import { score } from '../../src/services/scorer/scorer.js';
import {
  classifyStage152NativeReadingOrderTopup,
  shouldTryNativeReadingOrderTopup,
} from '../../src/services/remediation/nativeReadingOrderTopup.js';
import { buildDefaultParams, planForRemediation } from '../../src/services/remediation/planner.js';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';

const META = { id: 'stage152', filename: 'stage152.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

function detection(overrides: Partial<NonNullable<DocumentSnapshot['detectionProfile']>> = {}): NonNullable<DocumentSnapshot['detectionProfile']> {
  return {
    readingOrderSignals: {
      missingStructureTree: false,
      structureTreeDepth: 2,
      degenerateStructureTree: true,
      annotationOrderRiskCount: 0,
      annotationStructParentRiskCount: 0,
      headerFooterPollutionRisk: false,
      sampledStructurePageOrderDriftCount: 0,
      multiColumnOrderRiskPages: 0,
      suspiciousPageCount: 1,
    },
    headingSignals: {
      extractedHeadingCount: 1,
      treeHeadingCount: 1,
      headingTreeDepth: 2,
      extractedHeadingsMissingFromTree: false,
    },
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
    pageCount: 2,
    textByPage: ['Illinois Advisory title and body text.', 'More body text.'],
    textCharCount: 900,
    imageOnlyPageCount: 0,
    metadata: { title: 'Illinois Advisory', language: 'en-US', creator: 'Adobe InDesign', producer: 'Acrobat' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    structTitle: 'Illinois Advisory',
    headings: [{ level: 1, text: 'Illinois Advisory', page: 0, structRef: '10 0 R' }],
    figures: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [{ type: 'H1', children: [] }, { type: 'P', children: [] }] },
    paragraphStructElems: [{ tag: 'P', text: 'Body text', page: 0, structRef: '11 0 R' }],
    mcidTextSpans: [],
    taggedContentAudit: { orphanMcidCount: 0, mcidTextSpanCount: 0, suspectedPathPaintOutsideMc: 0 },
    annotationAccessibility: {
      pagesMissingTabsS: 0,
      pagesAnnotationOrderDiffers: 0,
      linkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingStructure: 0,
      linkAnnotationsMissingStructParent: 0,
      nonLinkAnnotationsMissingStructParent: 0,
      nonLinkAnnotationsMissingContents: 0,
    },
    detectionProfile: detection(),
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...overrides,
  };
}

function analysisFor(snap: DocumentSnapshot): AnalysisResult {
  const analysis = score(snap, META);
  return {
    ...analysis,
    score: 69,
    pdfClass: snap.pdfClass,
    categories: analysis.categories.map(category => {
      if (category.key === 'reading_order') return { ...category, applicable: true, score: 35 };
      if (category.key === 'text_extractability') return { ...category, applicable: true, score: 96 };
      return { ...category, applicable: category.applicable, score: 100 };
    }),
  };
}

describe('Stage 152 native reading-order topup', () => {
  it('classifies shallow tagged reading-order shells as candidates and schedules the tool', () => {
    const snap = snapshot();
    const analysis = analysisFor(snap);
    const disposition = classifyStage152NativeReadingOrderTopup(analysis, snap);
    const params = buildDefaultParams('repair_degenerate_native_reading_order_shell', analysis, snap);
    const planned = planForRemediation(analysis, snap).stages.flatMap(stage => stage.tools.map(tool => tool.toolName));

    expect(disposition.classification).toBe('native_tagged_reading_order_topup_candidate');
    expect(shouldTryNativeReadingOrderTopup(analysis, snap)).toBe(true);
    expect(params).toMatchObject({ maxChildren: 500, maxPages: 2 });
    expect(planned).toContain('repair_degenerate_native_reading_order_shell');
  });

  it('rejects OCR, no-tree native, annotation-risk, and severe table-blocked rows', () => {
    const base = snapshot();
    expect(classifyStage152NativeReadingOrderTopup(
      analysisFor(snapshot({ metadata: { ...base.metadata, creator: 'OCRmyPDF 16' } })),
      snapshot({ metadata: { ...base.metadata, creator: 'OCRmyPDF 16' } }),
    ).classification).toBe('ocr_shell_defer');

    const untagged = snapshot({ pdfClass: 'native_untagged', isTagged: false, structureTree: null });
    expect(classifyStage152NativeReadingOrderTopup(analysisFor(untagged), untagged).classification)
      .toBe('no_tree_native_shell_defer');

    const annotationRisk = snapshot({
      detectionProfile: detection({
        readingOrderSignals: { ...detection().readingOrderSignals, annotationStructParentRiskCount: 2 },
      }),
    });
    expect(classifyStage152NativeReadingOrderTopup(analysisFor(annotationRisk), annotationRisk).classification)
      .toBe('annotation_risk_blocked');

    const tableBlockedAnalysis = {
      ...analysisFor(base),
      categories: analysisFor(base).categories.map(category =>
        category.key === 'table_markup' ? { ...category, applicable: true, score: 0 } : category,
      ),
    };
    expect(classifyStage152NativeReadingOrderTopup(tableBlockedAnalysis, base).classification)
      .toBe('table_or_form_blocked');
  });

});
