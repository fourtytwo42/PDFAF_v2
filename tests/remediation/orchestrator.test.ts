import { describe, expect, it } from 'vitest';
import {
  compareStructuralConfidence,
  buildReplayStateSignature,
  enrichDetailsWithReplayState,
  hasCheckerVisibleFigureAltProgressDespiteScoreShape,
  mergePlanningSummaries,
  parseMutationDetails,
  protectedBaselineFloorViolation,
  protectedBaselineReanalysisDecision,
  protectedFinalReanalysisPolicyDecision,
  protectedBaselineRunCheckpointDecision,
  protectedBaselineRunStateUnsafeReason,
  protectedBaselineRunStateIsSafe,
  protectedBaselineStateIsSafe,
  protectedRouteCategoryRegressionDecision,
  protectedMetadataTopupDecision,
  protectedReadingOrderTopupDecision,
  protectedStrongAltPreservationViolation,
  protectedStrongAltFigureStageViolation,
  protectedTransactionDecision,
  shouldReplaceProtectedSafeCheckpoint,
  shouldRecordSameStateNoGainRuntimeAttempt,
  shouldRejectStageResult,
  shouldSkipCanonicalizeFigureAltBeforeRetag,
  shouldSkipSameStateNoGainRuntimeAttempt,
  shouldSkipProtectedFigureAlt,
  withHeadingTargetRef,
} from '../../src/services/remediation/orchestrator.js';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot, PlanningSummary, RemediationStagePlan } from '../../src/types.js';

function makeAnalysis(input: {
  score: number;
  confidence?: 'high' | 'medium' | 'low';
  categories?: Partial<Record<CategoryKey, number>>;
  scoreCapsApplied?: AnalysisResult['scoreCapsApplied'];
}): AnalysisResult {
  const categories = Object.entries(input.categories ?? {}).map(([key, value]) => ({
    key: key as CategoryKey,
    score: value ?? 100,
    weight: 1,
    applicable: true,
    severity: 'pass' as const,
    findings: [],
  }));
  return {
    id: `analysis-${input.score}-${input.confidence ?? 'none'}`,
    timestamp: '2026-04-18T00:00:00.000Z',
    filename: 'fixture.pdf',
    pageCount: 1,
    pdfClass: 'native_tagged',
    score: input.score,
    grade: 'B',
    categories,
    findings: [],
    analysisDurationMs: 1,
    ...(input.scoreCapsApplied ? { scoreCapsApplied: input.scoreCapsApplied } : {}),
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

function makeFigureSnapshot(input: { figures: number; figuresWithAlt: number }): DocumentSnapshot {
  const snap = makeSnapshot({ depth: 2 });
  snap.checkerFigureTargets = Array.from({ length: input.figures }, (_, index) => ({
    structRef: `${index + 1}_0`,
    page: 0,
    role: 'Figure',
    resolvedRole: 'Figure',
    hasAlt: index < input.figuresWithAlt,
    isArtifact: false,
    reachable: true,
    directContent: true,
    parentPath: [],
  }));
  snap.detectionProfile!.figureSignals = {
    extractedFigureCount: input.figures,
    treeFigureCount: input.figures,
    nonFigureRoleCount: 0,
    treeFigureMissingForExtractedFigures: false,
  };
  return snap;
}

describe('replay state instrumentation', () => {
  it('enriches JSON mutation details without losing invariants or benefits', () => {
    const beforeAnalysis = makeAnalysis({
      score: 80,
      categories: { heading_structure: 70, alt_text: 40, table_markup: 90, reading_order: 88, title_language: 100, pdf_ua_compliance: 83 },
    });
    const afterAnalysis = makeAnalysis({
      score: 86,
      categories: { heading_structure: 78, alt_text: 80, table_markup: 90, reading_order: 88, title_language: 100, pdf_ua_compliance: 83 },
    });
    const details = JSON.stringify({
      outcome: 'applied',
      note: 'figure_retagged',
      invariants: { targetRef: '12_0', targetReachable: true },
      structuralBenefits: { figureAltAttachedToReachableFigure: true },
      debug: { existingDebug: true },
    });

    const enriched = enrichDetailsWithReplayState(details, {
      beforeAnalysis,
      beforeSnapshot: makeSnapshot({ depth: 2 }),
      afterAnalysis,
      afterSnapshot: makeSnapshot({ depth: 3 }),
      params: { targetRef: '12_0' },
    });
    const parsed = JSON.parse(enriched);

    expect(parsed.note).toBe('figure_retagged');
    expect(parsed.invariants).toMatchObject({ targetRef: '12_0', targetReachable: true });
    expect(parsed.structuralBenefits).toMatchObject({ figureAltAttachedToReachableFigure: true });
    expect(parsed.debug.existingDebug).toBe(true);
    expect(parsed.debug.replayState.stateSignatureBefore).toEqual(expect.any(String));
    expect(parsed.debug.replayState.stateSignatureAfter).toEqual(expect.any(String));
    expect(parsed.debug.replayState.categoryScoresBefore.alt_text).toBe(40);
    expect(parsed.debug.replayState.categoryScoresAfter.alt_text).toBe(80);
    expect(parsed.debug.replayState.targetRef).toBe('12_0');
  });

  it('wraps legacy string details with replay state', () => {
    const enriched = enrichDetailsWithReplayState('post_pass_regressed_score(75)', {
      beforeAnalysis: makeAnalysis({ score: 80, categories: { reading_order: 100 } }),
      beforeSnapshot: makeSnapshot({ depth: 2 }),
      afterAnalysis: makeAnalysis({ score: 75, categories: { reading_order: 67 } }),
      afterSnapshot: makeSnapshot({ depth: 1 }),
    });
    const parsed = JSON.parse(enriched);

    expect(parsed.raw).toBe('post_pass_regressed_score(75)');
    expect(parsed.debug.replayState.scoreBefore).toBe(80);
    expect(parsed.debug.replayState.scoreAfter).toBe(75);
    expect(parsed.debug.replayState.stateSignatureBefore).toEqual(expect.any(String));
  });

  it('builds stable state signatures and changes when core state changes', () => {
    const first = buildReplayStateSignature({
      score: 80,
      categories: { alt_text: 40, reading_order: 90 },
      signals: { orphanMcidCount: 2 },
    });
    const reordered = buildReplayStateSignature({
      signals: { orphanMcidCount: 2 },
      categories: { reading_order: 90, alt_text: 40 },
      score: 80,
    });
    const changed = buildReplayStateSignature({
      score: 80,
      categories: { alt_text: 80, reading_order: 90 },
      signals: { orphanMcidCount: 2 },
    });

    expect(first).toBe(reordered);
    expect(first).not.toBe(changed);
  });

  it('keeps applied outcome parseable for false-positive checks', () => {
    const enriched = enrichDetailsWithReplayState(JSON.stringify({
      outcome: 'applied',
      invariants: { targetReachable: true, targetIsFigureAfter: true },
    }), {
      beforeAnalysis: makeAnalysis({ score: 80 }),
      beforeSnapshot: makeSnapshot({ depth: 2 }),
      afterAnalysis: makeAnalysis({ score: 82 }),
      afterSnapshot: makeSnapshot({ depth: 2 }),
    });

    expect(parseMutationDetails(enriched)).toMatchObject({
      outcome: 'applied',
      invariants: { targetReachable: true, targetIsFigureAfter: true },
    });
  });
});

describe('same-state no-gain runtime cap', () => {
  it('skips repeated same-tool same-state no-gain attempts', () => {
    const stateSignatureBefore = 'state-a';
    const attempts = new Set<string>();
    expect(shouldRecordSameStateNoGainRuntimeAttempt({
      toolName: 'remap_orphan_mcids_as_artifacts',
      stateSignatureBefore,
      outcome: 'no_effect',
      scoreBefore: 80,
      scoreAfter: 80,
    })).toBe(true);
    attempts.add(`remap_orphan_mcids_as_artifacts:${stateSignatureBefore}`);

    expect(shouldSkipSameStateNoGainRuntimeAttempt({
      toolName: 'remap_orphan_mcids_as_artifacts',
      stateSignatureBefore,
      noGainAttempts: attempts,
    })).toBe(true);
  });

  it('allows the same expensive tool on a new replay state', () => {
    const attempts = new Set(['repair_structure_conformance:state-a']);
    expect(shouldSkipSameStateNoGainRuntimeAttempt({
      toolName: 'repair_structure_conformance',
      stateSignatureBefore: 'state-b',
      noGainAttempts: attempts,
    })).toBe(false);
  });

  it('does not record score-improving attempts for suppression', () => {
    expect(shouldRecordSameStateNoGainRuntimeAttempt({
      toolName: 'normalize_heading_hierarchy',
      stateSignatureBefore: 'state-a',
      outcome: 'applied',
      scoreBefore: 80,
      scoreAfter: 84,
    })).toBe(false);
  });

  it('ignores tools outside the expensive structural cap list', () => {
    const attempts = new Set(['set_document_title:state-a']);
    expect(shouldSkipSameStateNoGainRuntimeAttempt({
      toolName: 'set_document_title',
      stateSignatureBefore: 'state-a',
      noGainAttempts: attempts,
    })).toBe(false);
  });
});

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

describe('withHeadingTargetRef', () => {
  it('adds attempted heading targetRef to structured mutation details', () => {
    const details = withHeadingTargetRef(JSON.stringify({
      outcome: 'no_effect',
      note: 'role_invalid_after_mutation',
      invariants: { targetReachable: false },
    }), '40_0', 'no_effect');
    const parsed = parseMutationDetails(details);
    expect(parsed?.invariants?.targetRef).toBe('40_0');
    expect(parsed?.debug?.['targetRef']).toBe('40_0');
  });

  it('preserves existing targetRef in heading mutation details', () => {
    const details = withHeadingTargetRef(JSON.stringify({
      outcome: 'no_effect',
      note: 'role_invalid_after_mutation',
      invariants: { targetRef: 'existing_ref', targetReachable: false },
      debug: { targetRef: 'existing_ref' },
    }), '40_0', 'no_effect');
    const parsed = parseMutationDetails(details);
    expect(parsed?.invariants?.targetRef).toBe('existing_ref');
    expect(parsed?.debug?.['targetRef']).toBe('existing_ref');
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

  it('rejects score-improving stages with unexplained protected category regressions', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium', categories: { alt_text: 89, table_markup: 35 } }),
      after: makeAnalysis({ score: 88, confidence: 'medium', categories: { alt_text: 52, table_markup: 100 } }),
      stage: makeStage('normalize_table_structure'),
      stageApplied: [{
        toolName: 'normalize_table_structure',
        stage: 1,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 88,
        delta: 8,
        outcome: 'applied',
        details: JSON.stringify({
          outcome: 'applied',
          invariants: { targetResolved: true, tableTreeValidAfter: true },
          structuralBenefits: { tableValidityImproved: true },
        }),
      }],
    });
    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_category(alt_text:89->52)',
    });
  });

  it('allows table category movement when table normalization has typed table benefit', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium', categories: { table_markup: 80 } }),
      after: makeAnalysis({ score: 88, confidence: 'medium', categories: { table_markup: 76 } }),
      stage: makeStage('normalize_table_structure'),
      stageApplied: [{
        toolName: 'normalize_table_structure',
        stage: 1,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 88,
        delta: 8,
        outcome: 'applied',
        details: JSON.stringify({
          outcome: 'applied',
          invariants: { targetResolved: true, tableTreeValidAfter: true },
          structuralBenefits: { tableValidityImproved: true },
        }),
      }],
    });
    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('rejects category regressions when only legacy mutation details are present', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium', categories: { title_language: 100 } }),
      after: makeAnalysis({ score: 84, confidence: 'medium', categories: { title_language: 50 } }),
      stage: makeStage('set_pdfua_identification'),
      stageApplied: [{
        toolName: 'set_pdfua_identification',
        stage: 1,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 84,
        delta: 4,
        outcome: 'applied',
        details: 'legacy_title_change',
      }],
    });
    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_category(title_language:100->50)',
    });
  });

  it('rejects no-gain orphan remap mutations so mutated buffers are not preserved', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 59, confidence: 'medium', categories: { alt_text: 88, reading_order: 80, table_markup: 100, pdf_ua_compliance: 67 } }),
      after: makeAnalysis({ score: 59, confidence: 'medium', categories: { alt_text: 88, reading_order: 80, table_markup: 100, pdf_ua_compliance: 80 } }),
      beforeSnapshot: makeSnapshot({ depth: 4 }),
      afterSnapshot: makeSnapshot({ depth: 4 }),
      stage: makeStage('remap_orphan_mcids_as_artifacts'),
      stageApplied: [{
        toolName: 'remap_orphan_mcids_as_artifacts',
        stage: 2,
        round: 1,
        scoreBefore: 59,
        scoreAfter: 59,
        delta: 0,
        outcome: 'applied',
        details: JSON.stringify({ outcome: 'applied' }),
      }],
    });

    expect(result).toEqual({
      reject: true,
      reason: 'stage_no_gain_orphan_artifact_mutation',
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

  it('rejects score-improving figure-alt stages when reading order collapses', () => {
    const beforeSnapshot = makeSnapshot({ depth: 4 });
    const afterSnapshot: DocumentSnapshot = {
      ...beforeSnapshot,
      checkerFigureTargets: [{
        hasAlt: true,
        altText: 'Figure',
        isArtifact: false,
        page: 0,
        role: 'Figure',
        resolvedRole: 'Figure',
        structRef: '239_0',
        reachable: true,
        directContent: true,
        parentPath: ['Document', 'Figure'],
      }],
      detectionProfile: {
        ...beforeSnapshot.detectionProfile!,
        figureSignals: {
          ...beforeSnapshot.detectionProfile!.figureSignals,
          extractedFigureCount: 2,
          treeFigureCount: 1,
          treeFigureMissingForExtractedFigures: false,
        },
      },
    };
    const result = shouldRejectStageResult({
      before: makeAnalysis({
        score: 54,
        confidence: 'medium',
        categories: { alt_text: 20, reading_order: 96, heading_structure: 0, table_markup: 100 },
      }),
      after: makeAnalysis({
        score: 76,
        confidence: 'medium',
        categories: { alt_text: 100, reading_order: 45, heading_structure: 45, table_markup: 100 },
      }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('canonicalize_figure_alt_ownership'),
      stageApplied: [{
        toolName: 'canonicalize_figure_alt_ownership',
        stage: 6,
        round: 1,
        scoreBefore: 54,
        scoreAfter: 76,
        delta: 22,
        outcome: 'applied',
        details: JSON.stringify({
          outcome: 'applied',
          invariants: {
            ownershipPreserved: true,
            rootReachableFigureCountBefore: 0,
            rootReachableFigureCountAfter: 1,
          },
        }),
      }],
    });

    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_category(reading_order:96->45)',
    });
  });

  it('does not keep figure-alt stages when checker-visible figure alt does not improve', () => {
    const beforeSnapshot = makeSnapshot({ depth: 4 });
    const result = shouldRejectStageResult({
      before: makeAnalysis({
        score: 54,
        confidence: 'medium',
        categories: { alt_text: 20, reading_order: 96, heading_structure: 0 },
      }),
      after: makeAnalysis({
        score: 76,
        confidence: 'medium',
        categories: { alt_text: 100, reading_order: 45, heading_structure: 45 },
      }),
      beforeSnapshot,
      afterSnapshot: beforeSnapshot,
      stage: makeStage('canonicalize_figure_alt_ownership'),
      stageApplied: [{
        toolName: 'canonicalize_figure_alt_ownership',
        stage: 6,
        round: 1,
        scoreBefore: 54,
        scoreAfter: 76,
        delta: 22,
        outcome: 'applied',
        details: JSON.stringify({ outcome: 'applied', invariants: { ownershipPreserved: true } }),
      }],
    });

    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_category(reading_order:96->45)',
    });
  });

  it('does not keep figure-alt stages when applied invariants fail', () => {
    const beforeSnapshot = makeSnapshot({ depth: 4 });
    const afterSnapshot: DocumentSnapshot = {
      ...beforeSnapshot,
      checkerFigureTargets: [{
        hasAlt: true,
        isArtifact: false,
        page: 0,
        role: 'Figure',
        resolvedRole: 'Figure',
        structRef: '239_0',
        reachable: true,
        directContent: true,
        parentPath: ['Document', 'Figure'],
      }],
    };
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 54, confidence: 'medium', categories: { alt_text: 20, reading_order: 96 } }),
      after: makeAnalysis({ score: 76, confidence: 'medium', categories: { alt_text: 100, reading_order: 45 } }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('set_figure_alt_text'),
      stageApplied: [{
        toolName: 'set_figure_alt_text',
        stage: 6,
        round: 1,
        scoreBefore: 54,
        scoreAfter: 76,
        delta: 22,
        outcome: 'applied',
        details: JSON.stringify({
          outcome: 'applied',
          invariants: { targetReachable: false, targetIsFigureAfter: true, targetHasAltAfter: true },
          structuralBenefits: { figureAltAttachedToReachableFigure: true },
        }),
      }],
    });

    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_category(reading_order:96->45)',
    });
  });

  it('does not keep figure-alt stages that introduce a new score cap', () => {
    const beforeSnapshot = makeSnapshot({ depth: 4 });
    const afterSnapshot: DocumentSnapshot = {
      ...beforeSnapshot,
      checkerFigureTargets: [{
        hasAlt: true,
        isArtifact: false,
        page: 0,
        role: 'Figure',
        resolvedRole: 'Figure',
        structRef: '239_0',
        reachable: true,
        directContent: true,
        parentPath: ['Document', 'Figure'],
      }],
    };
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 54, confidence: 'medium', categories: { alt_text: 20, reading_order: 96 } }),
      after: makeAnalysis({
        score: 76,
        confidence: 'medium',
        categories: { alt_text: 100, reading_order: 45 },
        scoreCapsApplied: [{ category: 'reading_order', cap: 69, rawScore: 45, finalScore: 45, reason: 'new_cap' }],
      }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('canonicalize_figure_alt_ownership'),
      stageApplied: [{
        toolName: 'canonicalize_figure_alt_ownership',
        stage: 6,
        round: 1,
        scoreBefore: 54,
        scoreAfter: 76,
        delta: 22,
        outcome: 'applied',
        details: JSON.stringify({ outcome: 'applied', invariants: { ownershipPreserved: true } }),
      }],
    });

    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_category(reading_order:96->45)',
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

  it('allows weak-alt figure recovery when heading stays usable', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 59, confidence: 'medium', categories: { heading_structure: 95, alt_text: 0 } }),
      after: makeAnalysis({ score: 75, confidence: 'medium', categories: { heading_structure: 60, alt_text: 52 } }),
      stage: makeStage('set_figure_alt_text'),
      stageApplied: [{
        toolName: 'set_figure_alt_text',
        stage: 1,
        round: 1,
        scoreBefore: 59,
        scoreAfter: 75,
        delta: 16,
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
      protectedBaseline: { score: 87, categories: { alt_text: 45, heading_structure: 95 } },
    });

    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('keeps checker-visible figure-alt progress despite structural confidence shape drift', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({
        score: 59,
        confidence: 'high',
        categories: { heading_structure: 99, alt_text: 0, table_markup: 100, reading_order: 100 },
      }),
      after: makeAnalysis({
        score: 81,
        confidence: 'medium',
        categories: { heading_structure: 99, alt_text: 20, table_markup: 100, reading_order: 100 },
      }),
      beforeSnapshot: {
        ...makeSnapshot({ depth: 4 }),
        checkerFigureTargets: [
          { structRef: '1_0', page: 0, role: 'Figure', resolvedRole: 'Figure', hasAlt: false, reachable: true, isArtifact: false },
          { structRef: '2_0', page: 0, role: 'Figure', resolvedRole: 'Figure', hasAlt: false, reachable: true, isArtifact: false },
        ],
      },
      afterSnapshot: {
        ...makeSnapshot({ depth: 4 }),
        checkerFigureTargets: [
          { structRef: '1_0', page: 0, role: 'Figure', resolvedRole: 'Figure', hasAlt: true, reachable: true, isArtifact: false },
          { structRef: '2_0', page: 0, role: 'Figure', resolvedRole: 'Figure', hasAlt: true, reachable: true, isArtifact: false },
        ],
      },
      stage: makeStage('set_figure_alt_text'),
      stageApplied: [{
        toolName: 'set_figure_alt_text',
        stage: 1,
        round: 1,
        scoreBefore: 59,
        scoreAfter: 81,
        delta: 22,
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

  it('rejects weak-alt figure recovery when heading collapses below the usable floor', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 59, confidence: 'medium', categories: { heading_structure: 95, alt_text: 0 } }),
      after: makeAnalysis({ score: 75, confidence: 'medium', categories: { heading_structure: 50, alt_text: 52 } }),
      stage: makeStage('set_figure_alt_text'),
      stageApplied: [{
        toolName: 'set_figure_alt_text',
        stage: 1,
        round: 1,
        scoreBefore: 59,
        scoreAfter: 75,
        delta: 16,
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
      protectedBaseline: { score: 87, categories: { alt_text: 45, heading_structure: 95 } },
    });

    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_category(heading_structure:95->50)',
    });
  });

  it('rejects small unrelated category drift outside protected quarantine', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 59, confidence: 'medium', categories: { reading_order: 100, alt_text: 0 } }),
      after: makeAnalysis({ score: 76, confidence: 'medium', categories: { reading_order: 96, alt_text: 52 } }),
      stage: makeStage('set_figure_alt_text'),
      stageApplied: [{
        toolName: 'set_figure_alt_text',
        stage: 1,
        round: 1,
        scoreBefore: 59,
        scoreAfter: 76,
        delta: 17,
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
      protectedBaseline: { score: 87 },
    });

    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_category(reading_order:100->96)',
    });
  });

  it('allows excellent reading-order drift when weak-alt protected recovery improves alt text', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 59, confidence: 'medium', categories: { reading_order: 100, alt_text: 0 } }),
      after: makeAnalysis({ score: 76, confidence: 'medium', categories: { reading_order: 96, alt_text: 52 } }),
      stage: makeStage('set_figure_alt_text'),
      stageApplied: [{
        toolName: 'set_figure_alt_text',
        stage: 1,
        round: 1,
        scoreBefore: 59,
        scoreAfter: 76,
        delta: 17,
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
      protectedBaseline: { score: 87, categories: { alt_text: 52, reading_order: 96 } },
    });

    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('allows weak-alt figure stages with typed benefit when reading order stays high and alt does not worsen', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 76, confidence: 'medium', categories: { reading_order: 100, alt_text: 16 } }),
      after: makeAnalysis({ score: 79, confidence: 'medium', categories: { reading_order: 96, alt_text: 16 } }),
      stage: makeStage('set_figure_alt_text'),
      stageApplied: [{
        toolName: 'set_figure_alt_text',
        stage: 1,
        round: 1,
        scoreBefore: 76,
        scoreAfter: 79,
        delta: 3,
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
      protectedBaseline: { score: 87, categories: { alt_text: 52, reading_order: 100 } },
    });

    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('rejects figure stages that regress score without improving alt text', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 78, confidence: 'medium', categories: { alt_text: 16, reading_order: 96 } }),
      after: makeAnalysis({ score: 73, confidence: 'medium', categories: { alt_text: 16, reading_order: 96 } }),
      stage: makeStage('set_figure_alt_text'),
      stageApplied: [{
        toolName: 'set_figure_alt_text',
        stage: 1,
        round: 1,
        scoreBefore: 78,
        scoreAfter: 73,
        delta: -5,
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
      protectedBaseline: { score: 87, categories: { alt_text: 52, reading_order: 96 } },
    });

    expect(result).toEqual({
      reject: true,
      reason: 'figure_stage_regressed_without_alt_improvement(73)',
    });
  });

  it('keeps bounded multi-target figure alt progress despite a small score-shape dip', () => {
    const stageApplied: AppliedRemediationTool[] = [{
      toolName: 'set_figure_alt_text',
      stage: 1,
      round: 1,
      scoreBefore: 80,
      scoreAfter: 79,
      delta: -1,
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
    }];
    const input = {
      before: makeAnalysis({
        score: 80,
        confidence: 'medium' as const,
        categories: { alt_text: 16, heading_structure: 100, table_markup: 100, reading_order: 96 },
      }),
      after: makeAnalysis({
        score: 79,
        confidence: 'medium' as const,
        categories: { alt_text: 12, heading_structure: 100, table_markup: 100, reading_order: 96 },
      }),
      beforeSnapshot: makeFigureSnapshot({ figures: 3, figuresWithAlt: 1 }),
      afterSnapshot: makeFigureSnapshot({ figures: 3, figuresWithAlt: 2 }),
      stageApplied,
    };

    expect(hasCheckerVisibleFigureAltProgressDespiteScoreShape(input)).toBe(true);
    expect(shouldRejectStageResult({
      ...input,
      stage: makeStage('set_figure_alt_text'),
    })).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('does not treat a score-shape dip as figure progress without checker-visible alt gain', () => {
    const stageApplied: AppliedRemediationTool[] = [{
      toolName: 'set_figure_alt_text',
      stage: 1,
      round: 1,
      scoreBefore: 80,
      scoreAfter: 79,
      delta: -1,
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
    }];
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium', categories: { alt_text: 16, reading_order: 96 } }),
      after: makeAnalysis({ score: 79, confidence: 'medium', categories: { alt_text: 12, reading_order: 96 } }),
      beforeSnapshot: makeFigureSnapshot({ figures: 3, figuresWithAlt: 1 }),
      afterSnapshot: makeFigureSnapshot({ figures: 3, figuresWithAlt: 1 }),
      stage: makeStage('set_figure_alt_text'),
      stageApplied,
    });

    expect(result).toEqual({
      reject: true,
      reason: 'figure_stage_regressed_without_alt_improvement(79)',
    });
  });

  it('rejects score-shape figure progress when target invariants fail', () => {
    const stageApplied: AppliedRemediationTool[] = [{
      toolName: 'set_figure_alt_text',
      stage: 1,
      round: 1,
      scoreBefore: 80,
      scoreAfter: 79,
      delta: -1,
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
    }];

    expect(hasCheckerVisibleFigureAltProgressDespiteScoreShape({
      before: makeAnalysis({ score: 80, confidence: 'medium', categories: { alt_text: 16, reading_order: 96 } }),
      after: makeAnalysis({ score: 79, confidence: 'medium', categories: { alt_text: 12, reading_order: 96 } }),
      beforeSnapshot: makeFigureSnapshot({ figures: 3, figuresWithAlt: 1 }),
      afterSnapshot: makeFigureSnapshot({ figures: 3, figuresWithAlt: 2 }),
      stageApplied,
    })).toBe(false);
    expect(shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium', categories: { alt_text: 16, reading_order: 96 } }),
      after: makeAnalysis({ score: 79, confidence: 'medium', categories: { alt_text: 12, reading_order: 96 } }),
      beforeSnapshot: makeFigureSnapshot({ figures: 3, figuresWithAlt: 1 }),
      afterSnapshot: makeFigureSnapshot({ figures: 3, figuresWithAlt: 2 }),
      stage: makeStage('set_figure_alt_text'),
      stageApplied,
    })).toEqual({
      reject: true,
      reason: 'figure_stage_regressed_without_alt_improvement(79)',
    });
  });

  it('rejects score-shape figure progress when non-figure structural categories collapse', () => {
    const stageApplied: AppliedRemediationTool[] = [{
      toolName: 'set_figure_alt_text',
      stage: 1,
      round: 1,
      scoreBefore: 80,
      scoreAfter: 79,
      delta: -1,
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
    }];
    const result = shouldRejectStageResult({
      before: makeAnalysis({
        score: 80,
        confidence: 'medium',
        categories: { alt_text: 16, heading_structure: 100, table_markup: 100, reading_order: 96 },
      }),
      after: makeAnalysis({
        score: 79,
        confidence: 'medium',
        categories: { alt_text: 12, heading_structure: 100, table_markup: 100, reading_order: 80 },
      }),
      beforeSnapshot: makeFigureSnapshot({ figures: 3, figuresWithAlt: 1 }),
      afterSnapshot: makeFigureSnapshot({ figures: 3, figuresWithAlt: 2 }),
      stage: makeStage('set_figure_alt_text'),
      stageApplied,
    });

    expect(result).toEqual({
      reject: true,
      reason: 'figure_stage_regressed_without_alt_improvement(79)',
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

describe('protectedBaselineFloorViolation', () => {
  it('rejects a candidate that drops a protected row below the baseline floor', () => {
    const result = protectedBaselineFloorViolation({
      baseline: { score: 90 },
      before: makeAnalysis({ score: 89, confidence: 'medium' }),
      after: makeAnalysis({ score: 87, confidence: 'medium' }),
    });

    expect(result.reject).toBe(true);
    expect(result.reason).toBe('protected_baseline_floor(87<88)');
    expect(JSON.parse(result.details ?? '{}')).toMatchObject({
      outcome: 'rejected',
      protectedBaselineScore: 90,
      protectedCandidateScore: 87,
      protectedFloorReason: 'protected_baseline_floor(87<88)',
    });
  });

  it('accepts a candidate that stays within the protected baseline floor', () => {
    const result = protectedBaselineFloorViolation({
      baseline: { score: 90 },
      before: makeAnalysis({ score: 90, confidence: 'medium' }),
      after: makeAnalysis({ score: 88, confidence: 'medium' }),
    });

    expect(result).toEqual({ reject: false, reason: null });
  });

  it('does not affect normal remediation when baseline data is missing', () => {
    const result = protectedBaselineFloorViolation({
      before: makeAnalysis({ score: 90, confidence: 'medium' }),
      after: makeAnalysis({ score: 70, confidence: 'medium' }),
    });

    expect(result).toEqual({ reject: false, reason: null });
  });

  it('does not reject while a low row is still recovering toward the floor', () => {
    const result = protectedBaselineFloorViolation({
      baseline: { score: 90 },
      before: makeAnalysis({ score: 59, confidence: 'medium' }),
      after: makeAnalysis({ score: 75, confidence: 'medium' }),
    });

    expect(result).toEqual({ reject: false, reason: null });
  });

  it('allows drops below floor when a new stricter score cap explains the change', () => {
    const result = protectedBaselineFloorViolation({
      baseline: {
        score: 90,
        scoreCapsApplied: [{ category: 'heading_structure', cap: 69, rawScore: 100, finalScore: 69, reason: 'old cap' }],
      },
      before: makeAnalysis({ score: 90, confidence: 'medium' }),
      after: {
        ...makeAnalysis({ score: 80, confidence: 'medium' }),
        scoreCapsApplied: [{ category: 'table_markup', cap: 69, rawScore: 100, finalScore: 69, reason: 'new strict cap' }],
      },
    });

    expect(result).toEqual({ reject: false, reason: null });
  });
});

describe('protectedBaselineStateIsSafe', () => {
  it('treats a state at baseline minus tolerance with no new cap as safe', () => {
    expect(protectedBaselineStateIsSafe({
      baseline: { score: 90 },
      analysis: makeAnalysis({ score: 88, confidence: 'medium' }),
    })).toBe(true);
  });

  it('does not treat a below-floor state as safe', () => {
    expect(protectedBaselineStateIsSafe({
      baseline: { score: 90 },
      analysis: makeAnalysis({ score: 87, confidence: 'medium' }),
    })).toBe(false);
  });

  it('does not treat a state with a new stricter cap as safe', () => {
    expect(protectedBaselineStateIsSafe({
      baseline: {
        score: 90,
        scoreCapsApplied: [{ category: 'heading_structure', cap: 69, rawScore: 100, finalScore: 69, reason: 'old cap' }],
      },
      analysis: {
        ...makeAnalysis({ score: 90, confidence: 'medium' }),
        scoreCapsApplied: [{ category: 'table_markup', cap: 69, rawScore: 100, finalScore: 69, reason: 'new strict cap' }],
      },
    })).toBe(false);
  });
});

describe('protectedBaselineRunCheckpointDecision', () => {
  it('commits the final state when it reaches the protected floor and preserves strong categories', () => {
    expect(protectedBaselineRunCheckpointDecision({
      baseline: {
        score: 90,
        categories: { reading_order: 100, alt_text: 80 },
      },
      final: makeAnalysis({ score: 89, confidence: 'medium', categories: { reading_order: 99, alt_text: 79 } }),
    })).toBe('commit_final');
  });

  it('restores the best safe intermediate state when a later final state drops below the protected floor', () => {
    expect(protectedBaselineRunCheckpointDecision({
      baseline: {
        score: 90,
        categories: { reading_order: 100, alt_text: 80 },
      },
      final: makeAnalysis({ score: 76, confidence: 'medium', categories: { reading_order: 99, alt_text: 80 } }),
      best: {
        analysis: makeAnalysis({ score: 89, confidence: 'medium', categories: { reading_order: 100, alt_text: 80 } }),
      },
    })).toBe('commit_best');
  });

  it('does nothing when no protected baseline is supplied', () => {
    expect(protectedBaselineRunCheckpointDecision({
      final: makeAnalysis({ score: 70, confidence: 'medium' }),
      best: {
        analysis: makeAnalysis({ score: 95, confidence: 'medium' }),
      },
    })).toBe('commit_final');
  });

  it('does not treat a score-safe state as safe when protected categories regress', () => {
    expect(protectedBaselineRunStateIsSafe({
      baseline: {
        score: 90,
        categories: { reading_order: 100, alt_text: 80 },
      },
      analysis: makeAnalysis({ score: 91, confidence: 'medium', categories: { reading_order: 88, alt_text: 79 } }),
    })).toBe(false);
  });
});

describe('shouldReplaceProtectedSafeCheckpoint', () => {
  it('keeps the earliest safe checkpoint when scores tie', () => {
    expect(shouldReplaceProtectedSafeCheckpoint({
      baseline: { score: 98, categories: { heading_structure: 100 } },
      current: {
        analysis: makeAnalysis({ score: 98, confidence: 'medium', categories: { heading_structure: 100 } }),
        appliedToolCount: 4,
      },
      candidate: {
        analysis: makeAnalysis({ score: 98, confidence: 'medium', categories: { heading_structure: 100 } }),
        appliedToolCount: 7,
      },
    })).toBe(false);
  });

  it('replaces a checkpoint when the candidate has a higher safe score', () => {
    expect(shouldReplaceProtectedSafeCheckpoint({
      baseline: { score: 98, categories: { heading_structure: 100 } },
      current: {
        analysis: makeAnalysis({ score: 98, confidence: 'medium', categories: { heading_structure: 100 } }),
        appliedToolCount: 4,
      },
      candidate: {
        analysis: makeAnalysis({ score: 99, confidence: 'medium', categories: { heading_structure: 100 } }),
        appliedToolCount: 7,
      },
    })).toBe(true);
  });

  it('does not store an unsafe candidate', () => {
    expect(shouldReplaceProtectedSafeCheckpoint({
      baseline: { score: 98, categories: { heading_structure: 100 } },
      current: null,
      candidate: {
        analysis: makeAnalysis({ score: 99, confidence: 'medium', categories: { heading_structure: 86 } }),
        appliedToolCount: 7,
      },
    })).toBe(false);
  });
});

describe('protectedBaselineReanalysisDecision', () => {
  it('commits final when protected final reanalysis is floor-safe', () => {
    expect(protectedBaselineReanalysisDecision({
      baseline: {
        score: 90,
        categories: { reading_order: 100 },
      },
      finalReanalysis: makeAnalysis({ score: 89, confidence: 'medium', categories: { reading_order: 99 } }),
      bestReanalysis: makeAnalysis({ score: 88, confidence: 'medium', categories: { reading_order: 99 } }),
    })).toBe('commit_final');
  });

  it('restores the best checkpoint when final reanalysis is below the protected floor', () => {
    expect(protectedBaselineReanalysisDecision({
      baseline: {
        score: 90,
        categories: { reading_order: 100 },
      },
      finalReanalysis: makeAnalysis({ score: 70, confidence: 'medium', categories: { reading_order: 100 } }),
      bestReanalysis: makeAnalysis({ score: 89, confidence: 'medium', categories: { reading_order: 100 } }),
    })).toBe('commit_best');
  });

  it('restores the best checkpoint when final reanalysis preserves score but regresses a strong category', () => {
    expect(protectedBaselineReanalysisDecision({
      baseline: {
        score: 90,
        categories: { reading_order: 100 },
      },
      finalReanalysis: makeAnalysis({ score: 91, confidence: 'medium', categories: { reading_order: 67 } }),
      bestReanalysis: makeAnalysis({ score: 89, confidence: 'medium', categories: { reading_order: 100 } }),
    })).toBe('commit_best');
    expect(protectedBaselineRunStateUnsafeReason({
      baseline: {
        score: 90,
        categories: { reading_order: 100 },
      },
      analysis: makeAnalysis({ score: 91, confidence: 'medium', categories: { reading_order: 67 } }),
    })).toBe('protected_run_category_regressed(reading_order:100->67)');
  });

  it('does nothing when no protected baseline is supplied', () => {
    expect(protectedBaselineReanalysisDecision({
      finalReanalysis: makeAnalysis({ score: 20, confidence: 'medium' }),
      bestReanalysis: makeAnalysis({ score: 99, confidence: 'medium' }),
    })).toBe('commit_final');
  });

  it('leaves the final reanalysis authoritative when no checkpoint is safe', () => {
    expect(protectedBaselineReanalysisDecision({
      baseline: {
        score: 90,
        categories: { reading_order: 100 },
      },
      finalReanalysis: makeAnalysis({ score: 70, confidence: 'medium', categories: { reading_order: 100 } }),
      bestReanalysis: makeAnalysis({ score: 75, confidence: 'medium', categories: { reading_order: 100 } }),
    })).toBe('none');
  });
});

describe('protectedRouteCategoryRegressionDecision', () => {
  it('rejects high-risk orphan remap when a strong protected category regresses', () => {
    const result = protectedRouteCategoryRegressionDecision({
      baseline: { score: 98, categories: { heading_structure: 100 } },
      before: makeAnalysis({ score: 98, confidence: 'medium', categories: { heading_structure: 100 } }),
      after: makeAnalysis({ score: 98, confidence: 'medium', categories: { heading_structure: 86 } }),
      toolName: 'remap_orphan_mcids_as_artifacts',
    });
    expect(result.reject).toBe(true);
    expect(result.reason).toBe('protected_route_category_regressed(heading_structure:100:100->86)');
  });

  it('does not reject score-improving orphan remap when protected categories stay safe', () => {
    expect(protectedRouteCategoryRegressionDecision({
      baseline: { score: 98, categories: { heading_structure: 100, reading_order: 100 } },
      before: makeAnalysis({ score: 94, confidence: 'medium', categories: { heading_structure: 100, reading_order: 98 } }),
      after: makeAnalysis({ score: 98, confidence: 'medium', categories: { heading_structure: 99, reading_order: 100 } }),
      toolName: 'remap_orphan_mcids_as_artifacts',
    }).reject).toBe(false);
  });

  it('does not apply without a protected baseline', () => {
    expect(protectedRouteCategoryRegressionDecision({
      before: makeAnalysis({ score: 98, confidence: 'medium', categories: { heading_structure: 100 } }),
      after: makeAnalysis({ score: 98, confidence: 'medium', categories: { heading_structure: 86 } }),
      toolName: 'remap_orphan_mcids_as_artifacts',
    }).reject).toBe(false);
  });

  it('does not block non-risk tools that improve a targeted category', () => {
    expect(protectedRouteCategoryRegressionDecision({
      baseline: { score: 100, categories: { reading_order: 100, alt_text: 100 } },
      before: makeAnalysis({ score: 80, confidence: 'medium', categories: { reading_order: 100, alt_text: 20 } }),
      after: makeAnalysis({ score: 93, confidence: 'medium', categories: { reading_order: 80, alt_text: 100 } }),
      toolName: 'repair_alt_text_structure',
    }).reject).toBe(false);
  });
});

describe('protectedFinalReanalysisPolicyDecision', () => {
  it('skips final reanalysis when no protected baseline is supplied', () => {
    expect(protectedFinalReanalysisPolicyDecision({
      final: makeAnalysis({ score: 70, confidence: 'medium' }),
      env: {},
    })).toBe('skip_no_baseline');
  });

  it('can be disabled by environment configuration', () => {
    expect(protectedFinalReanalysisPolicyDecision({
      baseline: { score: 90 },
      final: makeAnalysis({ score: 88, confidence: 'medium' }),
      best: { analysis: makeAnalysis({ score: 90, confidence: 'medium' }), appliedToolCount: 1 },
      appliedToolCount: 3,
      env: { PDFAF_PROTECTED_FINAL_REANALYSIS: '0' },
    })).toBe('skip_disabled');
  });

  it('can be forced by environment configuration', () => {
    expect(protectedFinalReanalysisPolicyDecision({
      baseline: { score: 90 },
      final: makeAnalysis({ score: 90, confidence: 'medium' }),
      env: { PDFAF_PROTECTED_FINAL_REANALYSIS: '1' },
    })).toBe('run');
  });

  it('skips volatile final confirmation when no reanalysis-safe restore candidate exists', () => {
    expect(protectedFinalReanalysisPolicyDecision({
      baseline: { score: 90, categories: { reading_order: 100 } },
      final: makeAnalysis({ score: 89, confidence: 'medium', categories: { reading_order: 100 } }),
      best: { analysis: makeAnalysis({ score: 70, confidence: 'medium', categories: { reading_order: 100 } }), appliedToolCount: 1 },
      appliedToolCount: 4,
      env: {},
    })).toBe('skip_no_restore_candidate');
  });

  it('runs when an earlier safe checkpoint can restore a later externally-unsafe final state', () => {
    expect(protectedFinalReanalysisPolicyDecision({
      baseline: { score: 90, categories: { reading_order: 100 } },
      final: makeAnalysis({ score: 91, confidence: 'medium', categories: { reading_order: 100 } }),
      best: { analysis: makeAnalysis({ score: 89, confidence: 'medium', categories: { reading_order: 100 } }), appliedToolCount: 2 },
      appliedToolCount: 5,
      env: {},
    })).toBe('run');
  });

  it('runs when a safe checkpoint can restore a protected-category regression', () => {
    expect(protectedFinalReanalysisPolicyDecision({
      baseline: { score: 90, categories: { reading_order: 100 } },
      final: makeAnalysis({ score: 91, confidence: 'medium', categories: { reading_order: 80 } }),
      best: { analysis: makeAnalysis({ score: 89, confidence: 'medium', categories: { reading_order: 100 } }), appliedToolCount: 2 },
      appliedToolCount: 5,
      env: {},
    })).toBe('run');
  });

  it('runs when the current final state is not floor-safe but a checkpoint is safe', () => {
    expect(protectedFinalReanalysisPolicyDecision({
      baseline: { score: 90, categories: { reading_order: 100 } },
      final: makeAnalysis({ score: 70, confidence: 'medium', categories: { reading_order: 100 } }),
      best: { analysis: makeAnalysis({ score: 89, confidence: 'medium', categories: { reading_order: 100 } }), appliedToolCount: 5 },
      appliedToolCount: 5,
      env: {},
    })).toBe('run');
  });
});

describe('protectedTransactionDecision', () => {
  it('commits the final transaction state when it reaches the protected floor', () => {
    expect(protectedTransactionDecision({
      baseline: { score: 90 },
      final: makeAnalysis({ score: 88, confidence: 'medium' }),
    })).toBe('commit_final');
  });

  it('restores the best safe in-transaction state when a later tool regresses', () => {
    expect(protectedTransactionDecision({
      baseline: { score: 90 },
      final: makeAnalysis({ score: 76, confidence: 'medium' }),
      best: { analysis: makeAnalysis({ score: 89, confidence: 'medium' }) },
    })).toBe('commit_best');
  });

  it('rolls back when no transaction state reaches the protected floor', () => {
    expect(protectedTransactionDecision({
      baseline: { score: 90 },
      final: makeAnalysis({ score: 77, confidence: 'medium' }),
      best: { analysis: makeAnalysis({ score: 82, confidence: 'medium' }) },
    })).toBe('rollback');
  });
});

describe('protectedMetadataTopupDecision', () => {
  it('accepts protected title and PDF/UA recovery from a restored below-floor state', () => {
    const result = protectedMetadataTopupDecision({
      baseline: {
        score: 87,
        categories: {
          title_language: 100,
          pdf_ua_compliance: 83,
          heading_structure: 95,
          alt_text: 52,
          table_markup: 100,
          reading_order: 96,
        },
      },
      before: makeAnalysis({
        score: 80,
        confidence: 'medium',
        categories: {
          title_language: 0,
          pdf_ua_compliance: 50,
          heading_structure: 95,
          alt_text: 52,
          table_markup: 100,
          reading_order: 96,
        },
      }),
      after: makeAnalysis({
        score: 87,
        confidence: 'medium',
        categories: {
          title_language: 100,
          pdf_ua_compliance: 83,
          heading_structure: 95,
          alt_text: 52,
          table_markup: 100,
          reading_order: 96,
        },
      }),
    });

    expect(result.accept).toBe(true);
    expect(JSON.parse(result.details ?? '{}')).toMatchObject({
      outcome: 'applied',
      note: 'protected_metadata_topup',
      protectedBaselineScore: 87,
      protectedCandidateScore: 87,
    });
  });

  it('rejects metadata top-up when it regresses structural categories', () => {
    const result = protectedMetadataTopupDecision({
      baseline: { score: 90, categories: { title_language: 100 } },
      before: makeAnalysis({
        score: 80,
        confidence: 'medium',
        categories: {
          title_language: 0,
          heading_structure: 95,
          alt_text: 100,
          table_markup: 100,
          reading_order: 96,
        },
      }),
      after: makeAnalysis({
        score: 86,
        confidence: 'medium',
        categories: {
          title_language: 100,
          heading_structure: 80,
          alt_text: 100,
          table_markup: 100,
          reading_order: 96,
        },
      }),
    });

    expect(result.accept).toBe(false);
    expect(JSON.parse(result.details ?? '{}')).toMatchObject({
      outcome: 'rejected',
      note: 'protected_metadata_topup_rejected',
      protectedFloorReason: 'protected_metadata_topup_structural_regression(heading_structure:95->80)',
    });
  });

  it('rejects metadata top-up when metadata categories do not improve', () => {
    const result = protectedMetadataTopupDecision({
      baseline: { score: 90, categories: { title_language: 100 } },
      before: makeAnalysis({
        score: 80,
        confidence: 'medium',
        categories: { title_language: 100, pdf_ua_compliance: 83, heading_structure: 95 },
      }),
      after: makeAnalysis({
        score: 82,
        confidence: 'medium',
        categories: { title_language: 100, pdf_ua_compliance: 83, heading_structure: 95 },
      }),
    });

    expect(result.accept).toBe(false);
    expect(JSON.parse(result.details ?? '{}').protectedFloorReason).toBe('protected_metadata_topup_no_metadata_improvement');
  });
});

describe('protectedStrongAltPreservationViolation', () => {
  it('rejects a below-floor protected mutation that collapses recovered strong alt', () => {
    const result = protectedStrongAltPreservationViolation({
      baseline: { score: 98, categories: { alt_text: 100 } },
      before: makeAnalysis({ score: 92, categories: { alt_text: 100 } }),
      after: makeAnalysis({ score: 79, categories: { alt_text: 20 } }),
    });
    expect(result.reject).toBe(true);
    expect(result.reason).toBe('protected_strong_alt_regressed(100:100->20)');
    expect(JSON.parse(result.details ?? '{}')).toMatchObject({
      note: 'protected_strong_alt_regressed(100:100->20)',
      protectedBaselineScore: 98,
      protectedCandidateScore: 79,
      protectedBaselineAltScore: 100,
      protectedBeforeAltScore: 100,
      protectedCandidateAltScore: 20,
    });
  });

  it('does not reject when the row still reaches the protected total floor', () => {
    const result = protectedStrongAltPreservationViolation({
      baseline: { score: 98, categories: { alt_text: 100 } },
      before: makeAnalysis({ score: 99, categories: { alt_text: 100 } }),
      after: makeAnalysis({ score: 97, categories: { alt_text: 20 } }),
    });
    expect(result.reject).toBe(false);
  });

  it('does not reject weak-alt recovery rows before they have recovered strong alt', () => {
    const result = protectedStrongAltPreservationViolation({
      baseline: { score: 86, categories: { alt_text: 45 } },
      before: makeAnalysis({ score: 78, categories: { alt_text: 45 } }),
      after: makeAnalysis({ score: 85, categories: { alt_text: 70 } }),
    });
    expect(result.reject).toBe(false);
  });
});

describe('protectedStrongAltFigureStageViolation', () => {
  const figureStage: AppliedRemediationTool[] = [{
    toolName: 'set_figure_alt_text',
    stage: 1,
    round: 1,
    scoreBefore: 59,
    scoreAfter: 55,
    delta: -4,
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
  }];

  it('rejects strong-baseline-alt figure mutations that regress score without alt improvement', () => {
    const result = protectedStrongAltFigureStageViolation({
      baseline: { score: 86, categories: { alt_text: 100 } },
      before: makeAnalysis({ score: 74, categories: { alt_text: 100 } }),
      after: makeAnalysis({ score: 70, categories: { alt_text: 16 } }),
      stageApplied: figureStage,
    });
    expect(result).toEqual({
      reject: true,
      reason: 'protected_strong_alt_figure_stage_regressed(100->16)',
    });
  });

  it('does not block weak-baseline-alt figure recovery', () => {
    const result = protectedStrongAltFigureStageViolation({
      baseline: { score: 87, categories: { alt_text: 45 } },
      before: makeAnalysis({ score: 59, categories: { alt_text: 0 } }),
      after: makeAnalysis({ score: 55, categories: { alt_text: 52 } }),
      stageApplied: figureStage,
    });
    expect(result.reject).toBe(false);
  });

  it('does not reject strong-baseline-alt figure mutations when alt improves', () => {
    const result = protectedStrongAltFigureStageViolation({
      baseline: { score: 86, categories: { alt_text: 100 } },
      before: makeAnalysis({ score: 59, categories: { alt_text: 16 } }),
      after: makeAnalysis({ score: 55, categories: { alt_text: 100 } }),
      stageApplied: figureStage,
    });
    expect(result.reject).toBe(false);
  });

  it('allows hard-failure strong-baseline-alt figure recovery when typed benefit exists', () => {
    const result = protectedStrongAltFigureStageViolation({
      baseline: { score: 86, categories: { alt_text: 100 } },
      before: makeAnalysis({ score: 59, categories: { alt_text: 0 } }),
      after: makeAnalysis({ score: 55, categories: { alt_text: 16 } }),
      stageApplied: figureStage,
    });
    expect(result.reject).toBe(false);
  });
});

describe('protectedReadingOrderTopupDecision', () => {
  it('accepts a protected reading-order improvement', () => {
    const result = protectedReadingOrderTopupDecision({
      baseline: { score: 100, categories: { reading_order: 100, alt_text: 100 } },
      before: makeAnalysis({ score: 96, categories: { reading_order: 80, alt_text: 100 } }),
      after: makeAnalysis({ score: 100, categories: { reading_order: 100, alt_text: 100 } }),
    });
    expect(result.accept).toBe(true);
    expect(JSON.parse(result.details ?? '{}')).toMatchObject({
      note: 'protected_reading_order_topup',
      protectedBaselineReadingOrderScore: 100,
      protectedBeforeReadingOrderScore: 80,
      protectedCandidateReadingOrderScore: 100,
    });
  });

  it('rejects when reading order does not improve and floor is not reached', () => {
    const result = protectedReadingOrderTopupDecision({
      baseline: { score: 100, categories: { reading_order: 100 } },
      before: makeAnalysis({ score: 94, categories: { reading_order: 80 } }),
      after: makeAnalysis({ score: 95, categories: { reading_order: 80 } }),
    });
    expect(result.accept).toBe(false);
    expect(JSON.parse(result.details ?? '{}').protectedFloorReason).toBe('protected_reading_order_topup_no_improvement');
  });

  it('rejects when a baseline-strong non-reading-order category regresses', () => {
    const result = protectedReadingOrderTopupDecision({
      baseline: { score: 100, categories: { reading_order: 100, alt_text: 100 } },
      before: makeAnalysis({ score: 94, categories: { reading_order: 80, alt_text: 100 } }),
      after: makeAnalysis({ score: 98, categories: { reading_order: 100, alt_text: 50 } }),
    });
    expect(result.accept).toBe(false);
    expect(JSON.parse(result.details ?? '{}').protectedFloorReason).toBe('protected_reading_order_topup_category_regressed(alt_text:100->50)');
  });
});

describe('shouldSkipProtectedFigureAlt', () => {
  it('skips speculative figure alt mutation on near-perfect protected rows', () => {
    expect(shouldSkipProtectedFigureAlt({
      baseline: { score: 100, categories: { alt_text: 100 } },
      currentAltScore: 80,
    })).toBe(true);
  });

  it('skips protected rows whose baseline alt was already strong when current alt is not collapsed', () => {
    expect(shouldSkipProtectedFigureAlt({
      baseline: { score: 92, categories: { alt_text: 100 } },
      currentAltScore: 70,
    })).toBe(true);
  });

  it('allows collapsed alt to be tried inside the protected transaction', () => {
    expect(shouldSkipProtectedFigureAlt({
      baseline: { score: 92, categories: { alt_text: 100 } },
      currentAltScore: 12,
      inProtectedTransaction: true,
    })).toBe(false);
  });
});

describe('shouldSkipCanonicalizeFigureAltBeforeRetag', () => {
  it('skips broad canonicalization when precise retag recovery is already scheduled from zero checker-visible figures', () => {
    const snapshot: DocumentSnapshot = {
      ...makeSnapshot({ depth: 4 }),
      figures: [{
        hasAlt: false,
        isArtifact: false,
        page: 0,
        role: 'Lbl',
        resolvedRole: 'Figure',
        reachable: true,
        directContent: true,
      }],
      checkerFigureTargets: [],
      detectionProfile: {
        ...makeSnapshot({ depth: 4 }).detectionProfile!,
        figureSignals: {
          extractedFigureCount: 2,
          treeFigureCount: 0,
          nonFigureRoleCount: 2,
          treeFigureMissingForExtractedFigures: true,
        },
      },
    };

    expect(shouldSkipCanonicalizeFigureAltBeforeRetag({
      stageTools: [
        { toolName: 'canonicalize_figure_alt_ownership', params: {}, rationale: 'test' },
        { toolName: 'retag_as_figure', params: {}, rationale: 'test' },
      ],
      analysis: makeAnalysis({ score: 54, categories: { alt_text: 20 } }),
      snapshot,
    })).toBe(true);
  });

  it('does not skip canonicalization when checker-visible figures already exist', () => {
    const snapshot: DocumentSnapshot = {
      ...makeSnapshot({ depth: 4 }),
      figures: [{ hasAlt: false, isArtifact: false, page: 0, reachable: true, directContent: true }],
      checkerFigureTargets: [{
        hasAlt: false,
        isArtifact: false,
        page: 0,
        reachable: true,
        directContent: true,
        parentPath: ['Document', 'Figure'],
      }],
    };

    expect(shouldSkipCanonicalizeFigureAltBeforeRetag({
      stageTools: [
        { toolName: 'canonicalize_figure_alt_ownership', params: {}, rationale: 'test' },
        { toolName: 'retag_as_figure', params: {}, rationale: 'test' },
      ],
      analysis: makeAnalysis({ score: 75, categories: { alt_text: 20 } }),
      snapshot,
    })).toBe(false);
  });
});
