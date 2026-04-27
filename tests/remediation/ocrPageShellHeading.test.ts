import { describe, expect, it } from 'vitest';
import { score } from '../../src/services/scorer/scorer.js';
import {
  classifyStage129OcrPageShell,
  selectOcrPageShellHeadingCandidate,
  shouldTryOcrPageShellHeadingRecovery,
} from '../../src/services/remediation/ocrPageShellHeading.js';
import {
  selectVisibleHeadingAnchorCandidate,
  shouldTryVisibleHeadingAnchorRecovery,
} from '../../src/services/remediation/visibleHeadingAnchor.js';
import { buildDefaultParams, planForRemediation } from '../../src/services/remediation/planner.js';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';

const META = { id: 'stage129', filename: '3423.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

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
      suspiciousPageCount: 1,
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

function makeSnapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  const words = ['NEW', 'FEDERAL', 'JUSTICE', 'AID', 'COMING', 'TO', 'ILLINOIS'];
  return {
    pageCount: 4,
    textByPage: ['NEW FEDERAL JUSTICE AID COMING TO ILLINOIS\nBody text starts here.'],
    textCharCount: 2600,
    imageOnlyPageCount: 0,
    metadata: {
      title: '3423 new federal justice aid coming to illinois',
      language: 'en-US',
      creator: 'OCRmyPDF 16.10.1',
      producer: 'pikepdf',
    },
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
    structureTree: { type: 'Document', children: [{ type: 'P', page: 0, children: [] }] },
    paragraphStructElems: [{ tag: 'P', text: words.join(' '), page: 0, structRef: '10_0', reachable: true, directContent: true, parentPath: ['Document'] }],
    mcidTextSpans: words.map((word, index) => ({
      page: 0,
      mcid: 40 + index,
      snippet: `/P <</MCID ${40 + index}>> BDC`,
      resolvedText: word,
    })),
    taggedContentAudit: { orphanMcidCount: 0, mcidTextSpanCount: words.length, suspectedPathPaintOutsideMc: 0 },
    detectionProfile: detection(),
    remediationProvenance: { engineAppliedOcr: true, engineTaggedOcrText: true, bookmarkStrategy: 'page_outlines' },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...overrides,
  };
}

function withScores(analysis: AnalysisResult, pdfClass: AnalysisResult['pdfClass'] = analysis.pdfClass): AnalysisResult {
  return {
    ...analysis,
    pdfClass,
    score: 52,
    grade: 'F',
    categories: analysis.categories.map(category => {
      if (category.key === 'heading_structure') return { ...category, applicable: true, score: 0 };
      if (category.key === 'text_extractability') return { ...category, applicable: true, score: 96 };
      if (category.key === 'reading_order') return { ...category, applicable: true, score: 35 };
      if (category.key === 'pdf_ua_compliance') return { ...category, applicable: true, score: 80 };
      return { ...category, score: 100 };
    }),
  };
}

function analysisFor(snap: DocumentSnapshot): AnalysisResult {
  return withScores(score(snap, META), snap.pdfClass);
}

describe('Stage 129 OCR page-shell heading recovery', () => {
  it('selects a visible first-page OCR title span and keeps all matched MCIDs', () => {
    const snap = makeSnapshot();
    const analysis = analysisFor(snap);
    const candidate = selectOcrPageShellHeadingCandidate(analysis, snap);
    expect(candidate).toMatchObject({
      page: 0,
      mcid: 40,
      mcids: [40, 41, 42, 43, 44, 45, 46],
      source: 'metadata_visible_match',
      text: 'New Federal Justice Aid Coming to Illinois',
    });
    expect(candidate?.score ?? 0).toBeGreaterThanOrEqual(60);
    expect(classifyStage129OcrPageShell(analysis, snap).classification).toBe('ocr_page_shell_heading_candidate');
    expect(shouldTryOcrPageShellHeadingRecovery(analysis, snap)).toBe(true);
  });

  it('rejects filename-only and generated/page-label anchors without visible OCR text', () => {
    const snap = makeSnapshot({
      textByPage: ['Page 1\nBody text starts here.'],
      metadata: { title: '3423 page 1', language: 'en-US', creator: 'OCRmyPDF', producer: 'pikepdf' },
      mcidTextSpans: [{ page: 0, mcid: 0, snippet: '/P <</MCID 0>> BDC', resolvedText: 'Body' }],
    });
    const analysis = analysisFor(snap);
    expect(selectOcrPageShellHeadingCandidate(analysis, snap)).toBeNull();
    expect(classifyStage129OcrPageShell(analysis, snap).classification).toBe('ocr_text_without_safe_anchor');
  });

  it('skips scanned/no-text rows and already-clean heading rows', () => {
    const noText = makeSnapshot({
      textByPage: [''],
      textCharCount: 0,
      mcidTextSpans: [],
      paragraphStructElems: [],
      pdfClass: 'scanned',
    });
    expect(classifyStage129OcrPageShell(withScores(score(noText, META), 'scanned'), noText).classification)
      .toBe('scanned_no_extractable_text_defer');

    const clean = makeSnapshot({
      headings: [{ level: 1, page: 0, text: 'New Federal Justice Aid Coming To Illinois', structRef: '20_0' }],
      detectionProfile: detection({ headingSignals: { extractedHeadingCount: 1, treeHeadingCount: 1, headingTreeDepth: 2, extractedHeadingsMissingFromTree: false } }),
    });
    const cleanAnalysis = {
      ...analysisFor(clean),
      categories: analysisFor(clean).categories.map(category => category.key === 'heading_structure' ? { ...category, score: 100 } : category),
    };
    expect(shouldTryOcrPageShellHeadingRecovery(cleanAnalysis, clean)).toBe(false);
  });

  it('plans the OCR-shell tool only for OCR page shells and leaves Stage 127 native anchors alone', () => {
    const snap = makeSnapshot();
    const analysis = analysisFor(snap);
    const params = buildDefaultParams('create_heading_from_ocr_page_shell_anchor', analysis, snap);
    expect(params).toMatchObject({
      page: 0,
      mcid: 40,
      mcids: [40, 41, 42, 43, 44, 45, 46],
      level: 1,
    });
    const planned = planForRemediation(analysis, snap, []).stages.flatMap(stage => stage.tools.map(tool => tool.toolName));
    expect(planned).toContain('create_heading_from_ocr_page_shell_anchor');
    expect(planned).not.toContain('create_heading_from_visible_text_anchor');

    const native = makeSnapshot({
      metadata: { title: '', language: 'en-US', creator: '', producer: '' },
      remediationProvenance: undefined,
      pdfClass: 'native_untagged',
      isTagged: false,
      structureTree: null,
      paragraphStructElems: [],
      textByPage: ['EVALUATION OF YOUTH MENTAL HEALTH FIRST AID TRAININGS FOR ILLINOIS SCHOOLS, 2022-2023 Abstract body.'],
      mcidTextSpans: [{ page: 0, mcid: 0, snippet: '/H1 <</MCID 0>> BDC', resolvedText: '\u0000(' }],
    });
    const nativeAnalysis = analysisFor(native);
    expect(shouldTryVisibleHeadingAnchorRecovery(nativeAnalysis, native)).toBe(true);
    expect(selectVisibleHeadingAnchorCandidate(nativeAnalysis, native)?.source).toBe('role_tagged_mcid_first_page');
    const nativePlanned = planForRemediation(nativeAnalysis, native, []).stages.flatMap(stage => stage.tools.map(tool => tool.toolName));
    expect(nativePlanned).toContain('create_heading_from_visible_text_anchor');
    expect(nativePlanned).not.toContain('create_heading_from_ocr_page_shell_anchor');
  });
});
