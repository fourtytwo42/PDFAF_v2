import { describe, expect, it } from 'vitest';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../../src/types.js';
import { classifyStage188MixedTail } from '../../src/services/remediation/stage188MixedTail.js';

function analysis(score = 69, overrides: Partial<Record<CategoryKey, number>> = {}): AnalysisResult {
  const categories: Partial<Record<CategoryKey, number>> = {
    heading_structure: 94,
    reading_order: 96,
    link_quality: 100,
    alt_text: 20,
    table_markup: 44,
    pdf_ua_compliance: 71,
    ...overrides,
  };
  return {
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    pdfClass: 'native_tagged',
    categories: Object.entries(categories).map(([key, value]) => ({
      key: key as CategoryKey,
      score: value ?? 0,
      applicable: true,
    })),
    issues: [],
    suggestions: [],
    scoreCapsApplied: [],
  } as unknown as AnalysisResult;
}

function table(ref: string): DocumentSnapshot['tables'][number] {
  return {
    structRef: ref,
    page: 0,
    hasHeaders: true,
    headerCount: 2,
    totalCells: 30,
    rowCount: 8,
    cellsMisplacedCount: 0,
    irregularRows: 4,
    dominantColumnCount: 4,
    reachable: true,
    directContent: false,
    subtreeMcidCount: 30,
  };
}

function figure(ref: string): DocumentSnapshot['figures'][number] {
  return {
    structRef: ref,
    page: 0,
    role: 'Figure',
    rawRole: 'InlineShape',
    hasAlt: false,
    reachable: true,
    directContent: true,
    subtreeMcidCount: 2,
    isArtifact: false,
  };
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pdfClass: 'native_tagged',
    pageCount: 10,
    textByPage: ['Title'],
    textCharCount: 12000,
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
    tables: [table('100_0'), table('200_0')],
    paragraphStructElems: [],
    orphanMcids: [],
    taggedContentAudit: {
      orphanMcidCount: 2,
      mcidTextSpanCount: 80,
      suspectedPathPaintOutsideMc: 0,
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
    detectionProfile: {
      pdfUaSignals: { orphanMcidCount: 2, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
      annotationSignals: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
      tableSignals: {
        stronglyIrregularTableCount: 2,
        irregularTableCount: 2,
        directCellUnderTableCount: 0,
        misplacedCellCount: 0,
        tablesWithMisplacedCells: 0,
      },
      headingSignals: {
        extractedHeadingCount: 1,
        treeHeadingCount: 1,
        headingTreeDepth: 2,
        extractedHeadingsMissingFromTree: false,
      },
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
    },
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    imageToTextRatio: 0,
    ...overrides,
  } as unknown as DocumentSnapshot;
}

function appliedTable(ref: string, before = 0, after = 0): AppliedRemediationTool {
  return {
    toolName: 'normalize_table_structure',
    stage: 10,
    round: 1,
    scoreBefore: 68,
    scoreAfter: 68,
    delta: 0,
    outcome: 'applied',
    details: JSON.stringify({
      target: { structRef: ref },
      debug: {
        replayState: {
          categoryScoresBefore: { table_markup: before },
          categoryScoresAfter: { table_markup: after },
        },
      },
    }),
  };
}

describe('Stage 188 mixed tail classifier', () => {
  it('selects explicit table repair when unattempted table refs remain and core categories are stable', () => {
    expect(classifyStage188MixedTail({
      analysis: analysis(),
      snapshot: snapshot(),
    })).toMatchObject({
      classification: 'explicit_table_repair_candidate',
      shouldAttemptTable: true,
      shouldAttemptAlt: false,
    });
  });

  it('parks heading/reading-order primary blockers outside Stage 188', () => {
    expect(classifyStage188MixedTail({
      analysis: analysis(59, { heading_structure: 45, reading_order: 45 }),
      snapshot: snapshot(),
    })).toMatchObject({
      classification: 'heading_or_reading_order_not_this_stage',
      shouldAttemptTable: false,
    });
  });

  it('selects hidden alt ownership only after table is stable', () => {
    const snap = snapshot({
      tables: [],
      figures: [figure('fig_1')],
      checkerFigureTargets: [
        {
          structRef: 'fig_1',
          page: 0,
          role: 'Figure',
          resolvedRole: 'Figure',
          reachable: true,
          hasAlt: false,
          isArtifact: false,
          directContent: true,
          parentPath: ['Document'],
        },
      ],
    });

    expect(classifyStage188MixedTail({
      analysis: analysis(82, { table_markup: 100, alt_text: 20 }),
      snapshot: snap,
    })).toMatchObject({
      classification: 'hidden_alt_ownership_candidate',
      shouldAttemptAlt: true,
    });
  });

  it('does not retry table independently after prior table no-gain evidence', () => {
    expect(classifyStage188MixedTail({
      analysis: analysis(),
      snapshot: snapshot(),
      appliedTools: [appliedTable('100_0')],
    })).toMatchObject({
      classification: 'ordered_table_alt_pdfua_transaction_candidate',
      shouldAttemptTable: false,
    });
  });

  it('parks protected/analyzer controls before selecting otherwise valid targets', () => {
    expect(classifyStage188MixedTail({
      analysis: analysis(),
      snapshot: snapshot(),
      parked: true,
    })).toMatchObject({
      classification: 'protected_or_analyzer_volatility',
      shouldAttemptTable: false,
    });
  });
});
