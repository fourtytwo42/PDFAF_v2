import { describe, expect, it } from 'vitest';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';
import {
  classifyStage170NativeTitleOwnerBridge,
  extractNativeOwnerBridgeVisibleTitle,
  selectNativeTitleOwnerBridgeCandidate,
} from '../../src/services/remediation/nativeTitleOwnerBridge.js';
import { buildDefaultParams, planForRemediation } from '../../src/services/remediation/planner.js';

function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    filename: '4760-the-evaluation-of-the-illinois-multi-site-police-initiated-deflection.pdf',
    score: 59,
    grade: 'F',
    pdfClass: 'native_tagged',
    categories: [
      { key: 'text_extractability', score: 96, applicable: true, severity: 'pass', evidence: [] },
      { key: 'heading_structure', score: 0, applicable: true, severity: 'critical', evidence: [] },
      { key: 'reading_order', score: 80, applicable: true, severity: 'moderate', evidence: [] },
    ],
    ...overrides,
  } as AnalysisResult;
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 22,
    textByPage: [
      [
        'Vol. 7 No. 11',
        'ISSN: 2752-1400',
        '2025',
        'The Evaluation of the Illinois Multi-Site Police-Initiated',
        'De fl ection Initiative',
        'Jessica Reichert, Alex Menninger',
      ].join('\n'),
    ],
    textCharCount: 50000,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [],
    figures: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    paragraphStructElems: [],
    mcidTextSpans: [
      { page: 0, mcid: 0, snippet: '/NonStruct <</MCID 0 >>BDC', resolvedText: '\u0000\u0003' },
    ],
    nativeTitleBtCandidates: [
      {
        page: 0,
        groupIndexes: [6, 7],
        fontSize: 24,
        x: 143,
        y: 234,
        textOperatorCount: 80,
        encodedTextLength: 500,
        markedDepth: 0,
        score: 116,
      },
    ],
    detectionProfile: {
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
      tableSignals: { tablesWithMisplacedCells: 0, misplacedCellCount: 0, irregularTableCount: 0, stronglyIrregularTableCount: 0, directCellUnderTableCount: 0 },
      sampledPages: [0],
      confidence: 'high',
    },
    ...overrides,
  } as DocumentSnapshot;
}

describe('Stage 170 native title owner bridge', () => {
  it('extracts the first real title line after journal metadata', () => {
    expect(extractNativeOwnerBridgeVisibleTitle(snapshot())).toBe(
      'The Evaluation of the Illinois Multi-Site Police-Initiated De fl ection Initiative',
    );
  });

  it('selects a native title BT owner bridge candidate', () => {
    expect(selectNativeTitleOwnerBridgeCandidate(analysis(), snapshot())).toMatchObject({
      page: 0,
      groupIndexes: [6, 7],
      text: 'The Evaluation of the Illinois Multi-Site Police-Initiated De fl ection Initiative',
    });
  });

  it('plans the bridge tool and emits exact group indexes', () => {
    const plan = planForRemediation(analysis(), snapshot());
    const tools = plan.stages.flatMap(stage => stage.tools.map(tool => tool.toolName));
    expect(tools).toContain('bridge_native_title_text_owner');
    expect(buildDefaultParams('bridge_native_title_text_owner', analysis(), snapshot())).toMatchObject({
      page: 0,
      groupIndexes: [6, 7],
      level: 1,
      text: 'The Evaluation of the Illinois Multi-Site Police-Initiated De fl ection Initiative',
    });
  });

  it('classifies the ownerless visible title as implementable only when BT evidence exists', () => {
    expect(classifyStage170NativeTitleOwnerBridge(analysis(), snapshot())).toMatchObject({
      classification: 'native_title_bt_owner_bridge_candidate',
      candidate: expect.objectContaining({ groupIndexes: [6, 7] }),
    });
    expect(classifyStage170NativeTitleOwnerBridge(analysis(), snapshot({ nativeTitleBtCandidates: [] }))).toMatchObject({
      classification: 'native_title_visible_but_unlocatable',
      candidate: null,
    });
  });

  it('parks route volatile and already fixed controls', () => {
    expect(classifyStage170NativeTitleOwnerBridge(analysis(), snapshot(), { routeVolatile: true })).toMatchObject({
      classification: 'route_order_volatility',
    });
    expect(classifyStage170NativeTitleOwnerBridge(analysis(), snapshot(), { alreadyFixedControl: true })).toMatchObject({
      classification: 'already_fixed_control',
    });
  });

  it('rejects OCR, existing headings, weak text, and link ownership risk', () => {
    expect(classifyStage170NativeTitleOwnerBridge(
      analysis({ pdfClass: 'scanned' }),
      snapshot({ remediationProvenance: { engineAppliedOcr: true, engineTaggedOcrText: true, bookmarkStrategy: 'none' } }),
    )).toMatchObject({ classification: 'no_safe_anchor' });
    expect(classifyStage170NativeTitleOwnerBridge(
      analysis({ categories: [{ key: 'heading_structure', score: 90, applicable: true, severity: 'pass', evidence: [] }] as AnalysisResult['categories'] }),
      snapshot(),
    )).toMatchObject({ classification: 'no_safe_anchor' });
    expect(classifyStage170NativeTitleOwnerBridge(
      analysis(),
      snapshot({ annotationAccessibility: { linkAnnotationsMissingStructParent: 1 } as DocumentSnapshot['annotationAccessibility'] }),
    )).toMatchObject({ classification: 'native_title_visual_or_link_risk' });
  });
});
