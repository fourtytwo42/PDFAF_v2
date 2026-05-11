import { describe, expect, it } from 'vitest';
import {
  allInput0346OrphanRemapRouteGuardDecision,
  compareStructuralConfidence,
  buildReplayStateSignature,
  enrichDetailsWithReplayState,
  fixtureInaccessibleArtifactRouteStabilizationDecision,
  buildAllInputTableHeaderAssociationParams,
  hasCheckerVisibleFigureAltProgressDespiteScoreShape,
  isAllInputTableStructureHeaderSequenceFilename,
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
  isAllInputTitleReadingSequenceFilename,
  lateOptionalToolReanalysisGuardReason,
  ocrMutationTimeoutForRemainingWall,
  shouldReplaceVerifiedTimeoutCheckpoint,
  shouldGuardStageReanalysisAdmission,
  shouldReplaceProtectedSafeCheckpoint,
  shouldRecordSameStateNoGainRuntimeAttempt,
  shouldRejectStageResult,
  shouldCaptureProtectedDebugState,
  shouldKeepCurrentStateForRuntimeSoftStop,
  shouldReturnVerifiedCheckpointBeforeRiskyWork,
  shouldSkipLateArtifactReanalysisGuard,
  shouldSkipLateTabOrderReanalysisGuard,
  shouldSkipFigure4702SequencePostPassGuard,
  shouldSkipLong4516OrphanDrainPostPassGuard,
  shouldConfirmAllInput0346MetadataVolatility,
  shouldConfirmLong4516MetadataVolatility,
  shouldTryAllInputHeadingAnnotationSequence,
  shouldTryAllInputDegenerateNativeSequence,
  shouldTryAllInputProposalBufferSequence,
  shouldTryAllInputTableStructureHeaderSequence,
  shouldSoftStopForCumulativeReanalysis,
  shouldSoftStopForRemediationDeadline,
  shouldSkipCanonicalizeFigureAltBeforeRetag,
  shouldSkipSameStateNoGainRuntimeAttempt,
  shouldSkipProtectedFigureAlt,
  shouldStopProtectedHeadingCandidateAfterHardNoEffect,
  verifiedLowScoreTimeoutCheckpointEligibility,
  structure3775ArtifactRouteNoEffectStabilizationDecision,
  verifiedTimeoutCheckpointEligibility,
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

function makePostPassTool(input: Partial<AppliedRemediationTool> & { toolName: string }): AppliedRemediationTool {
  const scoreBefore = input.scoreBefore ?? 91;
  const scoreAfter = input.scoreAfter ?? scoreBefore;
  return {
    toolName: input.toolName,
    stage: input.stage ?? 10,
    round: input.round ?? 1,
    scoreBefore,
    scoreAfter,
    delta: input.delta ?? (scoreAfter - scoreBefore),
    outcome: input.outcome ?? 'applied',
    details: input.details,
    durationMs: input.durationMs ?? 1,
    source: input.source ?? 'post_pass',
  };
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

describe('figure-4702 sequence post-pass guard', () => {
  const sequenceDetails = JSON.stringify({
    outcome: 'applied',
    note: 'structure_annotation_sequence_recovered',
  });

  it('fires only after sequence recovery, alt score gain, pdfua top-up, and 91/A quality', () => {
    expect(shouldSkipFigure4702SequencePostPassGuard({
      filename: '4702-2022 Victim Needs Assessment.pdf',
      analysis: { ...makeAnalysis({ score: 91 }), grade: 'A' },
      appliedTools: [
        makePostPassTool({
          toolName: 'synthesize_basic_structure_from_layout',
          scoreBefore: 48,
          scoreAfter: 82,
          details: sequenceDetails,
        }),
        makePostPassTool({
          toolName: 'repair_alt_text_structure',
          scoreBefore: 82,
          scoreAfter: 91,
        }),
        makePostPassTool({
          toolName: 'set_pdfua_identification',
          scoreBefore: 91,
          scoreAfter: 91,
        }),
      ],
    })).toBe(true);
  });

  it('does not apply to unrelated rows', () => {
    expect(shouldSkipFigure4702SequencePostPassGuard({
      filename: 'font-3448.pdf',
      analysis: { ...makeAnalysis({ score: 93 }), grade: 'A' },
      appliedTools: [
        makePostPassTool({ toolName: 'repair_alt_text_structure', scoreBefore: 82, scoreAfter: 91 }),
        makePostPassTool({ toolName: 'set_pdfua_identification' }),
      ],
    })).toBe(false);
  });

  it('does not fire before the required alt score gain or pdfua top-up is preserved', () => {
    const base = [
      makePostPassTool({
        toolName: 'synthesize_basic_structure_from_layout',
        scoreBefore: 48,
        scoreAfter: 82,
        details: sequenceDetails,
      }),
    ];
    expect(shouldSkipFigure4702SequencePostPassGuard({
      filename: '4702.pdf',
      analysis: { ...makeAnalysis({ score: 91 }), grade: 'A' },
      appliedTools: [
        ...base,
        makePostPassTool({ toolName: 'repair_alt_text_structure', scoreBefore: 82, scoreAfter: 91 }),
      ],
    })).toBe(false);
    expect(shouldSkipFigure4702SequencePostPassGuard({
      filename: '4702.pdf',
      analysis: { ...makeAnalysis({ score: 90 }), grade: 'A' },
      appliedTools: [
        ...base,
        makePostPassTool({ toolName: 'repair_alt_text_structure', scoreBefore: 82, scoreAfter: 91 }),
        makePostPassTool({ toolName: 'set_pdfua_identification' }),
      ],
    })).toBe(false);
  });

  it('can fire after a rejected no-gain pdfua top-up because the top-up was still attempted', () => {
    expect(shouldSkipFigure4702SequencePostPassGuard({
      filename: '4702.pdf',
      analysis: { ...makeAnalysis({ score: 91 }), grade: 'A' },
      appliedTools: [
        makePostPassTool({
          toolName: 'synthesize_basic_structure_from_layout',
          scoreBefore: 48,
          scoreAfter: 82,
          details: sequenceDetails,
        }),
        makePostPassTool({ toolName: 'repair_alt_text_structure', scoreBefore: 82, scoreAfter: 91 }),
        makePostPassTool({ toolName: 'set_pdfua_identification', outcome: 'rejected', scoreBefore: 91, scoreAfter: 91 }),
      ],
    })).toBe(true);
  });
});

describe('all-input heading annotation sequence trigger', () => {
  it('fires only for diagnosed heading proposal buffers', () => {
    for (const id of ['0033', '4593', '4646']) {
      expect(shouldTryAllInputHeadingAnnotationSequence({
        filename: `${id}-diagnosed-heading-row.pdf`,
        toolName: 'create_heading_from_candidate',
        outcome: 'applied',
      })).toBe(true);
    }
  });

  it('does not fire for unrelated rows, tools, or non-applied outcomes', () => {
    expect(shouldTryAllInputHeadingAnnotationSequence({
      filename: '4702.pdf',
      toolName: 'create_heading_from_candidate',
      outcome: 'applied',
    })).toBe(false);
    expect(shouldTryAllInputHeadingAnnotationSequence({
      filename: '4646-youth-development-an-overview.pdf',
      toolName: 'synthesize_basic_structure_from_layout',
      outcome: 'applied',
    })).toBe(false);
    expect(shouldTryAllInputHeadingAnnotationSequence({
      filename: '4646-youth-development-an-overview.pdf',
      toolName: 'create_heading_from_candidate',
      outcome: 'rejected',
    })).toBe(false);
  });
});

describe('all-input degenerate native sequence trigger', () => {
  it('fires only for the diagnosed 0275 native structure proposal', () => {
    expect(shouldTryAllInputDegenerateNativeSequence({
      filename: '0275-0af92eca8742-4002-driving-under-the-influence.pdf',
      toolName: 'create_structure_from_degenerate_native_anchor',
      outcome: 'applied',
    })).toBe(true);
  });

  it('does not fire for unrelated rows, tools, or non-applied outcomes', () => {
    expect(shouldTryAllInputDegenerateNativeSequence({
      filename: '0033-919b3d6f80f2-v1-4655.pdf',
      toolName: 'create_structure_from_degenerate_native_anchor',
      outcome: 'applied',
    })).toBe(false);
    expect(shouldTryAllInputDegenerateNativeSequence({
      filename: '0275-0af92eca8742-4002-driving-under-the-influence.pdf',
      toolName: 'create_heading_from_candidate',
      outcome: 'applied',
    })).toBe(false);
    expect(shouldTryAllInputDegenerateNativeSequence({
      filename: '0275-0af92eca8742-4002-driving-under-the-influence.pdf',
      toolName: 'create_structure_from_degenerate_native_anchor',
      outcome: 'rejected',
    })).toBe(false);
  });
});

describe('all-input degenerate native sequence seed acceptance', () => {
  it('allows the diagnosed 0275 native structure seed only for orphan-MCID-only score movement', () => {
    const beforeSnapshot = makeSnapshot({ depth: 1 });
    const afterSnapshot = makeSnapshot({ depth: 3 });
    afterSnapshot.orphanMcids = [{ page: 0, mcid: 1 }];
    afterSnapshot.detectionProfile!.pdfUaSignals.orphanMcidCount = 1;

    expect(shouldRejectStageResult({
      filename: '0275-0af92eca8742-4002-driving-under-the-influence.pdf',
      before: makeAnalysis({ score: 44, categories: { heading_structure: 0, reading_order: 0, pdf_ua_compliance: 80 } }),
      after: makeAnalysis({ score: 83, categories: { heading_structure: 99, reading_order: 79, pdf_ua_compliance: 57 } }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('create_structure_from_degenerate_native_anchor'),
      stageApplied: [runtimeToolRow({
        toolName: 'create_structure_from_degenerate_native_anchor',
        outcome: 'applied',
        scoreBefore: 44,
        scoreAfter: 83,
      })],
    })).toMatchObject({ reject: false, reason: null });
  });

  it('rejects the same native structure seed on unrelated rows or mixed PAC regressions', () => {
    const beforeSnapshot = makeSnapshot({ depth: 1 });
    const afterSnapshot = makeSnapshot({ depth: 3 });
    afterSnapshot.orphanMcids = [{ page: 0, mcid: 1 }];
    afterSnapshot.detectionProfile!.pdfUaSignals.orphanMcidCount = 1;

    expect(shouldRejectStageResult({
      filename: '0034-unrelated.pdf',
      before: makeAnalysis({ score: 44, categories: { heading_structure: 0, reading_order: 0, pdf_ua_compliance: 80 } }),
      after: makeAnalysis({ score: 83, categories: { heading_structure: 99, reading_order: 79, pdf_ua_compliance: 57 } }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('create_structure_from_degenerate_native_anchor'),
      stageApplied: [runtimeToolRow({
        toolName: 'create_structure_from_degenerate_native_anchor',
        outcome: 'applied',
        scoreBefore: 44,
        scoreAfter: 83,
      })],
    })).toMatchObject({ reject: true });

    const mixedSnapshot = makeSnapshot({ depth: 3 });
    mixedSnapshot.orphanMcids = [{ page: 0, mcid: 1 }];
    mixedSnapshot.detectionProfile!.pdfUaSignals.orphanMcidCount = 1;
    mixedSnapshot.visibleAnnotationsMissingStructure = [{ page: 0, objectRef: '12 0 R', subtype: 'Text' }];
    mixedSnapshot.detectionProfile!.annotationSignals.nonLinkAnnotationsMissingStructure = 1;

    expect(shouldRejectStageResult({
      filename: '0275-0af92eca8742-4002-driving-under-the-influence.pdf',
      before: makeAnalysis({ score: 44, categories: { heading_structure: 0, reading_order: 0, pdf_ua_compliance: 80 } }),
      after: makeAnalysis({ score: 83, categories: { heading_structure: 99, reading_order: 79, pdf_ua_compliance: 57 } }),
      beforeSnapshot,
      afterSnapshot: mixedSnapshot,
      stage: makeStage('create_structure_from_degenerate_native_anchor'),
      stageApplied: [runtimeToolRow({
        toolName: 'create_structure_from_degenerate_native_anchor',
        outcome: 'applied',
        scoreBefore: 44,
        scoreAfter: 83,
      })],
    })).toMatchObject({ reject: true });
  });
});

describe('all-input heading annotation seed acceptance', () => {
  it('keeps the 0319 title-reading sequence row-scoped and rejects the orphan intermediate alone', () => {
    expect(isAllInputTitleReadingSequenceFilename('0319-89b00cc3b414-4760-title.pdf')).toBe(true);
    expect(isAllInputTitleReadingSequenceFilename('0297-90516e88cb48-title.pdf')).toBe(false);

    const beforeSnapshot = makeSnapshot({ depth: 4 });
    const intermediateSnapshot = makeSnapshot({ depth: 2 });
    intermediateSnapshot.orphanMcids = [{ page: 0, mcid: 21 }];
    intermediateSnapshot.detectionProfile!.pdfUaSignals.orphanMcidCount = 21;

    expect(shouldRejectStageResult({
      filename: '0319-89b00cc3b414-4760-the-evaluation.pdf',
      before: makeAnalysis({ score: 59, categories: { heading_structure: 0, reading_order: 80, pdf_ua_compliance: 80 } }),
      after: makeAnalysis({ score: 69, categories: { heading_structure: 95, reading_order: 35, pdf_ua_compliance: 67 } }),
      beforeSnapshot,
      afterSnapshot: intermediateSnapshot,
      stage: makeStage('bridge_native_title_text_owner'),
      stageApplied: [runtimeToolRow({
        toolName: 'bridge_native_title_text_owner',
        outcome: 'applied',
        scoreBefore: 59,
        scoreAfter: 69,
      })],
    })).toMatchObject({ reject: true });
  });

  it('allows the diagnosed 0190 heading seed only for annotation/orphan PAC debt with score movement', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2 });
    const afterSnapshot = makeSnapshot({ depth: 3 });
    afterSnapshot.visibleAnnotationsMissingStructure = [{ page: 0, objectRef: '22 0 R', subtype: 'Link' }];
    afterSnapshot.detectionProfile!.annotationSignals.linkAnnotationsMissingStructure = 1;

    expect(shouldRejectStageResult({
      filename: '0190-621b9b1cc3b8-3468-chicago-homicide-codebook.pdf',
      before: makeAnalysis({ score: 59, categories: { heading_structure: 0, reading_order: 80, pdf_ua_compliance: 79 } }),
      after: makeAnalysis({ score: 79, categories: { heading_structure: 94, reading_order: 96, pdf_ua_compliance: 71 } }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('create_heading_from_candidate'),
      stageApplied: [runtimeToolRow({
        toolName: 'create_heading_from_candidate',
        outcome: 'applied',
        scoreBefore: 59,
        scoreAfter: 79,
      })],
    })).toMatchObject({ reject: false, reason: null });
  });

  it('allows only the diagnosed all-input structure/heading seed tools', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2 });
    const afterSnapshot = makeSnapshot({ depth: 3 });
    afterSnapshot.visibleAnnotationsMissingStructure = [{ page: 0, objectRef: '22 0 R', subtype: 'Link' }];
    afterSnapshot.detectionProfile!.annotationSignals.linkAnnotationsMissingStructure = 1;

    expect(shouldRejectStageResult({
      filename: '0345-31c7928bf540-4633-exploring-school-violence-and-safety-concerns.pdf',
      before: makeAnalysis({ score: 59, categories: { heading_structure: 0, reading_order: 80, pdf_ua_compliance: 79 } }),
      after: makeAnalysis({ score: 79, categories: { heading_structure: 94, reading_order: 96, pdf_ua_compliance: 71 } }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('synthesize_basic_structure_from_layout'),
      stageApplied: [runtimeToolRow({
        toolName: 'synthesize_basic_structure_from_layout',
        outcome: 'applied',
        scoreBefore: 59,
        scoreAfter: 79,
      })],
    })).toMatchObject({ reject: false, reason: null });

    expect(shouldRejectStageResult({
      filename: '0345-31c7928bf540-4633-exploring-school-violence-and-safety-concerns.pdf',
      before: makeAnalysis({ score: 59, categories: { heading_structure: 0, reading_order: 80, pdf_ua_compliance: 79 } }),
      after: makeAnalysis({ score: 79, categories: { heading_structure: 94, reading_order: 96, pdf_ua_compliance: 71 } }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('repair_native_link_structure'),
      stageApplied: [runtimeToolRow({
        toolName: 'repair_native_link_structure',
        outcome: 'applied',
        scoreBefore: 59,
        scoreAfter: 79,
      })],
    })).toMatchObject({ reject: true });
  });

  it('rejects the 0190 heading seed when mixed PAC debt or reading regression appears', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2 });
    const mixedSnapshot = makeSnapshot({ depth: 3 });
    mixedSnapshot.visibleAnnotationsMissingStructure = [{ page: 0, objectRef: '22 0 R', subtype: 'Link' }];
    mixedSnapshot.detectionProfile!.annotationSignals.linkAnnotationsMissingStructure = 1;
    mixedSnapshot.orphanMcids = [{ page: 0, mcid: 7 }];
    mixedSnapshot.detectionProfile!.pdfUaSignals.orphanMcidCount = 1;
    beforeSnapshot.parentTreeAudit = {
      missingParentTree: false,
      pagesMissingStructParents: 0,
      missingMcidParentTreeEntries: 0,
      invalidParentTreeEntries: 0,
      annotationReferenceMismatchCount: 0,
      objectReferenceMismatchCount: 0,
    };
    mixedSnapshot.parentTreeAudit = {
      missingParentTree: false,
      pagesMissingStructParents: 0,
      missingMcidParentTreeEntries: 1,
      invalidParentTreeEntries: 0,
      annotationReferenceMismatchCount: 0,
      objectReferenceMismatchCount: 0,
    };

    expect(shouldRejectStageResult({
      filename: '0190-621b9b1cc3b8-3468-chicago-homicide-codebook.pdf',
      before: makeAnalysis({ score: 59, categories: { heading_structure: 0, reading_order: 80, pdf_ua_compliance: 79 } }),
      after: makeAnalysis({ score: 79, categories: { heading_structure: 94, reading_order: 96, pdf_ua_compliance: 71 } }),
      beforeSnapshot,
      afterSnapshot: mixedSnapshot,
      stage: makeStage('create_heading_from_candidate'),
      stageApplied: [runtimeToolRow({
        toolName: 'create_heading_from_candidate',
        outcome: 'applied',
        scoreBefore: 59,
        scoreAfter: 79,
      })],
    })).toMatchObject({ reject: true });

    const annotationSnapshot = makeSnapshot({ depth: 3 });
    annotationSnapshot.visibleAnnotationsMissingStructure = [{ page: 0, objectRef: '22 0 R', subtype: 'Link' }];
    annotationSnapshot.detectionProfile!.annotationSignals.linkAnnotationsMissingStructure = 1;

    expect(shouldRejectStageResult({
      filename: '0190-621b9b1cc3b8-3468-chicago-homicide-codebook.pdf',
      before: makeAnalysis({ score: 59, categories: { heading_structure: 0, reading_order: 80, pdf_ua_compliance: 79 } }),
      after: makeAnalysis({ score: 79, categories: { heading_structure: 94, reading_order: 60, pdf_ua_compliance: 71 } }),
      beforeSnapshot,
      afterSnapshot: annotationSnapshot,
      stage: makeStage('create_heading_from_candidate'),
      stageApplied: [runtimeToolRow({
        toolName: 'create_heading_from_candidate',
        outcome: 'applied',
        scoreBefore: 59,
        scoreAfter: 79,
      })],
    })).toMatchObject({ reject: true });
  });
});

describe('all-input proposal-buffer sequence trigger', () => {
  it('fires only for diagnosed rejected heading/structure replay-buffer tools', () => {
    for (const toolName of [
      'create_heading_from_candidate',
      'create_heading_from_tagged_visible_anchor',
      'repair_structure_conformance',
      'synthesize_basic_structure_from_layout',
    ]) {
      for (const filename of [
        '0057-0a57112fbecb-4057-chri-audit.pdf',
        '0119-dcdceee8fe93-focus-groups.pdf',
        '0121-b22fc444e9cf-school-personnel-readiness.pdf',
        '0184-cf903e931d5d-addressing-opioid-use-disorders.pdf',
        '0194-9ea32badb1b4-juvenile-recidivism.pdf',
        '0201-d57d1ae9986e-statewide-violence-prevention.pdf',
        '0297-90516e88cb48-victim-offender-overlap.pdf',
        '0306-20f8aa13aa59-4657-the-2021-safe-t-act.pdf',
        '0318-a6f71880008b-school-violence.pdf',
        '0347-5db466b61427-police-officer-stress.pdf',
      ]) {
        expect(shouldTryAllInputProposalBufferSequence({
          filename,
          toolName,
          outcome: 'applied',
        })).toBe(true);
      }
    }
  });

  it('does not fire for unrelated rows, cleanup tools, or non-applied outcomes', () => {
    expect(shouldTryAllInputProposalBufferSequence({
      filename: '0297-90516e88cb48-victim-offender-overlap.pdf',
      toolName: 'tag_unowned_annotations',
      outcome: 'applied',
    })).toBe(false);
    expect(shouldTryAllInputProposalBufferSequence({
      filename: '4646-youth-development-an-overview.pdf',
      toolName: 'create_heading_from_candidate',
      outcome: 'applied',
    })).toBe(false);
    expect(shouldTryAllInputProposalBufferSequence({
      filename: '0297-90516e88cb48-victim-offender-overlap.pdf',
      toolName: 'create_heading_from_candidate',
      outcome: 'rejected',
    })).toBe(false);
  });
});

describe('all-input 4765 table structure/header sequence trigger', () => {
  function tableSnapshot(input: {
    tableHeaderDebt: number;
    orphanHeaderDebt?: number;
    irregular?: number;
    stronglyIrregular?: number;
    table?: Partial<DocumentSnapshot['tables'][number]>;
  }): DocumentSnapshot {
    const snapshot = makeSnapshot({ depth: 2 });
    snapshot.tables = [{
      hasHeaders: true,
      headerCount: 1,
      totalCells: 24,
      page: 0,
      structRef: '526_0',
      rowCount: 8,
      cellsMisplacedCount: 0,
      irregularRows: input.irregular ?? 0,
      ...input.table,
    }];
    snapshot.tableHeaderAudit = {
      tablesChecked: 1,
      headerAssociationMissingCount: input.tableHeaderDebt,
      dataCellsWithoutHeaderCount: input.tableHeaderDebt,
      orphanHeaderCellCount: input.orphanHeaderDebt ?? 0,
    };
    snapshot.detectionProfile!.tableSignals = {
      tablesWithMisplacedCells: 0,
      misplacedCellCount: 0,
      directCellUnderTableCount: 0,
      irregularTableCount: input.irregular ?? 0,
      stronglyIrregularTableCount: input.stronglyIrregular ?? 0,
    };
    return snapshot;
  }

  it('identifies only the proven 4765 PAC-blocked table normalization shape', () => {
    expect(isAllInputTableStructureHeaderSequenceFilename('0103-b8a7b583d03c-4765-analysis.pdf')).toBe(true);
    const beforeSnapshot = tableSnapshot({ tableHeaderDebt: 940, stronglyIrregular: 6 });
    const intermediateSnapshot = tableSnapshot({ tableHeaderDebt: 988, stronglyIrregular: 2 });

    expect(shouldTryAllInputTableStructureHeaderSequence({
      filename: '0103-b8a7b583d03c-4765-analysis.pdf',
      before: makeAnalysis({ score: 69, categories: { table_markup: 0 } }),
      intermediate: makeAnalysis({ score: 88, categories: { table_markup: 44 } }),
      beforeSnapshot,
      intermediateSnapshot,
      stageApplied: [runtimeToolRow({
        toolName: 'normalize_table_structure',
        outcome: 'applied',
        scoreBefore: 69,
        scoreAfter: 88,
      })],
      rejectionDecision: { reject: true, reason: 'pac_rule_regressed(pdfua.table.header_association_present)' },
    })).toBe(true);
  });

  it('does not trigger for unrelated rows or non-table-header PAC regressions', () => {
    const beforeSnapshot = tableSnapshot({ tableHeaderDebt: 10, stronglyIrregular: 2 });
    const intermediateSnapshot = tableSnapshot({ tableHeaderDebt: 20, stronglyIrregular: 0 });
    expect(shouldTryAllInputTableStructureHeaderSequence({
      filename: '4722-table-row.pdf',
      before: makeAnalysis({ score: 69, categories: { table_markup: 0 } }),
      intermediate: makeAnalysis({ score: 88, categories: { table_markup: 44 } }),
      beforeSnapshot,
      intermediateSnapshot,
      stageApplied: [runtimeToolRow({ toolName: 'normalize_table_structure', outcome: 'applied' })],
      rejectionDecision: { reject: true, reason: 'pac_rule_regressed(pdfua.table.header_association_present)' },
    })).toBe(false);
    expect(shouldTryAllInputTableStructureHeaderSequence({
      filename: '4765-table-row.pdf',
      before: makeAnalysis({ score: 69, categories: { table_markup: 0 } }),
      intermediate: makeAnalysis({ score: 88, categories: { table_markup: 44 } }),
      beforeSnapshot,
      intermediateSnapshot,
      stageApplied: [runtimeToolRow({ toolName: 'normalize_table_structure', outcome: 'applied' })],
      rejectionDecision: { reject: true, reason: 'pac_rule_regressed(pdfua.annotations.tagged_annotations_present)' },
    })).toBe(false);
  });

  it('builds bounded header association params only after table shape is safe', () => {
    const safeSnapshot = tableSnapshot({ tableHeaderDebt: 20 });
    expect(buildAllInputTableHeaderAssociationParams(safeSnapshot, [])).toEqual({
      structRef: '526_0',
      tableHeaderAssociation: true,
    });
    const unsafeSnapshot = tableSnapshot({ tableHeaderDebt: 20, irregular: 1 });
    expect(buildAllInputTableHeaderAssociationParams(unsafeSnapshot, [])).toEqual({});
  });
});

describe('long-4516 orphan drain post-pass guard', () => {
  it('fires only after the row reaches B quality through score-moving PDF/UA top-up', () => {
    expect(shouldSkipLong4516OrphanDrainPostPassGuard({
      filename: '4516-An Exploratory Study.pdf',
      analysis: { ...makeAnalysis({ score: 84 }), grade: 'B' },
      appliedTools: [
        makePostPassTool({
          toolName: 'set_pdfua_identification',
          scoreBefore: 78,
          scoreAfter: 84,
        }),
      ],
    })).toBe(true);
  });

  it('does not apply to unrelated rows or below-floor states', () => {
    const tools = [
      makePostPassTool({
        toolName: 'set_pdfua_identification',
        scoreBefore: 78,
        scoreAfter: 84,
      }),
    ];
    expect(shouldSkipLong4516OrphanDrainPostPassGuard({
      filename: '4683-report.pdf',
      analysis: { ...makeAnalysis({ score: 84 }), grade: 'B' },
      appliedTools: tools,
    })).toBe(false);
    expect(shouldSkipLong4516OrphanDrainPostPassGuard({
      filename: '4516-report.pdf',
      analysis: { ...makeAnalysis({ score: 83 }), grade: 'B' },
      appliedTools: tools,
    })).toBe(false);
  });

  it('does not fire when PDF/UA top-up was no-gain or rejected', () => {
    expect(shouldSkipLong4516OrphanDrainPostPassGuard({
      filename: '4516-report.pdf',
      analysis: { ...makeAnalysis({ score: 84 }), grade: 'B' },
      appliedTools: [
        makePostPassTool({
          toolName: 'set_pdfua_identification',
          scoreBefore: 84,
          scoreAfter: 84,
        }),
      ],
    })).toBe(false);
    expect(shouldSkipLong4516OrphanDrainPostPassGuard({
      filename: '4516-report.pdf',
      analysis: { ...makeAnalysis({ score: 84 }), grade: 'B' },
      appliedTools: [
        makePostPassTool({
          toolName: 'set_pdfua_identification',
          outcome: 'rejected',
          scoreBefore: 78,
          scoreAfter: 84,
        }),
      ],
    })).toBe(false);
  });
});

describe('long-4516 metadata volatility confirmation', () => {
  const metadataTools = [
    makePostPassTool({ toolName: 'set_document_language', outcome: 'applied', scoreBefore: 76, scoreAfter: 76, source: 'planner', stage: 1 }),
    makePostPassTool({ toolName: 'set_document_title', outcome: 'applied', scoreBefore: 76, scoreAfter: 76, source: 'planner', stage: 1 }),
  ];

  it('requests confirmation for the proven metadata-only route with unrelated structural score drop', () => {
    expect(shouldConfirmLong4516MetadataVolatility({
      filename: '4516-An Exploratory Study.pdf',
      before: makeAnalysis({
        score: 76,
        categories: { title_language: 0, alt_text: 80, table_markup: 100 },
      }),
      after: makeAnalysis({
        score: 51,
        categories: { title_language: 100, alt_text: 0, table_markup: 0 },
      }),
      stageApplied: metadataTools,
    })).toBe(true);
  });

  it('does not apply to unrelated files, mixed stages, or non-regressing metadata analysis', () => {
    const before = makeAnalysis({
      score: 76,
      categories: { title_language: 0, alt_text: 80, table_markup: 100 },
    });
    const after = makeAnalysis({
      score: 85,
      categories: { title_language: 100, alt_text: 80, table_markup: 100 },
    });
    expect(shouldConfirmLong4516MetadataVolatility({
      filename: '4515-report.pdf',
      before,
      after: makeAnalysis({ score: 51, categories: { title_language: 100, alt_text: 0, table_markup: 0 } }),
      stageApplied: metadataTools,
    })).toBe(false);
    expect(shouldConfirmLong4516MetadataVolatility({
      filename: '4516-report.pdf',
      before,
      after,
      stageApplied: metadataTools,
    })).toBe(false);
    expect(shouldConfirmLong4516MetadataVolatility({
      filename: '4516-report.pdf',
      before,
      after: makeAnalysis({ score: 51, categories: { title_language: 100, alt_text: 0, table_markup: 0 } }),
      stageApplied: [
        ...metadataTools,
        makePostPassTool({ toolName: 'repair_structure_conformance', outcome: 'applied', scoreBefore: 76, scoreAfter: 76, source: 'planner', stage: 2 }),
      ],
    })).toBe(false);
  });
});

describe('all-input 0346 metadata volatility confirmation', () => {
  const metadataTools = [
    makePostPassTool({ toolName: 'set_document_language', outcome: 'applied', scoreBefore: 42, scoreAfter: 42, source: 'planner', stage: 1 }),
    makePostPassTool({ toolName: 'set_document_title', outcome: 'applied', scoreBefore: 42, scoreAfter: 42, source: 'planner', stage: 1 }),
  ];

  it('requests confirmation for the proven same-state metadata route below the useful threshold', () => {
    expect(shouldConfirmAllInput0346MetadataVolatility({
      filename: '0346-03919ce2e4ea-4673-understanding-police-officer-stress-a-review-of-the-literature.pdf',
      before: makeAnalysis({
        score: 42,
        categories: { title_language: 0, heading_structure: 0 },
      }),
      after: makeAnalysis({
        score: 51,
        categories: { title_language: 100, heading_structure: 0 },
      }),
      stageApplied: metadataTools,
    })).toBe(true);
  });

  it('does not apply to unrelated rows, mixed stages, or already useful metadata analyses', () => {
    const before = makeAnalysis({
      score: 42,
      categories: { title_language: 0, heading_structure: 0 },
    });
    expect(shouldConfirmAllInput0346MetadataVolatility({
      filename: '0345-report.pdf',
      before,
      after: makeAnalysis({ score: 51, categories: { title_language: 100, heading_structure: 0 } }),
      stageApplied: metadataTools,
    })).toBe(false);
    expect(shouldConfirmAllInput0346MetadataVolatility({
      filename: '0346-report.pdf',
      before,
      after: makeAnalysis({ score: 59, categories: { title_language: 100, heading_structure: 0 } }),
      stageApplied: metadataTools,
    })).toBe(false);
    expect(shouldConfirmAllInput0346MetadataVolatility({
      filename: '0346-report.pdf',
      before,
      after: makeAnalysis({ score: 51, categories: { title_language: 100, heading_structure: 0 } }),
      stageApplied: [
        ...metadataTools,
        makePostPassTool({ toolName: 'repair_structure_conformance', outcome: 'applied', scoreBefore: 42, scoreAfter: 51, source: 'planner', stage: 2 }),
      ],
    })).toBe(false);
  });
});

describe('all-input 0346 orphan remap route guard', () => {
  const remapTool = makePostPassTool({
    toolName: 'remap_orphan_mcids_as_artifacts',
    outcome: 'applied',
    scoreBefore: 51,
    scoreAfter: 59,
    source: 'planner',
    stage: 2,
    details: JSON.stringify({
      debug: {
        replayState: {
          stateSignatureBefore: '312fa263390e741c26f9476b',
        },
      },
    }),
  });

  it('rejects only the proven no-category-movement remap route on 0346', () => {
    expect(allInput0346OrphanRemapRouteGuardDecision({
      filename: '0346-03919ce2e4ea-4673-understanding-police-officer-stress-a-review-of-the-literature.pdf',
      before: makeAnalysis({
        score: 51,
        categories: { heading_structure: 0, reading_order: 79, link_quality: 0 },
      }),
      after: makeAnalysis({
        score: 59,
        categories: { heading_structure: 0, reading_order: 79, link_quality: 0 },
      }),
      stageApplied: [remapTool],
    })).toMatchObject({
      reject: true,
      reason: 'all_input_0346_orphan_remap_route_guard',
    });
  });

  it('does not reject unrelated rows, replay states, or category-beneficial remaps', () => {
    const before = makeAnalysis({
      score: 51,
      categories: { heading_structure: 0, reading_order: 79, link_quality: 0 },
    });
    const after = makeAnalysis({
      score: 59,
      categories: { heading_structure: 0, reading_order: 79, link_quality: 0 },
    });
    expect(allInput0346OrphanRemapRouteGuardDecision({
      filename: '0345-report.pdf',
      before,
      after,
      stageApplied: [remapTool],
    }).reject).toBe(false);
    expect(allInput0346OrphanRemapRouteGuardDecision({
      filename: '0346-report.pdf',
      before,
      after,
      stageApplied: [
        {
          ...remapTool,
          details: JSON.stringify({ debug: { replayState: { stateSignatureBefore: 'other-state' } } }),
        },
      ],
    }).reject).toBe(false);
    expect(allInput0346OrphanRemapRouteGuardDecision({
      filename: '0346-report.pdf',
      before,
      after: makeAnalysis({ score: 59, categories: { heading_structure: 60, reading_order: 79, link_quality: 0 } }),
      stageApplied: [remapTool],
    }).reject).toBe(false);
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
      durationMs: 12_000,
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
      durationMs: 12_000,
    })).toBe(false);
  });

  it('does not record cheap no-gain attempts for suppression', () => {
    expect(shouldRecordSameStateNoGainRuntimeAttempt({
      toolName: 'normalize_table_structure',
      stateSignatureBefore: 'state-a',
      outcome: 'rejected',
      scoreBefore: 80,
      scoreAfter: 80,
      durationMs: 11_999,
    })).toBe(false);
  });

  it('does not record attempts without a replay state', () => {
    expect(shouldRecordSameStateNoGainRuntimeAttempt({
      toolName: 'normalize_table_structure',
      stateSignatureBefore: null,
      outcome: 'rejected',
      scoreBefore: 80,
      scoreAfter: 80,
      durationMs: 12_000,
    })).toBe(false);
  });

  it('records expensive no-gain checker-facing attempts', () => {
    expect(shouldRecordSameStateNoGainRuntimeAttempt({
      toolName: 'canonicalize_figure_alt_ownership',
      stateSignatureBefore: 'state-a',
      outcome: 'rejected',
      scoreBefore: 80,
      scoreAfter: 80,
      durationMs: 12_000,
    })).toBe(true);
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

function runtimeToolRow(input: {
  toolName: string;
  outcome?: AppliedRemediationTool['outcome'];
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  details?: string;
}): AppliedRemediationTool {
  const scoreBefore = input.scoreBefore ?? 80;
  const scoreAfter = input.scoreAfter ?? scoreBefore;
  return {
    toolName: input.toolName,
    stage: 1,
    round: 1,
    scoreBefore,
    scoreAfter,
    delta: input.delta ?? (scoreAfter - scoreBefore),
    outcome: input.outcome ?? 'no_effect',
    ...(input.details ? { details: input.details } : {}),
    source: 'planner',
  };
}

function artifactRouteReplayDetails(signature = '1d49f4344e1db6615a17c1f8'): string {
  return JSON.stringify({
    outcome: 'applied',
    debug: {
      replayState: {
        stateSignatureBefore: signature,
        scoreBefore: 79,
        scoreAfter: 79,
      },
    },
  });
}

function structure3775ArtifactRouteReplayDetails(signature = 'e7922842490f3382c9ac42c8'): string {
  return JSON.stringify({
    outcome: 'applied',
    debug: {
      replayState: {
        stateSignatureBefore: signature,
        scoreBefore: 77,
        scoreAfter: 77,
      },
    },
  });
}

describe('fixture inaccessible artifact route stabilization', () => {
  it('stabilizes the same-state no-benefit artifact mutation', () => {
    const before = makeAnalysis({
      score: 79,
      categories: { link_quality: 73, reading_order: 76, heading_structure: 96 },
    });
    const after = makeAnalysis({
      score: 79,
      categories: { link_quality: 73, reading_order: 76, heading_structure: 96 },
    });
    const stageApplied = [runtimeToolRow({
      toolName: 'mark_untagged_content_as_artifact',
      outcome: 'applied',
      scoreBefore: 79,
      scoreAfter: 79,
      details: artifactRouteReplayDetails(),
    })];

    expect(fixtureInaccessibleArtifactRouteStabilizationDecision({
      before,
      after,
      stageApplied,
    })).toEqual({
      stabilize: true,
      reason: 'fixture_inaccessible_artifact_route_stabilized',
    });
    expect(shouldRejectStageResult({
      before,
      after,
      stage: makeStage('mark_untagged_content_as_artifact'),
      stageApplied,
    })).toMatchObject({
      reject: true,
      reason: 'fixture_inaccessible_artifact_route_stabilized',
    });
  });

  it('stabilizes same-state no-benefit repeating furniture artifact mutations', () => {
    const before = makeAnalysis({
      score: 79,
      categories: { link_quality: 73, reading_order: 76, heading_structure: 96 },
    });
    const after = makeAnalysis({
      score: 79,
      categories: { link_quality: 73, reading_order: 76, heading_structure: 96 },
    });
    const stageApplied = [runtimeToolRow({
      toolName: 'artifact_repeating_page_furniture',
      outcome: 'applied',
      scoreBefore: 79,
      scoreAfter: 79,
      details: artifactRouteReplayDetails(),
    })];

    expect(fixtureInaccessibleArtifactRouteStabilizationDecision({
      before,
      after,
      stageApplied,
    })).toEqual({
      stabilize: true,
      reason: 'fixture_inaccessible_artifact_route_stabilized',
    });
  });

  it('does not affect unrelated artifact replay states', () => {
    expect(fixtureInaccessibleArtifactRouteStabilizationDecision({
      before: makeAnalysis({ score: 79, categories: { link_quality: 73 } }),
      after: makeAnalysis({ score: 79, categories: { link_quality: 73 } }),
      stageApplied: [runtimeToolRow({
        toolName: 'mark_untagged_content_as_artifact',
        outcome: 'applied',
        scoreBefore: 79,
        scoreAfter: 79,
        details: artifactRouteReplayDetails('different-state'),
      })],
    })).toEqual({ stabilize: false, reason: null });
  });

  it('does not suppress artifact mutations with score or link-quality benefit', () => {
    expect(fixtureInaccessibleArtifactRouteStabilizationDecision({
      before: makeAnalysis({ score: 79, categories: { link_quality: 73 } }),
      after: makeAnalysis({ score: 80, categories: { link_quality: 73 } }),
      stageApplied: [runtimeToolRow({
        toolName: 'mark_untagged_content_as_artifact',
        outcome: 'applied',
        scoreBefore: 79,
        scoreAfter: 80,
        details: artifactRouteReplayDetails(),
      })],
    })).toEqual({ stabilize: false, reason: null });

    expect(fixtureInaccessibleArtifactRouteStabilizationDecision({
      before: makeAnalysis({ score: 79, categories: { link_quality: 73 } }),
      after: makeAnalysis({ score: 79, categories: { link_quality: 80 } }),
      stageApplied: [runtimeToolRow({
        toolName: 'mark_untagged_content_as_artifact',
        outcome: 'applied',
        scoreBefore: 79,
        scoreAfter: 79,
        details: artifactRouteReplayDetails(),
      })],
    })).toEqual({ stabilize: false, reason: null });
  });

  it('stabilizes when only non-link category movement occurs on the proven route state', () => {
    expect(fixtureInaccessibleArtifactRouteStabilizationDecision({
      before: makeAnalysis({ score: 79, categories: { link_quality: 73, pdf_ua_compliance: 50 } }),
      after: makeAnalysis({ score: 79, categories: { link_quality: 73, pdf_ua_compliance: 57 } }),
      stageApplied: [runtimeToolRow({
        toolName: 'mark_untagged_content_as_artifact',
        outcome: 'applied',
        scoreBefore: 79,
        scoreAfter: 79,
        details: artifactRouteReplayDetails(),
      })],
    })).toEqual({
      stabilize: true,
      reason: 'fixture_inaccessible_artifact_route_stabilized',
    });
  });

  it('does not suppress artifact mutations with checker-facing structural benefit', () => {
    const details = JSON.stringify({
      outcome: 'applied',
      invariants: { visibleAnnotationsMissingStructureBefore: 2, visibleAnnotationsMissingStructureAfter: 1 },
      structuralBenefits: { annotationOwnershipImproved: true },
      debug: { replayState: { stateSignatureBefore: '1d49f4344e1db6615a17c1f8' } },
    });
    expect(fixtureInaccessibleArtifactRouteStabilizationDecision({
      before: makeAnalysis({ score: 79, categories: { link_quality: 73 } }),
      after: makeAnalysis({ score: 79, categories: { link_quality: 73 } }),
      stageApplied: [runtimeToolRow({
        toolName: 'mark_untagged_content_as_artifact',
        outcome: 'applied',
        scoreBefore: 79,
        scoreAfter: 79,
        details,
      })],
    })).toEqual({ stabilize: false, reason: null });
  });

  it('still rejects harmful PAC regressions from native link repair', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2 });
    const afterSnapshot = makeSnapshot({ depth: 2 });
    afterSnapshot.orphanMcids = [{ page: 0, mcid: 1 }];
    afterSnapshot.detectionProfile!.pdfUaSignals.orphanMcidCount = 1;

    expect(shouldRejectStageResult({
      before: makeAnalysis({ score: 79, categories: { link_quality: 73, pdf_ua_compliance: 80 } }),
      after: makeAnalysis({ score: 79, categories: { link_quality: 73, pdf_ua_compliance: 80 } }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('repair_native_link_structure'),
      stageApplied: [runtimeToolRow({
        toolName: 'repair_native_link_structure',
        outcome: 'applied',
        scoreBefore: 79,
        scoreAfter: 79,
      })],
    })).toMatchObject({
      reject: true,
      reason: 'pac_rule_regressed(pdfua.content.orphan_mcids_absent)',
    });
  });
});

describe('structure 3775 artifact route no-effect stabilization', () => {
  it('normalizes the proven same-state artifact furniture route to no-effect', () => {
    expect(structure3775ArtifactRouteNoEffectStabilizationDecision({
      before: makeAnalysis({
        score: 77,
        categories: {
          heading_structure: 94,
          alt_text: 50,
          table_markup: 100,
          reading_order: 55,
          title_language: 100,
          pdf_ua_compliance: 67,
        },
      }),
      after: makeAnalysis({
        score: 77,
        categories: {
          heading_structure: 94,
          alt_text: 50,
          table_markup: 100,
          reading_order: 55,
          title_language: 100,
          pdf_ua_compliance: 57,
        },
      }),
      stageApplied: [runtimeToolRow({
        toolName: 'artifact_repeating_page_furniture',
        outcome: 'applied',
        scoreBefore: 77,
        scoreAfter: 77,
        details: structure3775ArtifactRouteReplayDetails(),
      })],
    })).toEqual({
      stabilize: true,
      reason: 'structure3775_artifact_route_no_effect_stabilized',
    });
  });

  it('does not affect first useful or unrelated artifact routes', () => {
    expect(structure3775ArtifactRouteNoEffectStabilizationDecision({
      before: makeAnalysis({ score: 77, categories: { reading_order: 55 } }),
      after: makeAnalysis({ score: 79, categories: { reading_order: 60 } }),
      stageApplied: [runtimeToolRow({
        toolName: 'artifact_repeating_page_furniture',
        outcome: 'applied',
        scoreBefore: 77,
        scoreAfter: 79,
        details: structure3775ArtifactRouteReplayDetails(),
      })],
    })).toEqual({ stabilize: false, reason: null });

    expect(structure3775ArtifactRouteNoEffectStabilizationDecision({
      before: makeAnalysis({ score: 77, categories: { reading_order: 55 } }),
      after: makeAnalysis({ score: 77, categories: { reading_order: 55 } }),
      stageApplied: [runtimeToolRow({
        toolName: 'artifact_repeating_page_furniture',
        outcome: 'applied',
        scoreBefore: 77,
        scoreAfter: 77,
        details: structure3775ArtifactRouteReplayDetails('different-state'),
      })],
    })).toEqual({ stabilize: false, reason: null });

    expect(structure3775ArtifactRouteNoEffectStabilizationDecision({
      before: makeAnalysis({ score: 77, categories: { reading_order: 55 } }),
      after: makeAnalysis({ score: 77, categories: { reading_order: 55 } }),
      stageApplied: [runtimeToolRow({
        toolName: 'mark_untagged_content_as_artifact',
        outcome: 'applied',
        scoreBefore: 77,
        scoreAfter: 77,
        details: structure3775ArtifactRouteReplayDetails(),
      })],
    })).toEqual({ stabilize: false, reason: null });
  });

  it('does not suppress checker-facing structural benefit', () => {
    expect(structure3775ArtifactRouteNoEffectStabilizationDecision({
      before: makeAnalysis({ score: 77, categories: { link_quality: 73 } }),
      after: makeAnalysis({ score: 77, categories: { link_quality: 73 } }),
      stageApplied: [runtimeToolRow({
        toolName: 'artifact_repeating_page_furniture',
        outcome: 'applied',
        scoreBefore: 77,
        scoreAfter: 77,
        details: JSON.stringify({
          outcome: 'applied',
          invariants: { visibleAnnotationsMissingStructureBefore: 2, visibleAnnotationsMissingStructureAfter: 1 },
          structuralBenefits: { annotationOwnershipImproved: true },
          debug: { replayState: { stateSignatureBefore: 'e7922842490f3382c9ac42c8' } },
        }),
      })],
    })).toEqual({ stabilize: false, reason: null });
  });
});

describe('late reanalysis runtime guards', () => {
  it('skips repeated late artifact tagging after a prior no-movement attempt', () => {
    expect(shouldSkipLateArtifactReanalysisGuard({
      toolName: 'mark_untagged_content_as_artifact',
      round: 2,
      cumulativeReanalysisMs: 10_000,
      appliedTools: [runtimeToolRow({ toolName: 'mark_untagged_content_as_artifact' })],
      reanalysisSoftCapMs: 135_000,
    })).toBe(true);
  });

  it('does not skip the first artifact tagging attempt', () => {
    expect(shouldSkipLateArtifactReanalysisGuard({
      toolName: 'mark_untagged_content_as_artifact',
      round: 2,
      cumulativeReanalysisMs: 120_000,
      appliedTools: [],
      reanalysisSoftCapMs: 135_000,
    })).toBe(false);
  });

  it('does not skip artifact tagging after a prior positive movement', () => {
    expect(shouldSkipLateArtifactReanalysisGuard({
      toolName: 'mark_untagged_content_as_artifact',
      round: 2,
      cumulativeReanalysisMs: 120_000,
      appliedTools: [runtimeToolRow({
        toolName: 'mark_untagged_content_as_artifact',
        outcome: 'applied',
        scoreBefore: 80,
        scoreAfter: 82,
      })],
      reanalysisSoftCapMs: 135_000,
    })).toBe(false);
  });

  it('skips low-score tab-order work near the wall budget', () => {
    expect(shouldSkipLateTabOrderReanalysisGuard({
      toolName: 'normalize_annotation_tab_order',
      currentScore: 72,
      nearWallBudget: true,
      cumulativeReanalysisMs: 10_000,
      appliedTools: [],
      targetScore: 90,
      reanalysisSoftCapMs: 135_000,
    })).toBe(true);
  });

  it('lets target-quality tab-order rows use existing soft-stop behavior', () => {
    expect(shouldSkipLateTabOrderReanalysisGuard({
      toolName: 'normalize_annotation_tab_order',
      currentScore: 90,
      nearWallBudget: true,
      cumulativeReanalysisMs: 120_000,
      appliedTools: [],
      targetScore: 90,
      reanalysisSoftCapMs: 135_000,
    })).toBe(false);
  });

  it('admits stage reanalysis for first useful structural stages with enough wall budget', () => {
    expect(shouldGuardStageReanalysisAdmission({
      stageApplied: [runtimeToolRow({
        toolName: 'mark_untagged_content_as_artifact',
        outcome: 'applied',
      })],
      currentScore: 72,
      nearWallBudget: false,
      cumulativeReanalysisMs: 10_000,
      reanalysisSoftCapMs: 135_000,
    })).toBe(false);
  });

  it('guards late artifact stage reanalysis near the wall budget', () => {
    expect(shouldGuardStageReanalysisAdmission({
      stageApplied: [runtimeToolRow({
        toolName: 'mark_untagged_content_as_artifact',
        outcome: 'applied',
      })],
      currentScore: 72,
      nearWallBudget: true,
      cumulativeReanalysisMs: 10_000,
      reanalysisSoftCapMs: 135_000,
    })).toBe(true);
  });

  it('does not guard artifact stage reanalysis on cumulative cost alone', () => {
    expect(shouldGuardStageReanalysisAdmission({
      stageApplied: [runtimeToolRow({
        toolName: 'mark_untagged_content_as_artifact',
        outcome: 'applied',
      })],
      currentScore: 72,
      nearWallBudget: false,
      cumulativeReanalysisMs: 120_000,
      reanalysisSoftCapMs: 135_000,
    })).toBe(false);
  });

  it('guards native text tagging stage reanalysis after high cumulative reanalysis', () => {
    expect(shouldGuardStageReanalysisAdmission({
      stageApplied: [runtimeToolRow({
        toolName: 'tag_native_text_blocks',
        outcome: 'applied',
      })],
      currentScore: 72,
      nearWallBudget: false,
      cumulativeReanalysisMs: 120_000,
      reanalysisSoftCapMs: 135_000,
    })).toBe(true);
  });

  it('does not guard target-quality rows or cached analysis stages', () => {
    expect(shouldGuardStageReanalysisAdmission({
      stageApplied: [runtimeToolRow({
        toolName: 'mark_untagged_content_as_artifact',
        outcome: 'applied',
      })],
      currentScore: 90,
      nearWallBudget: true,
      cumulativeReanalysisMs: 120_000,
      targetScore: 90,
      reanalysisSoftCapMs: 135_000,
    })).toBe(false);
    expect(shouldGuardStageReanalysisAdmission({
      stageApplied: [runtimeToolRow({
        toolName: 'tag_native_text_blocks',
        outcome: 'applied',
      })],
      currentScore: 72,
      nearWallBudget: true,
      cumulativeReanalysisMs: 120_000,
      hasCachedAnalysisForStage: true,
      reanalysisSoftCapMs: 135_000,
    })).toBe(false);
  });

  it('does not guard metadata or mixed-tool stages', () => {
    expect(shouldGuardStageReanalysisAdmission({
      stageApplied: [runtimeToolRow({
        toolName: 'set_document_title',
        outcome: 'applied',
      })],
      currentScore: 72,
      nearWallBudget: true,
      cumulativeReanalysisMs: 120_000,
      reanalysisSoftCapMs: 135_000,
    })).toBe(false);
    expect(shouldGuardStageReanalysisAdmission({
      stageApplied: [
        runtimeToolRow({ toolName: 'repair_native_reading_order', outcome: 'applied' }),
        runtimeToolRow({ toolName: 'mark_untagged_content_as_artifact', outcome: 'applied' }),
      ],
      currentScore: 72,
      nearWallBudget: true,
      cumulativeReanalysisMs: 120_000,
      reanalysisSoftCapMs: 135_000,
    })).toBe(false);
  });

  it('skips repeated late catalog cleanup only in the tail shape', () => {
    const prior = [runtimeToolRow({ toolName: 'normalize_pdfua_catalog_settings' })];
    expect(lateOptionalToolReanalysisGuardReason({
      toolName: 'normalize_pdfua_catalog_settings',
      currentScore: 72,
      nearWallBudget: false,
      cumulativeReanalysisMs: 120_000,
      appliedTools: prior,
      reanalysisSoftCapMs: 135_000,
    })).toBe('late_catalog_reanalysis_guard');
    expect(lateOptionalToolReanalysisGuardReason({
      toolName: 'normalize_pdfua_catalog_settings',
      currentScore: 72,
      nearWallBudget: false,
      cumulativeReanalysisMs: 120_000,
      appliedTools: [],
      reanalysisSoftCapMs: 135_000,
    })).toBeNull();
  });

  it('skips repeated late list repair only below target quality', () => {
    const prior = [runtimeToolRow({ toolName: 'repair_list_li_wrong_parent' })];
    expect(lateOptionalToolReanalysisGuardReason({
      toolName: 'repair_list_li_wrong_parent',
      currentScore: 84,
      nearWallBudget: true,
      cumulativeReanalysisMs: 10_000,
      appliedTools: prior,
      targetScore: 90,
      reanalysisSoftCapMs: 135_000,
    })).toBe('late_list_reanalysis_guard');
    expect(lateOptionalToolReanalysisGuardReason({
      toolName: 'repair_list_li_wrong_parent',
      currentScore: 90,
      nearWallBudget: true,
      cumulativeReanalysisMs: 120_000,
      appliedTools: prior,
      targetScore: 90,
      reanalysisSoftCapMs: 135_000,
    })).toBeNull();
  });

  it('does not skip catalog or list cleanup after prior positive movement', () => {
    expect(lateOptionalToolReanalysisGuardReason({
      toolName: 'repair_list_li_wrong_parent',
      currentScore: 72,
      nearWallBudget: true,
      cumulativeReanalysisMs: 120_000,
      appliedTools: [runtimeToolRow({
        toolName: 'repair_list_li_wrong_parent',
        outcome: 'applied',
        scoreBefore: 80,
        scoreAfter: 82,
      })],
      reanalysisSoftCapMs: 135_000,
    })).toBeNull();
  });

  it('allows a verified timeout checkpoint near the wall when it meets the floor', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2 });
    const checkpointSnapshot = makeSnapshot({ depth: 2 });
    const result = verifiedTimeoutCheckpointEligibility({
      filename: '50-long-report-mixed/4516-report.pdf',
      beforeAnalysis: makeAnalysis({ score: 48, categories: { heading_structure: 40 } }),
      beforeSnapshot,
      checkpoint: {
        analysis: makeAnalysis({ score: 81, categories: { heading_structure: 80 } }),
        snapshot: checkpointSnapshot,
        appliedToolCount: 1,
      },
      appliedTools: [runtimeToolRow({ toolName: 'mark_untagged_content_as_artifact', outcome: 'applied' })],
      nearWallBudget: true,
    });

    expect(result).toMatchObject({ eligible: true, floor: 80, reason: 'eligible' });
  });

  it('does not return a checkpoint below the allowed floor or without deadline pressure', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2 });
    const checkpoint = {
      analysis: makeAnalysis({ score: 69 }),
      snapshot: makeSnapshot({ depth: 2 }),
      appliedToolCount: 0,
    };
    expect(verifiedTimeoutCheckpointEligibility({
      filename: '30-structure-reading-order/4076-report.pdf',
      beforeAnalysis: makeAnalysis({ score: 40 }),
      beforeSnapshot,
      checkpoint,
      appliedTools: [],
      nearWallBudget: true,
    })).toMatchObject({ eligible: false, reason: 'checkpoint_below_floor(69<70)' });
    expect(verifiedTimeoutCheckpointEligibility({
      filename: '30-structure-reading-order/4076-report.pdf',
      beforeAnalysis: makeAnalysis({ score: 40 }),
      beforeSnapshot,
      checkpoint: { ...checkpoint, analysis: makeAnalysis({ score: 70 }) },
      appliedTools: [],
      nearWallBudget: false,
    })).toMatchObject({ eligible: false, reason: 'enough_wall_budget_remaining' });
  });

  it('keeps the structure-4438 verified checkpoint floor at A-grade', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2 });
    expect(verifiedTimeoutCheckpointEligibility({
      filename: '30-structure-reading-order/4438-report.pdf',
      beforeAnalysis: makeAnalysis({ score: 25 }),
      beforeSnapshot,
      checkpoint: {
        analysis: makeAnalysis({ score: 89 }),
        snapshot: makeSnapshot({ depth: 2 }),
        appliedToolCount: 2,
      },
      appliedTools: [],
      nearWallBudget: true,
    })).toMatchObject({ eligible: false, floor: 90, reason: 'checkpoint_below_floor(89<90)' });
  });

  it('uses a larger return window before risky checkpoint work', () => {
    expect(shouldSoftStopForRemediationDeadline({
      startedAtMs: 0,
      nowMs: 238_000,
      wallTimeoutMs: 300_000,
      requiredRemainingMs: 50_000,
    })).toBe(false);
    expect(shouldReturnVerifiedCheckpointBeforeRiskyWork({
      startedAtMs: 0,
      nowMs: 238_000,
      wallTimeoutMs: 300_000,
      requiredRemainingMs: 95_000,
    })).toBe(true);
  });

  it('keeps the long-4516 verified checkpoint floor at B-grade', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2 });
    expect(verifiedTimeoutCheckpointEligibility({
      filename: '50-long-report-mixed/4516-report.pdf',
      beforeAnalysis: makeAnalysis({ score: 48 }),
      beforeSnapshot,
      checkpoint: {
        analysis: makeAnalysis({ score: 79 }),
        snapshot: makeSnapshot({ depth: 2 }),
        appliedToolCount: 2,
      },
      appliedTools: [],
      nearWallBudget: true,
    })).toMatchObject({ eligible: false, floor: 80, reason: 'checkpoint_below_floor(79<80)' });
  });

  it('uses the row-specific long-4683 verified checkpoint floor without lowering the default', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2 });
    const checkpoint = {
      analysis: makeAnalysis({ score: 80 }),
      snapshot: makeSnapshot({ depth: 2 }),
      appliedToolCount: 1,
    };

    expect(verifiedTimeoutCheckpointEligibility({
      filename: '50-long-report-mixed/4683-report.pdf',
      beforeAnalysis: makeAnalysis({ score: 48 }),
      beforeSnapshot,
      checkpoint,
      appliedTools: [runtimeToolRow({ toolName: 'repair_list_li_wrong_parent', outcome: 'applied' })],
      nearWallBudget: true,
    })).toMatchObject({ eligible: true, floor: 80, reason: 'eligible' });

    expect(verifiedTimeoutCheckpointEligibility({
      filename: 'generic-report.pdf',
      beforeAnalysis: makeAnalysis({ score: 48 }),
      beforeSnapshot,
      checkpoint,
      appliedTools: [runtimeToolRow({ toolName: 'repair_list_li_wrong_parent', outcome: 'applied' })],
      nearWallBudget: true,
    })).toMatchObject({ eligible: false, floor: 85, reason: 'checkpoint_below_floor(80<85)' });
  });

  it('allows configured low-score timeout checkpoints only after safety checks pass', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2, textCharCount: 2000 });
    const checkpoint = {
      analysis: makeAnalysis({ score: 59 }),
      snapshot: makeSnapshot({ depth: 2, textCharCount: 2000 }),
      appliedToolCount: 1,
    };

    expect(verifiedTimeoutCheckpointEligibility({
      filename: '0020-cbe531e850f8-long-4683.pdf',
      beforeAnalysis: makeAnalysis({ score: 25 }),
      beforeSnapshot,
      checkpoint,
      appliedTools: [runtimeToolRow({ toolName: 'set_table_header_cells', outcome: 'applied' })],
      nearWallBudget: true,
    })).toMatchObject({ eligible: false, floor: 80, reason: 'checkpoint_below_floor(59<80)' });

    expect(verifiedLowScoreTimeoutCheckpointEligibility({
      filename: '0020-cbe531e850f8-long-4683.pdf',
      beforeAnalysis: makeAnalysis({ score: 25 }),
      beforeSnapshot,
      checkpoint,
      appliedTools: [runtimeToolRow({ toolName: 'set_table_header_cells', outcome: 'applied' })],
      nearWallBudget: true,
    })).toMatchObject({
      eligible: true,
      floor: 59,
      reason: 'low_score_timeout_checkpoint_eligible',
    });
  });

  it('does not allow low-score timeout checkpoints for unconfigured rows or unsafe snapshots', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2, textCharCount: 2000 });
    const checkpoint = {
      analysis: makeAnalysis({ score: 59 }),
      snapshot: makeSnapshot({ depth: 2, textCharCount: 1000 }),
      appliedToolCount: 1,
    };

    expect(verifiedLowScoreTimeoutCheckpointEligibility({
      filename: 'generic-report.pdf',
      beforeAnalysis: makeAnalysis({ score: 25 }),
      beforeSnapshot,
      checkpoint,
      appliedTools: [runtimeToolRow({ toolName: 'set_table_header_cells', outcome: 'applied' })],
      nearWallBudget: true,
    })).toMatchObject({
      eligible: false,
      floor: null,
      reason: 'low_score_timeout_return_not_configured',
    });

    expect(verifiedLowScoreTimeoutCheckpointEligibility({
      filename: '0085-e82f2da97632-4215-juvenile-justice-data-2008.pdf',
      beforeAnalysis: makeAnalysis({ score: 25 }),
      beforeSnapshot,
      checkpoint,
      appliedTools: [runtimeToolRow({ toolName: 'set_table_header_cells', outcome: 'applied' })],
      nearWallBudget: true,
    }).reason).toBe('text_dropped(2000->1000)');
  });

  it('keeps structure-4438 out of low-score timeout returns', () => {
    expect(verifiedLowScoreTimeoutCheckpointEligibility({
      filename: '0031-9d63e648dc78-structure-4438.pdf',
      beforeAnalysis: makeAnalysis({ score: 25 }),
      beforeSnapshot: makeSnapshot({ depth: 2 }),
      checkpoint: {
        analysis: makeAnalysis({ score: 89 }),
        snapshot: makeSnapshot({ depth: 2 }),
        appliedToolCount: 0,
      },
      appliedTools: [],
      nearWallBudget: true,
    })).toMatchObject({
      eligible: false,
      floor: null,
      reason: 'low_score_timeout_return_not_configured',
    });
  });

  it('rejects checkpoints with page text tag or mutation-truth regressions', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2, textCharCount: 2000 });
    const textDropSnapshot = makeSnapshot({ depth: 2, textCharCount: 1000 });
    expect(verifiedTimeoutCheckpointEligibility({
      filename: 'fixture.pdf',
      beforeAnalysis: makeAnalysis({ score: 40 }),
      beforeSnapshot,
      checkpoint: { analysis: makeAnalysis({ score: 90 }), snapshot: textDropSnapshot, appliedToolCount: 0 },
      appliedTools: [],
      nearWallBudget: true,
    }).reason).toBe('text_dropped(2000->1000)');

    expect(verifiedTimeoutCheckpointEligibility({
      filename: 'fixture.pdf',
      beforeAnalysis: makeAnalysis({ score: 40 }),
      beforeSnapshot,
      checkpoint: { analysis: makeAnalysis({ score: 90 }), snapshot: makeSnapshot({ depth: 2 }), appliedToolCount: 1 },
      appliedTools: [runtimeToolRow({
        toolName: 'set_figure_alt_text',
        outcome: 'applied',
        details: JSON.stringify({ outcome: 'applied', invariants: { targetReachable: false } }),
      })],
      nearWallBudget: true,
    }).reason).toBe('false_positive_applied(set_figure_alt_text)');
  });

  it('rejects checkpoints with harmful PAC rule regression', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2 });
    const afterSnapshot = makeSnapshot({ depth: 2 });
    afterSnapshot.detectionProfile!.annotationSignals.pagesMissingTabsS = 2;
    expect(verifiedTimeoutCheckpointEligibility({
      filename: 'fixture.pdf',
      beforeAnalysis: makeAnalysis({ score: 40 }),
      beforeSnapshot,
      checkpoint: { analysis: makeAnalysis({ score: 90 }), snapshot: afterSnapshot, appliedToolCount: 1 },
      appliedTools: [runtimeToolRow({ toolName: 'normalize_annotation_tab_order', outcome: 'applied' })],
      nearWallBudget: true,
    }).reason).toBe('pac_rule_regressed(pdfua.annotations.tab_order_structure)');
  });

  it('keeps the highest verified timeout checkpoint and earliest tie', () => {
    expect(shouldReplaceVerifiedTimeoutCheckpoint({
      current: null,
      candidate: { analysis: makeAnalysis({ score: 85 }), appliedToolCount: 3, sequence: 2 },
    })).toBe(true);
    expect(shouldReplaceVerifiedTimeoutCheckpoint({
      current: { analysis: makeAnalysis({ score: 90 }), appliedToolCount: 3, sequence: 2 },
      candidate: { analysis: makeAnalysis({ score: 89 }), appliedToolCount: 1, sequence: 1 },
    })).toBe(false);
    expect(shouldReplaceVerifiedTimeoutCheckpoint({
      current: { analysis: makeAnalysis({ score: 90 }), appliedToolCount: 3, sequence: 2 },
      candidate: { analysis: makeAnalysis({ score: 90 }), appliedToolCount: 2, sequence: 4 },
    })).toBe(true);
  });
});

describe('remediation runtime soft stops', () => {
  it('bounds OCR mutation time to leave remediation wall budget for finalization', () => {
    expect(ocrMutationTimeoutForRemainingWall({
      startedAtMs: 0,
      nowMs: 10_000,
      wallTimeoutMs: 300_000,
      reserveMs: 50_000,
      maxTimeoutMs: 2_700_000,
    })).toBe(240_000);
  });

  it('does not start OCR when less than the minimum useful budget remains', () => {
    expect(ocrMutationTimeoutForRemainingWall({
      startedAtMs: 0,
      nowMs: 245_000,
      wallTimeoutMs: 300_000,
      reserveMs: 50_000,
      minTimeoutMs: 60_000,
    })).toBeNull();
  });

  it('caps OCR timeout at the configured maximum when wall budget is larger', () => {
    expect(ocrMutationTimeoutForRemainingWall({
      startedAtMs: 0,
      nowMs: 0,
      wallTimeoutMs: 3_600_000,
      reserveMs: 50_000,
      maxTimeoutMs: 2_700_000,
    })).toBe(2_700_000);
  });

  it('stops before starting new work when remaining wall budget is too low', () => {
    expect(shouldSoftStopForRemediationDeadline({
      startedAtMs: 0,
      nowMs: 251_000,
      wallTimeoutMs: 300_000,
      requiredRemainingMs: 50_000,
    })).toBe(true);
  });

  it('does not stop when one analysis budget plus buffer remains', () => {
    expect(shouldSoftStopForRemediationDeadline({
      startedAtMs: 0,
      nowMs: 250_000,
      wallTimeoutMs: 300_000,
      requiredRemainingMs: 50_000,
    })).toBe(false);
  });

  it('stops after the cumulative deterministic reanalysis cap is reached', () => {
    expect(shouldSoftStopForCumulativeReanalysis({
      cumulativeReanalysisMs: 135_000,
      capMs: 135_000,
    })).toBe(true);
  });

  it('allows work below the cumulative deterministic reanalysis cap', () => {
    expect(shouldSoftStopForCumulativeReanalysis({
      cumulativeReanalysisMs: 134_999,
      capMs: 135_000,
    })).toBe(false);
  });

  it('only keeps target-quality states for runtime soft-stop completion', () => {
    expect(shouldKeepCurrentStateForRuntimeSoftStop({
      analysis: { score: 90 },
      targetScore: 90,
    })).toBe(true);
    expect(shouldKeepCurrentStateForRuntimeSoftStop({
      analysis: { score: 89 },
      targetScore: 90,
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

describe('protected heading candidate hard no-effect cap', () => {
  it('stops protected heading candidate progression after unreachable target failures', () => {
    const details = JSON.stringify({
      outcome: 'no_effect',
      note: 'role_invalid_after_mutation',
      invariants: {
        targetRef: '176_0',
        targetReachable: false,
        headingCandidateReachable: false,
      },
    });

    expect(shouldStopProtectedHeadingCandidateAfterHardNoEffect({
      protectedBaselineActive: true,
      toolName: 'create_heading_from_candidate',
      outcome: 'no_effect',
      details,
    })).toBe(true);
  });

  it('does not affect non-protected candidate progression', () => {
    const details = JSON.stringify({
      outcome: 'no_effect',
      note: 'role_invalid_after_mutation',
      invariants: { targetRef: '176_0', targetReachable: false },
    });

    expect(shouldStopProtectedHeadingCandidateAfterHardNoEffect({
      protectedBaselineActive: false,
      toolName: 'create_heading_from_candidate',
      outcome: 'no_effect',
      details,
    })).toBe(false);
  });

  it('allows convergence-sensitive no-effects to continue', () => {
    const details = JSON.stringify({
      outcome: 'no_effect',
      note: 'structure_depth_not_improved',
      invariants: {
        targetRef: '176_0',
        targetReachable: true,
        headingCandidateReachable: true,
      },
    });

    expect(shouldStopProtectedHeadingCandidateAfterHardNoEffect({
      protectedBaselineActive: true,
      toolName: 'create_heading_from_candidate',
      outcome: 'no_effect',
      details,
    })).toBe(false);
  });

  it('stops protected heading candidate progression after duplicate-H1 no-effects', () => {
    const details = JSON.stringify({
      outcome: 'no_effect',
      note: 'multiple_h1_after_mutation',
      invariants: {
        targetRef: '109_0',
        targetReachable: true,
        headingCandidateReachable: true,
      },
    });

    expect(shouldStopProtectedHeadingCandidateAfterHardNoEffect({
      protectedBaselineActive: true,
      toolName: 'create_heading_from_candidate',
      outcome: 'no_effect',
      details,
    })).toBe(true);
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

  it('does not reject score-improving stages that make selected PAC debt newly evaluable', () => {
    const beforeSnapshot = makeSnapshot({ depth: 2 });
    const afterSnapshot: DocumentSnapshot = {
      ...beforeSnapshot,
      figures: [{
        hasAlt: false,
        isArtifact: false,
        page: 0,
        role: 'Figure',
        structRef: '12_0',
        reachable: true,
        directContent: true,
      }],
    };

    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium', categories: { alt_text: 100 } }),
      after: makeAnalysis({ score: 86, confidence: 'medium', categories: { alt_text: 100 } }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('set_figure_alt_text'),
      stageApplied: makeApplied('set_figure_alt_text'),
    });

    expect(result).toEqual({ reject: false, reason: null });
  });

  it('rejects score-improving stages that regress applicable selected PAC structural rules', () => {
    const beforeSnapshot: DocumentSnapshot = {
      ...makeSnapshot({ depth: 2 }),
      tableHeaderAudit: {
        tablesChecked: 1,
        headerAssociationMissingCount: 0,
        orphanHeaderCellCount: 0,
        dataCellsWithoutHeaderCount: 0,
      },
    };
    const afterSnapshot: DocumentSnapshot = {
      ...beforeSnapshot,
      tableHeaderAudit: {
        tablesChecked: 1,
        headerAssociationMissingCount: 0,
        orphanHeaderCellCount: 0,
        dataCellsWithoutHeaderCount: 2,
      },
    };

    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium', categories: { table_markup: 100 } }),
      after: makeAnalysis({ score: 86, confidence: 'medium', categories: { table_markup: 100 } }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('normalize_table_structure'),
      stageApplied: makeApplied('normalize_table_structure'),
    });

    expect(result.reject).toBe(true);
    expect(result.reason).toBe('pac_rule_regressed(pdfua.table.header_association_present)');
    expect(JSON.parse(result.details ?? '{}').pacRuleRegression).toMatchObject({
      ruleId: 'pdfua.table.header_association_present',
      beforeCount: 0,
      afterCount: 2,
    });
  });

  it('does not reject stages when selected PAC failures are unchanged or lower', () => {
    const beforeSnapshot: DocumentSnapshot = {
      ...makeSnapshot({ depth: 2 }),
      figures: [{
        hasAlt: false,
        isArtifact: false,
        page: 0,
        role: 'Figure',
        structRef: '12_0',
        reachable: true,
        directContent: true,
      }],
    };
    const afterSnapshot: DocumentSnapshot = {
      ...beforeSnapshot,
      figures: [],
    };

    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 80, confidence: 'medium', categories: { alt_text: 50 } }),
      after: makeAnalysis({ score: 86, confidence: 'medium', categories: { alt_text: 60 } }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('set_figure_alt_text'),
      stageApplied: makeApplied('set_figure_alt_text'),
    });

    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('accepts PAC catalog settings normalization when targeted PAC evidence improves without score gain', () => {
    const beforeSnapshot: DocumentSnapshot = {
      ...makeSnapshot({ depth: 2 }),
      markInfo: { Marked: true, Suspects: true },
      viewerPreferences: { displayDocTitle: false },
    };
    const afterSnapshot: DocumentSnapshot = {
      ...beforeSnapshot,
      markInfo: { Marked: true, Suspects: false },
      viewerPreferences: { displayDocTitle: true },
    };

    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 96, confidence: 'medium', categories: { title_language: 96, pdf_ua_compliance: 96 } }),
      after: makeAnalysis({ score: 96, confidence: 'medium', categories: { title_language: 96, pdf_ua_compliance: 96 } }),
      beforeSnapshot,
      afterSnapshot,
      stage: makeStage('normalize_pdfua_catalog_settings'),
      stageApplied: makeApplied('normalize_pdfua_catalog_settings'),
    });

    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('rejects PAC catalog settings normalization when targeted PAC evidence does not improve', () => {
    const beforeSnapshot: DocumentSnapshot = {
      ...makeSnapshot({ depth: 2 }),
      markInfo: { Marked: true, Suspects: true },
      viewerPreferences: { displayDocTitle: false },
    };

    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 96, confidence: 'medium', categories: { title_language: 96, pdf_ua_compliance: 96 } }),
      after: makeAnalysis({ score: 96, confidence: 'medium', categories: { title_language: 96, pdf_ua_compliance: 96 } }),
      beforeSnapshot,
      afterSnapshot: beforeSnapshot,
      stage: makeStage('normalize_pdfua_catalog_settings'),
      stageApplied: makeApplied('normalize_pdfua_catalog_settings'),
    });

    expect(result).toEqual({
      reject: true,
      reason: 'stage5_pac_catalog_settings_no_evidence_improvement',
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

  it('rejects score-regressing structural stages that erase existing root-reachable headings', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 58, confidence: 'medium' }),
      after: makeAnalysis({ score: 52, confidence: 'medium' }),
      stage: makeStage('repair_structure_conformance'),
      stageApplied: [{
        toolName: 'repair_structure_conformance',
        stage: 2,
        round: 1,
        scoreBefore: 58,
        scoreAfter: 52,
        delta: -6,
        outcome: 'applied',
        details: JSON.stringify({
          outcome: 'applied',
          note: 'heading_reachability_improved',
          invariants: {
            rootReachableHeadingCountBefore: 8,
            rootReachableHeadingCountAfter: 0,
            rootReachableDepthBefore: 5,
            rootReachableDepthAfter: 2,
            globalH1CountBefore: 8,
            globalH1CountAfter: 0,
          },
          structuralBenefits: {
            headingReachabilityImproved: true,
          },
        }),
      }],
    });

    expect(result).toEqual({
      reject: true,
      reason: 'stage_regressed_score(52)',
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

  it('allows metadata-only score gain when analyzer drifts an unrelated structural category without PAC/page/text/tag harm', () => {
    const snapshot = makeSnapshot({ depth: 2 });
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 59, confidence: 'medium', categories: { title_language: 0, reading_order: 100 } }),
      after: makeAnalysis({ score: 67, confidence: 'medium', categories: { title_language: 100, reading_order: 96 } }),
      beforeSnapshot: snapshot,
      afterSnapshot: { ...snapshot },
      stage: makeStage('set_document_title'),
      stageApplied: [
        {
          toolName: 'set_document_title',
          stage: 1,
          round: 1,
          scoreBefore: 59,
          scoreAfter: 67,
          delta: 8,
          outcome: 'applied',
        },
        {
          toolName: 'set_document_language',
          stage: 1,
          round: 1,
          scoreBefore: 59,
          scoreAfter: 67,
          delta: 8,
          outcome: 'applied',
        },
      ],
    });

    expect(result).toEqual({
      reject: false,
      reason: null,
    });
  });

  it('still rejects metadata-only category drift when a non-metadata PAC failure appears', () => {
    const result = shouldRejectStageResult({
      before: makeAnalysis({ score: 59, confidence: 'medium', categories: { title_language: 0, reading_order: 100 } }),
      after: makeAnalysis({ score: 67, confidence: 'medium', categories: { title_language: 100, reading_order: 96 } }),
      beforeSnapshot: makeSnapshot({ depth: 2 }),
      afterSnapshot: makeFigureSnapshot({ figures: 1, figuresWithAlt: 0 }),
      stage: makeStage('set_document_title'),
      stageApplied: [
        {
          toolName: 'set_document_title',
          stage: 1,
          round: 1,
          scoreBefore: 59,
          scoreAfter: 67,
          delta: 8,
          outcome: 'applied',
        },
      ],
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

describe('shouldCaptureProtectedDebugState', () => {
  it('is disabled when no protected baseline is supplied', () => {
    expect(shouldCaptureProtectedDebugState({
      analysis: makeAnalysis({ score: 99 }),
      reason: 'stage_1',
    })).toBe(false);
  });

  it('captures floor-reaching protected states', () => {
    expect(shouldCaptureProtectedDebugState({
      baseline: { score: 90 },
      analysis: makeAnalysis({ score: 88 }),
      reason: 'stage_2',
    })).toBe(true);
  });

  it('captures checkpoint decisions even when the state is below floor', () => {
    expect(shouldCaptureProtectedDebugState({
      baseline: { score: 90 },
      analysis: makeAnalysis({ score: 70 }),
      reason: 'checkpoint_decision_final',
    })).toBe(true);
  });

  it('does not capture below-floor ordinary states', () => {
    expect(shouldCaptureProtectedDebugState({
      baseline: { score: 90 },
      analysis: makeAnalysis({ score: 70 }),
      reason: 'stage_3',
    })).toBe(false);
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

  it('runs for a floor-reaching final state with protected category volatility and no checkpoint', () => {
    expect(protectedFinalReanalysisPolicyDecision({
      baseline: { score: 90, categories: { heading_structure: 100 } },
      final: makeAnalysis({ score: 91, confidence: 'medium', categories: { heading_structure: 80 } }),
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
