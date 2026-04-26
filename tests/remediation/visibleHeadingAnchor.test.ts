import { describe, expect, it } from 'vitest';
import { score } from '../../src/services/scorer/scorer.js';
import {
  classifyStage127ZeroHeadingAnchor,
  extractFirstPageVisibleHeadingText,
  selectVisibleHeadingAnchorCandidate,
  shouldTryVisibleHeadingAnchorRecovery,
} from '../../src/services/remediation/visibleHeadingAnchor.js';
import { buildDefaultParams, planForRemediation } from '../../src/services/remediation/planner.js';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';

const META = { id: 'stage127', filename: 'stage127.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

function detection(overrides: Partial<NonNullable<DocumentSnapshot['detectionProfile']>> = {}): NonNullable<DocumentSnapshot['detectionProfile']> {
  return {
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
    textByPage: ['EVALUATION OF YOUTH MENTAL HEALTH FIRST AID TRAININGS FOR ILLINOIS SCHOOLS, 2022-2023 Abstract: Body text starts here.'],
    textCharCount: 5000,
    imageOnlyPageCount: 0,
    metadata: { title: '', language: 'en-US', author: '', subject: '' },
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
    structureTree: { type: 'Document', children: [] },
    paragraphStructElems: [],
    mcidTextSpans: [{
      page: 0,
      mcid: 0,
      snippet: '0 0 0 rg /G3 gs /H1 <</MCID 0 >> BDC BT /F10 24 Tf',
      resolvedText: '\u0000(',
    }],
    taggedContentAudit: { orphanMcidCount: 1, mcidTextSpanCount: 1, suspectedPathPaintOutsideMc: 0 },
    detectionProfile: detection(),
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...overrides,
  };
}

function withScores(analysis: AnalysisResult): AnalysisResult {
  return {
    ...analysis,
    score: 59,
    categories: analysis.categories.map(category => {
      if (category.key === 'heading_structure') return { ...category, applicable: true, score: 0 };
      if (category.key === 'text_extractability') return { ...category, applicable: true, score: 96 };
      if (category.key === 'reading_order') return { ...category, applicable: true, score: 96 };
      if (category.key === 'pdf_ua_compliance') return { ...category, applicable: true, score: 83 };
      return { ...category, score: 100 };
    }),
  };
}

function analysisFor(snap: DocumentSnapshot): AnalysisResult {
  return withScores(score(snap, META));
}

describe('Stage 127 visible heading anchor recovery', () => {
  it('extracts a compact first-page visible title before abstract/body text', () => {
    expect(extractFirstPageVisibleHeadingText(snapshot(), 'report.pdf')).toBe(
      'EVALUATION OF YOUTH MENTAL HEALTH FIRST AID TRAININGS FOR ILLINOIS SCHOOLS, 2022-2023',
    );
  });

  it('selects a role-tagged page-0 MCID even when raw MCID text is not decodable', () => {
    const snap = snapshot();
    const analysis = analysisFor(snap);
    const candidate = selectVisibleHeadingAnchorCandidate(analysis, snap);
    expect(candidate).toMatchObject({
      page: 0,
      mcid: 0,
      source: 'role_tagged_mcid_first_page',
    });
    expect(candidate?.score ?? 0).toBeGreaterThanOrEqual(60);
  });

  it('rejects generated page outlines and filename-only titles without content anchors', () => {
    const snap = snapshot({
      textByPage: ['Page 1 Body text only.'],
      metadata: { title: 'stage127', language: 'en-US', author: '', subject: '' },
      bookmarks: [{ title: 'Page 1', level: 1 }],
      mcidTextSpans: [],
      taggedContentAudit: { orphanMcidCount: 0, mcidTextSpanCount: 0, suspectedPathPaintOutsideMc: 0 },
    });
    const analysis = analysisFor(snap);
    expect(selectVisibleHeadingAnchorCandidate(analysis, snap)).toBeNull();
    expect(classifyStage127ZeroHeadingAnchor(analysis, snap).classification).toBe('no_safe_candidate');
  });

  it('classifies OCR-created page shells as deferred', () => {
    const snap = snapshot({
      metadata: { title: '', language: 'en-US', author: '', subject: '', creator: 'OCRmyPDF' },
      remediationProvenance: { engineAppliedOcr: true, engineTaggedOcrText: true, bookmarkStrategy: 'page_outlines' },
    });
    const analysis = analysisFor(snap);
    expect(classifyStage127ZeroHeadingAnchor(analysis, snap).classification).toBe('ocr_page_shell_defer');
    expect(shouldTryVisibleHeadingAnchorRecovery(analysis, snap)).toBe(false);
  });

  it('schedules create_heading_from_visible_text_anchor only for native no-tree visible-anchor zero-heading rows', () => {
    const snap = snapshot({
      pdfClass: 'native_untagged',
      structureTree: null,
      isTagged: false,
      detectionProfile: detection({
        readingOrderSignals: {
          ...detection().readingOrderSignals,
          missingStructureTree: true,
          structureTreeDepth: 0,
        },
      }),
    });
    const analysis = analysisFor(snap);
    expect(shouldTryVisibleHeadingAnchorRecovery(analysis, snap)).toBe(true);
    expect(buildDefaultParams('create_heading_from_visible_text_anchor', analysis, snap)).toMatchObject({
      page: 0,
      mcid: 0,
      level: 1,
      text: 'EVALUATION OF YOUTH MENTAL HEALTH FIRST AID TRAININGS FOR ILLINOIS SCHOOLS, 2022-2023',
    });
    const names = planForRemediation(analysis, snap, []).stages.flatMap(stage => stage.tools.map(tool => tool.toolName));
    expect(names).toContain('create_heading_from_visible_text_anchor');

    const ocrSnap = snapshot({ pdfClass: 'scanned' });
    const ocrAnalysis = { ...analysisFor(ocrSnap), pdfClass: 'scanned' as const };
    expect(planForRemediation(ocrAnalysis, ocrSnap, []).stages.flatMap(stage => stage.tools.map(tool => tool.toolName)))
      .not.toContain('create_heading_from_visible_text_anchor');
  });

  it('does not schedule the visible-anchor tool for existing paragraph-candidate recovery', () => {
    const snap = snapshot({
      paragraphStructElems: [{
        tag: 'P',
        page: 0,
        structRef: '12_0',
        text: 'Executive Summary',
        reachable: true,
        directContent: true,
        parentPath: ['Document'],
        bbox: [72, 710, 260, 734],
      }],
    });
    const analysis = analysisFor(snap);
    expect(selectVisibleHeadingAnchorCandidate(analysis, snap)?.source).toBe('paragraph_candidate');
    expect(shouldTryVisibleHeadingAnchorRecovery(analysis, snap)).toBe(false);
    const names = planForRemediation(analysis, snap, []).stages.flatMap(stage => stage.tools.map(tool => tool.toolName));
    expect(names).not.toContain('create_heading_from_visible_text_anchor');
  });
});
