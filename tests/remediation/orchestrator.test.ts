import { describe, expect, it } from 'vitest';
import { compareStructuralConfidence, mergePlanningSummaries, shouldRejectStageResult } from '../../src/services/remediation/orchestrator.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot, PlanningSummary, RemediationStagePlan } from '../../src/types.js';

function makeAnalysis(input: {
  score: number;
  confidence?: 'high' | 'medium' | 'low';
}): AnalysisResult {
  return {
    id: `analysis-${input.score}-${input.confidence ?? 'none'}`,
    timestamp: '2026-04-18T00:00:00.000Z',
    filename: 'fixture.pdf',
    pageCount: 1,
    pdfClass: 'native_tagged',
    score: input.score,
    grade: 'B',
    categories: [],
    findings: [],
    analysisDurationMs: 1,
    ...(input.confidence
      ? {
          structuralClassification: {
            structureClass: 'native_tagged',
            contentProfile: {
              pageBucket: '1-5',
              dominantContent: 'text',
              hasStructureTree: true,
              hasBookmarks: false,
              hasFigures: false,
              hasTables: false,
              hasForms: false,
              annotationRisk: false,
              taggedContentRisk: false,
              listStructureRisk: false,
            },
            fontRiskProfile: {
              riskLevel: 'low',
              riskyFontCount: 0,
              missingUnicodeFontCount: 0,
              unembeddedFontCount: 0,
              ocrTextLayerSuspected: false,
            },
            confidence: input.confidence,
          },
        }
      : {}),
  };
}

function makeStage(toolName = 'bootstrap_struct_tree'): RemediationStagePlan {
  return {
    stageNumber: 1,
    reanalyzeAfter: true,
    tools: [{ toolName, params: {}, rationale: 'test' }],
  };
}

function makeApplied(toolName = 'bootstrap_struct_tree'): AppliedRemediationTool[] {
  return [{
    toolName,
    stage: 1,
    round: 1,
    scoreBefore: 80,
    scoreAfter: 80,
    delta: 0,
    outcome: 'applied',
  }];
}

function makeSnapshot(input: { depth: number; title?: string; textCharCount?: number }): DocumentSnapshot {
  return {
    pageCount: 4,
    textByPage: Array(4).fill('Readable text'),
    textCharCount: input.textCharCount ?? 1200,
    imageOnlyPageCount: 0,
    metadata: { title: input.title ?? 'Doc Title', language: 'en-US' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [{ level: 1, text: 'Doc Title', page: 0 }],
    figures: [],
    tables: [],
    fonts: [{ name: 'Arial', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: input.depth > 0 ? { type: 'Document', children: input.depth > 1 ? [{ type: 'Sect', children: [] }] : [] } : null,
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    detectionProfile: {
      readingOrderSignals: {
        missingStructureTree: input.depth === 0,
        structureTreeDepth: input.depth,
        degenerateStructureTree: input.depth <= 1,
        annotationOrderRiskCount: 0,
        annotationStructParentRiskCount: 0,
        headerFooterPollutionRisk: false,
        sampledStructurePageOrderDriftCount: 0,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 1,
      },
      headingSignals: {
        extractedHeadingCount: 1,
        treeHeadingCount: input.depth > 1 ? 1 : 0,
        headingTreeDepth: input.depth,
        extractedHeadingsMissingFromTree: input.depth <= 1,
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
  };
}

describe('compareStructuralConfidence', () => {
  it('detects a confidence regression', () => {
    const result = compareStructuralConfidence(
      makeAnalysis({ score: 80, confidence: 'high' }),
      makeAnalysis({ score: 85, confidence: 'medium' }),
    );
    expect(result).toEqual({
      regressed: true,
      reason: 'stage_regressed_structural_confidence(high->medium)',
    });
  });

  it('ignores missing structural classifications', () => {
    const result = compareStructuralConfidence(
      makeAnalysis({ score: 80, confidence: 'high' }),
      makeAnalysis({ score: 85 }),
    );
    expect(result).toEqual({
      regressed: false,
      reason: null,
    });
  });
});

describe('mergePlanningSummaries', () => {
  it('preserves route summaries across remediation rounds', () => {
    const prior: PlanningSummary = {
      primaryRoute: 'post_bootstrap_heading_convergence',
      secondaryRoutes: [],
      triggeringSignals: ['heading_debt'],
      scheduledTools: ['create_heading_from_candidate'],
      routeSummaries: [{
        route: 'post_bootstrap_heading_convergence',
        status: 'active',
        scheduledTools: ['create_heading_from_candidate'],
      }],
      skippedTools: [],
      semanticDeferred: false,
    };
    const next: PlanningSummary = {
      primaryRoute: 'post_bootstrap_heading_convergence',
      secondaryRoutes: ['figure_semantics'],
      triggeringSignals: ['heading_debt', 'figure_debt'],
      scheduledTools: ['set_figure_alt_text'],
      routeSummaries: [
        {
          route: 'post_bootstrap_heading_convergence',
          status: 'stopped',
          reason: 'route_failure_no_benefit_prior_round(post_bootstrap_heading_convergence:round2)',
          scheduledTools: [],
        },
        {
          route: 'figure_semantics',
          status: 'active',
          scheduledTools: ['set_figure_alt_text'],
        },
      ],
      skippedTools: [{ toolName: 'create_heading_from_candidate', reason: 'missing_precondition' }],
      semanticDeferred: true,
    };

    expect(mergePlanningSummaries(prior, next)?.routeSummaries).toEqual(
      expect.arrayContaining([
        {
          route: 'post_bootstrap_heading_convergence',
          status: 'stopped',
          reason: 'route_failure_no_benefit_prior_round(post_bootstrap_heading_convergence:round2)',
          scheduledTools: ['create_heading_from_candidate'],
        },
        {
          route: 'figure_semantics',
          status: 'active',
          scheduledTools: ['set_figure_alt_text'],
        },
      ]),
    );
  });
});

describe('shouldRejectStageResult', () => {
  it('rejects score-improving stages that lower structural confidence', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'high' }),
      after: makeAnalysis({ score: 85, confidence: 'medium' }),
      stage: makeStage(),
      stageApplied: makeApplied(),
    });
    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_structural_confidence(high->medium)',
    });
  });

  it('accepts score-improving stages when confidence stays the same', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 85, confidence: 'medium' }),
      stage: makeStage(),
      stageApplied: makeApplied(),
    });
    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('keeps existing score-regression rollback behavior', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 75, confidence: 'high' }),
      stage: makeStage(),
      stageApplied: makeApplied(),
    });
    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_score(75)',
    });
  });

  it('keeps score-regressing structural stages when checker-facing heading semantics improve', () => {
    const beforeSnapshot = makeSnapshot({ depth: 1 });
    const afterSnapshot: DocumentSnapshot = {
      ...beforeSnapshot,
      headings: [{ level: 1, text: 'Recovered Heading', page: 0 }],
      detectionProfile: {
        ...beforeSnapshot.detectionProfile!,
        headingSignals: {
          ...beforeSnapshot.detectionProfile!.headingSignals,
          extractedHeadingCount: 1,
          treeHeadingCount: 1,
          headingTreeDepth: 2,
          extractedHeadingsMissingFromTree: false,
        },
      },
    };
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 76, confidence: 'high' }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('repair_structure_conformance'),
      stageApplied: [{
        toolName: 'repair_structure_conformance',
        stage: 1,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 76,
        delta: -4,
        outcome: 'applied',
        details: JSON.stringify({
          outcome: 'applied',
          note: 'rolemap_heading_rewrite',
        }),
      }],
    });
    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('keeps score-regressing stages when typed structural benefits are present and invariants pass', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 77, confidence: 'medium' }),
      stage: makeStage('set_figure_alt_text'),
      stageApplied: [{
        toolName: 'set_figure_alt_text',
        stage: 1,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 77,
        delta: -3,
        outcome: 'applied',
        details: JSON.stringify({
          outcome: 'applied',
          invariants: {
            targetResolved: true,
            targetReachable: true,
            targetIsFigureAfter: true,
            targetHasAltAfter: true,
          },
          structuralBenefits: {
            figureAltAttachedToReachableFigure: true,
          },
        }),
      }],
    });
    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('does not keep score-regressing stages when claimed structural benefits have failing invariants', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 77, confidence: 'medium' }),
      stage: makeStage('set_figure_alt_text'),
      stageApplied: [{
        toolName: 'set_figure_alt_text',
        stage: 1,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 77,
        delta: -3,
        outcome: 'applied',
        details: JSON.stringify({
          outcome: 'applied',
          invariants: {
            targetResolved: true,
            targetReachable: false,
            targetIsFigureAfter: true,
            targetHasAltAfter: true,
          },
          structuralBenefits: {
            figureAltAttachedToReachableFigure: true,
          },
        }),
      }],
    });
    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_score(77)',
    });
  });

  it('does not keep score-regressing stages from legacy note-only mutation details', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 77, confidence: 'medium' }),
      stage: makeStage('repair_structure_conformance'),
      stageApplied: [{
        toolName: 'repair_structure_conformance',
        stage: 1,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 77,
        delta: -3,
        outcome: 'applied',
        details: JSON.stringify({
          outcome: 'applied',
          note: 'rolemap_heading_rewrite',
        }),
      }],
    });
    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_score(77)',
    });
  });

  it('keeps score-regressing stages when checker-facing link semantics improve', () => {
    const beforeSnapshot: DocumentSnapshot = {
      ...makeSnapshot({ depth: 2 }),
      links: [
        { text: 'https://example.com/path', url: 'https://example.com/path', page: 0 },
        { text: 'Read more', url: 'https://example.com/other', page: 0 },
      ],
      annotationAccessibility: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 2,
        nonLinkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingContents: 0,
        linkAnnotationsMissingStructParent: 2,
        nonLinkAnnotationsMissingStructParent: 0,
      },
    };
    const afterSnapshot: DocumentSnapshot = {
      ...beforeSnapshot,
      links: [
        { text: 'Example resource', url: 'https://example.com/path', page: 0 },
        { text: 'Program overview', url: 'https://example.com/other', page: 0 },
      ],
      annotationAccessibility: {
        ...beforeSnapshot.annotationAccessibility!,
        linkAnnotationsMissingStructure: 0,
        linkAnnotationsMissingStructParent: 0,
      },
    };
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 75, confidence: 'medium' }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('repair_native_link_structure'),
      stageApplied: [{
        toolName: 'repair_native_link_structure',
        stage: 1,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 75,
        delta: -5,
        outcome: 'applied',
      }],
    });
    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('does not reject score-improving stages when confidence is missing on either side', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80 }),
      after: makeAnalysis({ score: 85, confidence: 'low' }),
      stage: makeStage(),
      stageApplied: makeApplied(),
    });
    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('rejects score-improving structural stages when ICJIA-parity debug says the root tree is still shallow', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 85, confidence: 'medium' }),
      stage: makeStage('synthesize_basic_structure_from_layout'),
      stageApplied: [{
        toolName: 'synthesize_basic_structure_from_layout',
        stage: 1,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 80,
        delta: 0,
        outcome: 'applied',
        details: JSON.stringify({
          outcome: 'applied',
          debug: {
            rootReachableDepth: 1,
          },
        }),
      }],
    });
    expect(result).toEqual({
      reject: true,
      reason: 'stage_externally_incomplete(rootReachableDepth<=1)',
    });
  });

  it('rejects structural stage when qpdfVerifiedDepth=0 even if pikepdf rootReachableDepth looks healthy', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 85, confidence: 'medium' }),
      stage: makeStage('synthesize_basic_structure_from_layout'),
      stageApplied: [{
        toolName: 'synthesize_basic_structure_from_layout',
        stage: 1,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 85,
        delta: 5,
        outcome: 'applied',
        details: JSON.stringify({
          outcome: 'applied',
          debug: {
            rootReachableDepth: 3,  // pikepdf sees depth 3 (inline objects)
            qpdfVerifiedDepth: 0,   // qpdf sees depth 0 (inline /StructTreeRoot not in object dict)
          },
        }),
      }],
    });
    expect(result).toEqual({
      reject: true,
      reason: 'stage_externally_incomplete(rootReachableDepth<=1)',
    });
  });

  it('accepts structural stage when qpdfVerifiedDepth >= 2', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 85, confidence: 'medium' }),
      stage: makeStage('synthesize_basic_structure_from_layout'),
      stageApplied: [{
        toolName: 'synthesize_basic_structure_from_layout',
        stage: 1,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 85,
        delta: 5,
        outcome: 'applied',
        details: JSON.stringify({
          outcome: 'applied',
          debug: {
            rootReachableDepth: 3,
            qpdfVerifiedDepth: 2,
          },
        }),
      }],
    });
    expect(result.reject).toBe(false);
  });

  it('rejects score-improving structural stages when local parity still floors reading order at 30', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium' }),
      after: makeAnalysis({ score: 85, confidence: 'medium' }),
      beforeSnapshot: makeSnapshot({ depth: 1 }),
      afterSnapshot: makeSnapshot({ depth: 1 }),
      stage: makeStage('repair_structure_conformance'),
      stageApplied: makeApplied('repair_structure_conformance'),
    });
    expect(result).toEqual({
      reject: true,
      reason: 'stage_externally_incomplete(parityReadingOrder=30)',
    });
  });
});
