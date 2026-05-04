import type {
  AnalysisResult,
  CategoryKey,
  DocumentSnapshot,
  SemanticGateSummary,
  SemanticLane,
  SemanticRemediationSummary,
} from '../../types.js';
import { compareStructuralConfidence } from '../remediation/orchestrator.js';

function categoryScore(
  analysis: AnalysisResult,
  key: CategoryKey | null | undefined,
): number | null {
  if (!key) return null;
  return analysis.categories.find(category => category.key === key)?.score ?? null;
}

const SEMANTIC_FIGURE_CORE_CATEGORIES: CategoryKey[] = [
  'heading_structure',
  'reading_order',
  'table_markup',
  'pdf_ua_compliance',
  'link_quality',
];

function figureCoreRegressionReason(input: {
  beforeAnalysis: AnalysisResult;
  afterAnalysis: AnalysisResult;
  beforeSnapshot: DocumentSnapshot;
  afterSnapshot: DocumentSnapshot;
}): string | null {
  for (const key of SEMANTIC_FIGURE_CORE_CATEGORIES) {
    const before = categoryScore(input.beforeAnalysis, key);
    const after = categoryScore(input.afterAnalysis, key);
    if (before !== null && after !== null && after < before) {
      return `semantic_core_category_regressed:${key}:${before}->${after}`;
    }
  }
  if (input.afterAnalysis.pageCount !== input.beforeAnalysis.pageCount) {
    return `semantic_page_count_regressed:${input.beforeAnalysis.pageCount}->${input.afterAnalysis.pageCount}`;
  }
  if (input.afterSnapshot.pageCount !== input.beforeSnapshot.pageCount) {
    return `semantic_snapshot_page_count_regressed:${input.beforeSnapshot.pageCount}->${input.afterSnapshot.pageCount}`;
  }
  if (input.afterSnapshot.textCharCount < input.beforeSnapshot.textCharCount) {
    return `semantic_text_count_regressed:${input.beforeSnapshot.textCharCount}->${input.afterSnapshot.textCharCount}`;
  }
  if (input.afterSnapshot.isTagged !== input.beforeSnapshot.isTagged) {
    return `semantic_tagged_state_regressed:${input.beforeSnapshot.isTagged}->${input.afterSnapshot.isTagged}`;
  }
  return null;
}

export function buildSemanticGateSummary(input: {
  passed: boolean;
  reason: string;
  details?: string[];
  candidateCountBefore?: number;
  candidateCountAfter?: number;
  targetCategoryKey?: CategoryKey | null;
  targetCategoryScoreBefore?: number | null;
  targetCategoryScoreAfter?: number | null;
}): SemanticGateSummary {
  return {
    passed: input.passed,
    reason: input.reason,
    details: input.details ?? [],
    candidateCountBefore: input.candidateCountBefore ?? 0,
    candidateCountAfter: input.candidateCountAfter ?? (input.candidateCountBefore ?? 0),
    targetCategoryKey: input.targetCategoryKey ?? null,
    targetCategoryScoreBefore: input.targetCategoryScoreBefore ?? null,
    targetCategoryScoreAfter: input.targetCategoryScoreAfter ?? input.targetCategoryScoreBefore ?? null,
  };
}

export function buildSemanticSummary(input: {
  lane: SemanticLane;
  skippedReason: SemanticRemediationSummary['skippedReason'];
  durationMs: number;
  proposalsAccepted: number;
  proposalsRejected: number;
  scoreBefore: number;
  scoreAfter: number;
  batches: SemanticRemediationSummary['batches'];
  gate: SemanticGateSummary;
  changeStatus: SemanticRemediationSummary['changeStatus'];
  runtime?: SemanticRemediationSummary['runtime'];
  errorMessage?: string;
  trustDowngraded?: boolean;
}): SemanticRemediationSummary {
  return {
    lane: input.lane,
    skippedReason: input.skippedReason,
    durationMs: input.durationMs,
    proposalsAccepted: input.proposalsAccepted,
    proposalsRejected: input.proposalsRejected,
    scoreBefore: input.scoreBefore,
    scoreAfter: input.scoreAfter,
    batches: input.batches,
    gate: input.gate,
    changeStatus: input.changeStatus,
    ...(input.runtime ? { runtime: input.runtime } : {}),
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
    ...(input.trustDowngraded ? { trustDowngraded: true } : {}),
  };
}

export function evaluateSemanticMutation(input: {
  lane: SemanticLane;
  beforeAnalysis: AnalysisResult;
  afterAnalysis: AnalysisResult;
  beforeSnapshot: DocumentSnapshot;
  afterSnapshot: DocumentSnapshot;
  targetCategoryKey: CategoryKey;
  candidateCountBefore: number;
  candidateCountAfter: number;
  proposalsAccepted: number;
  proposalsRejected: number;
  batches: SemanticRemediationSummary['batches'];
  durationMs: number;
  regressionTolerance: number;
}): {
  accepted: boolean;
  skippedReason: SemanticRemediationSummary['skippedReason'];
  changeStatus: SemanticRemediationSummary['changeStatus'];
  errorMessage?: string;
  gate: SemanticGateSummary;
} {
  const targetScoreBefore = categoryScore(input.beforeAnalysis, input.targetCategoryKey);
  const targetScoreAfter = categoryScore(input.afterAnalysis, input.targetCategoryKey);
  const confidence = compareStructuralConfidence(input.beforeAnalysis, input.afterAnalysis);
  const categoryImproved =
    targetScoreBefore !== null
    && targetScoreAfter !== null
    && targetScoreAfter > targetScoreBefore;
  const candidateReduced = input.candidateCountAfter < input.candidateCountBefore;
  const overallImproved = input.afterAnalysis.score > input.beforeAnalysis.score;
  const figureLane = input.lane === 'figures';
  const coreRegression = figureLane ? figureCoreRegressionReason(input) : null;

  if (input.afterAnalysis.score < input.beforeAnalysis.score - input.regressionTolerance) {
    return {
      accepted: false,
      skippedReason: 'regression_reverted',
      changeStatus: 'reverted',
      errorMessage: 'semantic_score_regression_reverted',
      gate: buildSemanticGateSummary({
        passed: true,
        reason: 'semantic_score_regression_reverted',
        details: [`score:${input.beforeAnalysis.score}->${input.afterAnalysis.score}`],
        candidateCountBefore: input.candidateCountBefore,
        candidateCountAfter: input.candidateCountAfter,
        targetCategoryKey: input.targetCategoryKey,
        targetCategoryScoreBefore: targetScoreBefore,
        targetCategoryScoreAfter: targetScoreAfter,
      }),
    };
  }

  if (confidence.regressed) {
    return {
      accepted: false,
      skippedReason: 'regression_reverted',
      changeStatus: 'reverted',
      errorMessage: confidence.reason ?? 'semantic_structural_confidence_reverted',
      gate: buildSemanticGateSummary({
        passed: true,
        reason: 'semantic_structural_confidence_reverted',
        details: [confidence.reason ?? 'structural_confidence_regressed'],
        candidateCountBefore: input.candidateCountBefore,
        candidateCountAfter: input.candidateCountAfter,
        targetCategoryKey: input.targetCategoryKey,
        targetCategoryScoreBefore: targetScoreBefore,
        targetCategoryScoreAfter: targetScoreAfter,
      }),
    };
  }

  if (coreRegression) {
    return {
      accepted: false,
      skippedReason: 'regression_reverted',
      changeStatus: 'reverted',
      errorMessage: coreRegression,
      gate: buildSemanticGateSummary({
        passed: true,
        reason: 'semantic_core_category_regressed',
        details: [coreRegression],
        candidateCountBefore: input.candidateCountBefore,
        candidateCountAfter: input.candidateCountAfter,
        targetCategoryKey: input.targetCategoryKey,
        targetCategoryScoreBefore: targetScoreBefore,
        targetCategoryScoreAfter: targetScoreAfter,
      }),
    };
  }

  if (figureLane && !categoryImproved) {
    return {
      accepted: false,
      skippedReason: 'no_target_improvement',
      changeStatus: 'reverted',
      errorMessage: 'semantic_no_target_category_improvement',
      gate: buildSemanticGateSummary({
        passed: true,
        reason: 'semantic_no_target_category_improvement',
        details: [
          `category:${targetScoreBefore ?? 'n/a'}->${targetScoreAfter ?? 'n/a'}`,
          `candidates:${input.candidateCountBefore}->${input.candidateCountAfter}`,
        ],
        candidateCountBefore: input.candidateCountBefore,
        candidateCountAfter: input.candidateCountAfter,
        targetCategoryKey: input.targetCategoryKey,
        targetCategoryScoreBefore: targetScoreBefore,
        targetCategoryScoreAfter: targetScoreAfter,
      }),
    };
  }

  if (!categoryImproved && !candidateReduced && !overallImproved) {
    return {
      accepted: false,
      skippedReason: 'no_target_improvement',
      changeStatus: 'reverted',
      errorMessage: 'semantic_no_target_improvement',
      gate: buildSemanticGateSummary({
        passed: true,
        reason: 'semantic_no_target_improvement',
        details: [
          `category:${targetScoreBefore ?? 'n/a'}->${targetScoreAfter ?? 'n/a'}`,
          `candidates:${input.candidateCountBefore}->${input.candidateCountAfter}`,
        ],
        candidateCountBefore: input.candidateCountBefore,
        candidateCountAfter: input.candidateCountAfter,
        targetCategoryKey: input.targetCategoryKey,
        targetCategoryScoreBefore: targetScoreBefore,
        targetCategoryScoreAfter: targetScoreAfter,
      }),
    };
  }

  return {
    accepted: true,
    skippedReason: 'completed',
    changeStatus: 'applied',
    gate: buildSemanticGateSummary({
      passed: true,
      reason: 'gate_passed',
      details: [
        `category:${targetScoreBefore ?? 'n/a'}->${targetScoreAfter ?? 'n/a'}`,
        `candidates:${input.candidateCountBefore}->${input.candidateCountAfter}`,
      ],
      candidateCountBefore: input.candidateCountBefore,
      candidateCountAfter: input.candidateCountAfter,
      targetCategoryKey: input.targetCategoryKey,
      targetCategoryScoreBefore: targetScoreBefore,
      targetCategoryScoreAfter: targetScoreAfter,
    }),
  };
}

export function enforceSemanticTrust(input: {
  before: AnalysisResult;
  after: AnalysisResult;
  summaries: Array<SemanticRemediationSummary | undefined>;
}): { analysis: AnalysisResult; trustDowngraded: boolean } {
  const accepted = input.summaries.filter(
    (summary): summary is SemanticRemediationSummary =>
      summary !== undefined && summary.changeStatus === 'applied' && summary.proposalsAccepted > 0,
  );
  if (accepted.length === 0) {
    return { analysis: input.after, trustDowngraded: false };
  }

  let trustDowngraded = false;
  let manualReviewReasons = [...(input.after.manualReviewReasons ?? [])];
  const targetCategories = new Set(
    accepted
      .map(summary => summary.gate.targetCategoryKey)
      .filter((key): key is CategoryKey => typeof key === 'string'),
  );

  const categories = input.after.categories.map(category => {
    if (!targetCategories.has(category.key)) return category;
    if (category.verificationLevel === 'verified') trustDowngraded = true;
    return {
      ...category,
      evidence: 'inferred_after_fix' as const,
      verificationLevel: category.verificationLevel === 'verified' ? 'mixed' : category.verificationLevel ?? 'mixed',
    };
  });

  let verificationLevel = input.after.verificationLevel;
  if (verificationLevel === 'verified') {
    verificationLevel = 'mixed';
    trustDowngraded = true;
  }

  if (!manualReviewReasons.includes('Semantic improvements require corroborating deterministic evidence.')) {
    manualReviewReasons.push('Semantic improvements require corroborating deterministic evidence.');
  }

  const analysis: AnalysisResult = {
    ...input.after,
    categories,
    verificationLevel,
    ...(manualReviewReasons.length > 0 ? { manualReviewReasons } : {}),
  };
  return { analysis, trustDowngraded };
}
