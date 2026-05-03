import { describe, expect, it } from 'vitest';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../../src/types.js';
import { classifyStage189HiddenAltNoGain } from '../../src/services/remediation/stage189HiddenAltNoGain.js';

function analysis(score = 82, overrides: Partial<Record<CategoryKey, number>> = {}): AnalysisResult {
  const categories: Partial<Record<CategoryKey, number>> = {
    heading_structure: 94,
    reading_order: 100,
    link_quality: 100,
    alt_text: 20,
    table_markup: 96,
    pdf_ua_compliance: 83,
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

function figure(input: Partial<DocumentSnapshot['figures'][number]> & { structRef: string }): DocumentSnapshot['figures'][number] {
  return {
    structRef: input.structRef,
    page: input.page ?? 0,
    role: input.role ?? 'Figure',
    rawRole: input.rawRole ?? input.role ?? 'Figure',
    hasAlt: input.hasAlt ?? false,
    altText: input.altText,
    reachable: input.reachable ?? true,
    directContent: input.directContent ?? true,
    subtreeMcidCount: input.subtreeMcidCount ?? 1,
    isArtifact: input.isArtifact ?? false,
    parentPath: input.parentPath ?? ['Document'],
  };
}

function checker(input: Partial<NonNullable<DocumentSnapshot['checkerFigureTargets']>[number]> & { structRef: string }): NonNullable<DocumentSnapshot['checkerFigureTargets']>[number] {
  return {
    structRef: input.structRef,
    page: input.page ?? 0,
    role: input.role ?? 'Figure',
    resolvedRole: input.resolvedRole ?? input.role ?? 'Figure',
    hasAlt: input.hasAlt ?? false,
    altText: input.altText,
    reachable: input.reachable ?? true,
    directContent: input.directContent ?? true,
    isArtifact: input.isArtifact ?? false,
    parentPath: input.parentPath ?? ['Document'],
  };
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  const figures = overrides.figures ?? [
    figure({ structRef: '1_0', hasAlt: true, altText: 'Illustration (page 1)' }),
    figure({ structRef: '2_0', hasAlt: false }),
  ];
  return {
    pdfClass: 'native_tagged',
    pageCount: 10,
    textByPage: ['Title'],
    textCharCount: 12000,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [{ level: 1, text: 'Title', page: 0, structRef: '10_0' }],
    figures,
    checkerFigureTargets: overrides.checkerFigureTargets ?? [
      checker({ structRef: '1_0', hasAlt: true, altText: 'Illustration (page 1)' }),
      checker({ structRef: '2_0', hasAlt: false }),
    ],
    tables: [],
    paragraphStructElems: [],
    orphanMcids: [],
    taggedContentAudit: {
      orphanMcidCount: 0,
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
      pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
      annotationSignals: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
      tableSignals: {
        stronglyIrregularTableCount: 0,
        irregularTableCount: 0,
        directCellUnderTableCount: 0,
        misplacedCellCount: 0,
        tablesWithMisplacedCells: 0,
      },
      figureSignals: {
        extractedFigureCount: figures.length,
        treeFigureCount: figures.filter(item => item.role === 'Figure').length,
        nonFigureRoleCount: 0,
        treeFigureMissingForExtractedFigures: false,
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

function altTool(input: {
  targetRef?: string;
  beforeAlt?: number;
  afterAlt?: number;
  beforeChecker?: number;
  afterChecker?: number;
  beforeCheckerWithAlt?: number;
  afterCheckerWithAlt?: number;
  outcome?: AppliedRemediationTool['outcome'];
  note?: string;
}): AppliedRemediationTool {
  return {
    toolName: 'set_figure_alt_text',
    stage: 10,
    round: 1,
    scoreBefore: 82,
    scoreAfter: 82,
    delta: 0,
    outcome: input.outcome ?? 'rejected',
    details: JSON.stringify({
      outcome: input.outcome ?? 'rejected',
      note: input.note ?? 'stage181_hidden_alt_no_alt_gain',
      targetRefs: input.targetRef ? [input.targetRef] : [],
      invariants: {
        targetRef: input.targetRef,
        targetReachable: true,
        targetIsFigureAfter: true,
        targetHasAltAfter: true,
      },
      structuralBenefits: { figureAltAttachedToReachableFigure: true },
      debug: {
        replayState: {
          categoryScoresBefore: { alt_text: input.beforeAlt ?? 20 },
          categoryScoresAfter: { alt_text: input.afterAlt ?? 20 },
          detectionSignalsBefore: {
            checkerVisibleFigureCount: input.beforeChecker ?? 2,
            checkerVisibleFigureAltCount: input.beforeCheckerWithAlt ?? 1,
          },
          detectionSignalsAfter: {
            checkerVisibleFigureCount: input.afterChecker ?? 2,
            checkerVisibleFigureAltCount: input.afterCheckerWithAlt ?? 2,
          },
        },
      },
    }),
  };
}

describe('Stage 189 hidden-alt no-gain classifier', () => {
  it('flags full checker-visible alt coverage with no category gain as analyzer alignment evidence', () => {
    expect(classifyStage189HiddenAltNoGain({
      analysis: analysis(82, { alt_text: 20, table_markup: 96 }),
      snapshot: snapshot({
        figures: [
          figure({ structRef: '1_0', hasAlt: true, altText: 'Illustration (page 1)' }),
          figure({ structRef: '2_0', hasAlt: true, altText: 'Illustration (page 2)' }),
        ],
        checkerFigureTargets: [
          checker({ structRef: '1_0', hasAlt: true, altText: 'Illustration (page 1)' }),
          checker({ structRef: '2_0', hasAlt: true, altText: 'Illustration (page 2)' }),
        ],
      }),
      appliedTools: [altTool({ beforeAlt: 20, afterAlt: 20, beforeCheckerWithAlt: 1, afterCheckerWithAlt: 2 })],
    })).toMatchObject({
      classification: 'alt_written_but_analyzer_not_counting',
      safeAnalyzerAlignmentCandidate: true,
    });
  });

  it('parks full checker-visible coverage when non-Figure role debt still suppresses alt scoring', () => {
    expect(classifyStage189HiddenAltNoGain({
      analysis: analysis(59, { alt_text: 0, table_markup: 96 }),
      snapshot: snapshot({
        figures: [
          figure({ structRef: '1_0', hasAlt: true, altText: 'Illustration (page 1)' }),
          figure({ structRef: '2_0', hasAlt: true, altText: 'Illustration (page 2)' }),
          figure({ structRef: '3_0', role: 'Figure', rawRole: 'InlineShape', hasAlt: false }),
        ],
        checkerFigureTargets: [
          checker({ structRef: '1_0', hasAlt: true, altText: 'Illustration (page 1)' }),
          checker({ structRef: '2_0', hasAlt: true, altText: 'Illustration (page 2)' }),
        ],
        detectionProfile: {
          ...snapshot().detectionProfile!,
          figureSignals: {
            extractedFigureCount: 3,
            treeFigureCount: 2,
            nonFigureRoleCount: 1,
            treeFigureMissingForExtractedFigures: false,
          },
        },
      }),
      appliedTools: [altTool({ beforeAlt: 0, afterAlt: 0, beforeCheckerWithAlt: 1, afterCheckerWithAlt: 2 })],
    })).toMatchObject({
      classification: 'hidden_alt_target_beyond_existing_cap',
      safeAnalyzerAlignmentCandidate: false,
    });
  });

  it('flags alt mutations that target non-scored figures', () => {
    expect(classifyStage189HiddenAltNoGain({
      analysis: analysis(),
      snapshot: snapshot(),
      appliedTools: [altTool({
        outcome: 'applied',
        beforeCheckerWithAlt: 1,
        afterCheckerWithAlt: 1,
        beforeAlt: 20,
        afterAlt: 20,
      })],
    })).toMatchObject({
      classification: 'alt_mutation_target_not_checker_scored',
    });
  });

  it('flags current missing-alt refs that differ from all prior attempted refs', () => {
    expect(classifyStage189HiddenAltNoGain({
      analysis: analysis(),
      snapshot: snapshot(),
      appliedTools: [altTool({
        targetRef: 'old_0',
        outcome: 'applied',
        beforeCheckerWithAlt: 0,
        afterCheckerWithAlt: 0,
        beforeAlt: 20,
        afterAlt: 20,
      })],
    })).toMatchObject({
      classification: 'wrong_ref_due_route_rewrite',
      shouldCorrectTargetSelection: true,
    });
  });

  it('does not flag stale refs when direct checker-visible alt coverage is already full', () => {
    expect(classifyStage189HiddenAltNoGain({
      analysis: analysis(),
      snapshot: snapshot({
        figures: [
          figure({ structRef: '34_0', hasAlt: true, altText: 'Illustration (page 1)' }),
          figure({ structRef: '35_0', hasAlt: true, altText: 'Illustration (page 1)' }),
          figure({ structRef: '75_0', role: 'Figure', rawRole: 'InlineShape', hasAlt: false }),
        ],
        checkerFigureTargets: [
          checker({ structRef: '34_0', hasAlt: true, altText: 'Illustration (page 1)' }),
          checker({ structRef: '35_0', hasAlt: true, altText: 'Illustration (page 1)' }),
        ],
      }),
      appliedTools: [altTool({
        targetRef: '18_0',
        outcome: 'applied',
        beforeChecker: 1,
        afterChecker: 2,
        beforeCheckerWithAlt: 1,
        afterCheckerWithAlt: 2,
        beforeAlt: 20,
        afterAlt: 20,
      })],
    })).toMatchObject({
      classification: 'hidden_alt_target_beyond_existing_cap',
      shouldCorrectTargetSelection: false,
    });
  });

  it('parks mixed heading/table blockers outside Stage 189', () => {
    expect(classifyStage189HiddenAltNoGain({
      analysis: analysis(59, { heading_structure: 45, reading_order: 45, table_markup: 16 }),
      snapshot: snapshot(),
    })).toMatchObject({
      classification: 'mixed_table_or_heading_blocker',
    });
  });

  it('parks protected/analyzer controls before selecting otherwise valid rows', () => {
    expect(classifyStage189HiddenAltNoGain({
      analysis: analysis(),
      snapshot: snapshot(),
      parked: true,
      appliedTools: [altTool({ beforeAlt: 20, afterAlt: 20, beforeCheckerWithAlt: 1, afterCheckerWithAlt: 2 })],
    })).toMatchObject({
      classification: 'protected_or_analyzer_volatility',
      safeAnalyzerAlignmentCandidate: false,
    });
  });
});
