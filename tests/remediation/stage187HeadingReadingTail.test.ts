import { describe, expect, it } from 'vitest';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';
import { classifyStage187HeadingReadingTail } from '../../src/services/remediation/stage187HeadingReadingTail.js';
import { buildDefaultParams, planForRemediation } from '../../src/services/remediation/planner.js';

function categories(overrides: Record<string, number | null> = {}): AnalysisResult['categories'] {
  const values: Record<string, number | null> = {
    text_extractability: 96,
    title_language: 100,
    heading_structure: 0,
    alt_text: 100,
    pdf_ua_compliance: 90,
    bookmarks: 100,
    table_markup: 100,
    link_quality: 100,
    reading_order: 45,
    form_accessibility: 100,
    ...overrides,
  };
  return Object.entries(values).map(([key, value]) => ({
    key,
    score: value ?? 100,
    applicable: value !== null,
    severity: value === null || value >= 80 ? 'pass' : 'critical',
    evidence: [],
  })) as AnalysisResult['categories'];
}

function analysis(overrides: Partial<AnalysisResult> = {}, scoreOverrides: Record<string, number | null> = {}): AnalysisResult {
  return {
    filename: 'sample-title.pdf',
    score: 59,
    grade: 'F',
    pdfClass: 'native_tagged',
    categories: categories(scoreOverrides),
    ...overrides,
  } as AnalysisResult;
}

function detection(
  overrides: Partial<NonNullable<DocumentSnapshot['detectionProfile']>> = {},
): NonNullable<DocumentSnapshot['detectionProfile']> {
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
    pageCount: 4,
    textByPage: ['Strong Report Title for Testing\nBody text starts here.'],
    textCharCount: 5000,
    imageOnlyPageCount: 0,
    metadata: { title: 'Strong Report Title for Testing', language: 'en-US' },
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
    mcidTextSpans: [],
    nativeTitleBtCandidates: [],
    detectionProfile: detection(),
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    ...overrides,
  } as DocumentSnapshot;
}

describe('Stage 187 heading/reading tail classifier', () => {
  it('selects native owner bridge candidates for exact visible BT/ET title ownership', () => {
    const disposition = classifyStage187HeadingReadingTail(
      analysis({ filename: 'strong-report-title-for-testing.pdf' }),
      snapshot({
        nativeTitleBtCandidates: [{
          page: 0,
          groupIndexes: [0],
          fontSize: 24,
          x: 100,
          y: 100,
          textOperatorCount: 4,
          encodedTextLength: 90,
          markedDepth: 0,
          score: 100,
        }],
      }),
    );
    expect(disposition).toMatchObject({
      classification: 'native_shell_title_owner_bridge_candidate',
      toolName: 'bridge_native_title_text_owner',
      implementable: true,
    });
  });

  it('selects partial native heading reachability candidates with split MCID title ownership', () => {
    const snap = snapshot({
      textByPage: ['Community Reentry Challenges Daunt Exoffenders\nBody text starts here.'],
      mcidTextSpans: [
        { page: 0, mcid: 10, snippet: '/P <</MCID 10>> BDC BT /F1 24 Tf', resolvedText: 'Community Reentry' },
        { page: 0, mcid: 11, snippet: '/P <</MCID 11>> BDC BT /F1 24 Tf', resolvedText: 'Challenges Daunt' },
        { page: 0, mcid: 12, snippet: '/P <</MCID 12>> BDC BT /F1 24 Tf', resolvedText: 'Exoffenders' },
      ],
      detectionProfile: detection({
        headingSignals: {
          extractedHeadingCount: 1,
          treeHeadingCount: 0,
          headingTreeDepth: 0,
          extractedHeadingsMissingFromTree: true,
        },
      }),
    });
    const disposition = classifyStage187HeadingReadingTail(
      analysis({ filename: '4078-community-reentry-challenges-daunt-exoffenders.pdf' }, { heading_structure: 45, reading_order: 45 }),
      snap,
    );
    expect(disposition).toMatchObject({
      classification: 'native_partial_heading_reachability_candidate',
      toolName: 'create_heading_from_tagged_visible_anchor',
      implementable: true,
    });
  });

  it('selects strict OCR page-1 candidates without using native tools', () => {
    const words = ['NEW', 'FEDERAL', 'JUSTICE', 'AID', 'COMING', 'TO', 'ILLINOIS'];
    const disposition = classifyStage187HeadingReadingTail(
      analysis({
        filename: '3423-new-federal-justice-aid-coming-to-illinois.pdf',
        pdfClass: 'native_tagged',
      }),
      snapshot({
        textByPage: ['NEW FEDERAL JUSTICE AID COMING TO ILLINOIS\nBody text starts here.'],
        metadata: { title: '3423 new federal justice aid coming to illinois', creator: 'OCRmyPDF 16.10.1' },
        remediationProvenance: { engineAppliedOcr: true, engineTaggedOcrText: true, bookmarkStrategy: 'page_outlines' },
        mcidTextSpans: words.map((word, index) => ({
          page: 0,
          mcid: 20 + index,
          snippet: `/P <</MCID ${20 + index}>> BDC`,
          resolvedText: word,
        })),
      }),
    );
    expect(disposition).toMatchObject({
      classification: 'ocr_page1_safe_title_candidate',
      toolName: 'create_heading_from_ocr_page_shell_anchor',
      implementable: true,
    });
  });

  it('parks mixed table/alt debt and known volatile rows instead of forcing heading recovery', () => {
    expect(classifyStage187HeadingReadingTail(
      analysis({}, { heading_structure: 45, reading_order: 45, alt_text: 20, table_markup: 10, pdf_ua_compliance: 57 }),
      snapshot(),
    )).toMatchObject({ classification: 'mixed_alt_table_not_heading_first', implementable: false });

    expect(classifyStage187HeadingReadingTail(
      analysis({}, { heading_structure: 45, reading_order: 45 }),
      snapshot(),
      { knownVolatile: true },
    )).toMatchObject({ classification: 'protected_or_analyzer_volatility', implementable: false });
  });

  it('plans a Stage 187 tagged heading topup for below-A rows with rootless title MCID evidence', () => {
    const analysisInput = analysis({ filename: 'juvenile-recidivism-in-illinois.pdf', score: 79, grade: 'C' }, {
      heading_structure: 78,
      reading_order: 96,
      pdf_ua_compliance: 71,
    });
    const snapshotInput = snapshot({
      textByPage: ['JUVENILE RECIDIVISM IN ILLINOIS: EXPLORING YOUTH RE-ARREST AND RE-INCARCERATION\nBody text starts here.'],
      mcidTextSpans: [{
        page: 0,
        mcid: 4,
        snippet: '/Span <</MCID 4>> BDC BT /F1 24 Tf',
        resolvedText: 'JUVENILE RECIDIVISM IN ILLINOIS: EXPLORING YOUTH RE-ARREST AND RE-INCARCERATION',
      }],
    });
    const disposition = classifyStage187HeadingReadingTail(analysisInput, snapshotInput);
    expect(disposition).toMatchObject({
      classification: 'native_partial_heading_reachability_candidate',
      implementable: true,
      toolName: 'create_heading_from_tagged_visible_anchor',
    });
    const toolNames = planForRemediation(analysisInput, snapshotInput)
      .stages.flatMap(stage => stage.tools.map(tool => tool.toolName));
    expect(toolNames).toContain('create_heading_from_tagged_visible_anchor');
    expect(buildDefaultParams('create_heading_from_tagged_visible_anchor', analysisInput, snapshotInput)).toMatchObject({
      page: 0,
      mcid: 4,
      level: 1,
      stage187HeadingTopup: true,
    });
  });
});
