import { describe, expect, it } from 'vitest';
import { score } from '../../src/services/scorer/scorer.js';
import {
  classifyStage131DegenerateNative,
  selectDegenerateNativeAnchorCandidate,
  shouldTryDegenerateNativeStructureRecovery,
} from '../../src/services/remediation/degenerateNativeStructure.js';
import { buildDefaultParams, planForRemediation } from '../../src/services/remediation/planner.js';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';

const META = { id: 'stage131', filename: 'stage131.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

function detection(overrides: Partial<NonNullable<DocumentSnapshot['detectionProfile']>> = {}): NonNullable<DocumentSnapshot['detectionProfile']> {
  return {
    readingOrderSignals: {
      missingStructureTree: false,
      structureTreeDepth: 1,
      degenerateStructureTree: true,
      annotationOrderRiskCount: 0,
      annotationStructParentRiskCount: 0,
      headerFooterPollutionRisk: false,
      sampledStructurePageOrderDriftCount: 0,
      multiColumnOrderRiskPages: 0,
      suspiciousPageCount: 10,
    },
    headingSignals: {
      extractedHeadingCount: 0,
      treeHeadingCount: 0,
      headingTreeDepth: 0,
      extractedHeadingsMissingFromTree: false,
    },
    figureSignals: { extractedFigureCount: 0, treeFigureCount: 0, nonFigureRoleCount: 0, treeFigureMissingForExtractedFigures: false },
    pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
    annotationSignals: {
      pagesMissingTabsS: 16,
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
    pageCount: 16,
    textByPage: ['Driving under the influence: DUI laws and enforcement in Illinois and the U.S. By Kelly Marzano, ICJIA Research Analyst Vol. 2, No. 11 April 2004 Body starts here.'],
    textCharCount: 58170,
    imageOnlyPageCount: 0,
    metadata: {
      title: 'Driving under the influence: DUI laws and enforcement in Illinois and the U.S.',
      language: 'en-US',
      creator: 'Adobe PageMaker 7.0',
      producer: 'Acrobat Distiller',
    },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    structTitle: 'Driving under the influence: DUI laws and enforcement in Illinois and the U.S.',
    headings: [],
    figures: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    paragraphStructElems: [],
    mcidTextSpans: [],
    taggedContentAudit: { orphanMcidCount: 0, mcidTextSpanCount: 0, suspectedPathPaintOutsideMc: 0 },
    detectionProfile: detection(),
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...overrides,
  };
}

function withScores(analysis: AnalysisResult): AnalysisResult {
  return {
    ...analysis,
    score: 44,
    categories: analysis.categories.map(category => {
      if (category.key === 'heading_structure') return { ...category, applicable: true, score: 0 };
      if (category.key === 'reading_order') return { ...category, applicable: true, score: 0 };
      if (category.key === 'text_extractability') return { ...category, applicable: true, score: 96 };
      if (category.key === 'pdf_ua_compliance') return { ...category, applicable: true, score: 100 };
      return { ...category, score: 100 };
    }),
  };
}

function analysisFor(snap: DocumentSnapshot): AnalysisResult {
  return withScores(score(snap, META));
}

describe('Stage 131 degenerate native structure recovery', () => {
  it('classifies 4002-style degenerate native rows as title-anchor candidates', () => {
    const snap = snapshot();
    const analysis = analysisFor(snap);

    const disposition = classifyStage131DegenerateNative(analysis, snap);

    expect(disposition.classification).toBe('degenerate_native_title_anchor_candidate');
    expect(disposition.candidate?.text).toBe('Driving under the influence: DUI laws and enforcement in Illinois and the U.S.');
  });

  it('rejects weak filename-like or generated page anchors', () => {
    const snap = snapshot({
      textByPage: ['Page 1 Body text starts here.'],
      metadata: { title: 'Page 1', language: 'en-US' },
      structTitle: 'Page 1',
    });
    const analysis = analysisFor(snap);

    expect(selectDegenerateNativeAnchorCandidate(analysis, snap)).toBeNull();
    expect(classifyStage131DegenerateNative(analysis, snap).classification).toBe('marked_content_without_safe_anchor');
  });

  it('skips degenerate native rows with link or annotation structure risk', () => {
    const snap = snapshot({
      detectionProfile: detection({
        annotationSignals: {
          pagesMissingTabsS: 16,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 12,
          nonLinkAnnotationsMissingStructParent: 0,
        },
      }),
    });

    expect(classifyStage131DegenerateNative(analysisFor(snap), snap).classification)
      .toBe('native_link_only_no_structure_candidate');
    expect(shouldTryDegenerateNativeStructureRecovery(analysisFor(snap), snap)).toBe(false);
  });

  it('skips OCR shells and already fixed native controls', () => {
    const ocrSnap = snapshot({ metadata: { title: 'Report Title', creator: 'OCRmyPDF 16.10.4' } });
    expect(classifyStage131DegenerateNative(analysisFor(ocrSnap), ocrSnap).classification).toBe('ocr_shell_defer');

    const fixedSnap = snapshot({
      headings: [{ level: 1, text: 'Report Title', page: 0, structRef: '1 0 R' }],
      detectionProfile: detection({
        readingOrderSignals: { ...detection().readingOrderSignals, structureTreeDepth: 3, degenerateStructureTree: false },
        headingSignals: { extractedHeadingCount: 1, treeHeadingCount: 1, headingTreeDepth: 3, extractedHeadingsMissingFromTree: false },
      }),
    });
    expect(classifyStage131DegenerateNative(analysisFor(fixedSnap), fixedSnap).classification).toBe('already_fixed_control');
  });

  it('schedules the degenerate-native tool without affecting Stage 127 visible-anchor scheduling', () => {
    const snap = snapshot();
    const analysis = analysisFor(snap);
    const params = buildDefaultParams('create_structure_from_degenerate_native_anchor', analysis, snap);
    const names = planForRemediation(analysis, snap).stages.flatMap(stage => stage.tools.map(tool => tool.toolName));

    expect(shouldTryDegenerateNativeStructureRecovery(analysis, snap)).toBe(true);
    expect(params).toMatchObject({ page: 0, level: 1, source: 'metadata_visible_match' });
    expect(names).toContain('create_structure_from_degenerate_native_anchor');
    expect(names).not.toContain('create_heading_from_ocr_page_shell_anchor');
  });
});
