import { describe, expect, it } from 'vitest';
import { buildStage6AcceptanceAudit, renderStage6AcceptanceMarkdown } from '../../src/services/benchmark/stage6Acceptance.js';
import type { BenchmarkComparison } from '../../src/services/benchmark/compareRuns.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';
import type { SemanticRemediationSummary } from '../../src/types.js';

function makeComparison(): BenchmarkComparison {
  return {
    beforeRunId: 'run-stage5-full',
    afterRunId: 'run-stage6-full',
    generatedAt: '2026-04-18T00:00:00.000Z',
    analyze: {
      scoreMeanDelta: 0,
      scoreMedianDelta: 0,
      scoreP95Delta: 0,
      runtimeMedianDeltaMs: 0,
      runtimeP95DeltaMs: 0,
      manualReviewRequiredDelta: 0,
      scoreCapFrequencyDelta: [],
    },
    remediate: {
      beforeMeanDelta: 0,
      afterMeanDelta: 1,
      reanalyzedMeanDelta: 1.2,
      deltaMeanDelta: 1,
      wallMedianDeltaMs: -120,
      wallP95DeltaMs: 50,
      totalMedianDeltaMs: -100,
      totalP95DeltaMs: 60,
      beforeManualReviewRequiredDelta: 0,
      afterManualReviewRequiredDelta: 0,
      reanalyzedManualReviewRequiredDelta: 0,
      scoreCapFrequencyDelta: [],
    },
    cohorts: {},
  };
}

function semantic(lane: SemanticRemediationSummary['lane']): SemanticRemediationSummary {
  return {
    lane,
    skippedReason: 'completed',
    durationMs: 10,
    proposalsAccepted: 1,
    proposalsRejected: 0,
    scoreBefore: 80,
    scoreAfter: 85,
    batches: [],
    gate: {
      passed: true,
      reason: 'gate_passed',
      details: ['category:40->70'],
      candidateCountBefore: 2,
      candidateCountAfter: 1,
      targetCategoryKey: lane === 'figures' ? 'alt_text' : 'heading_structure',
      targetCategoryScoreBefore: 40,
      targetCategoryScoreAfter: 70,
    },
    changeStatus: 'applied',
  };
}

function makeRow(id: string): RemediateBenchmarkRow {
  return {
    id,
    file: `20-figure-ownership/${id}.pdf`,
    cohort: '20-figure-ownership',
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: 80,
    beforeGrade: 'B',
    beforePdfClass: 'native_tagged',
    afterScore: 85,
    afterGrade: 'A',
    afterPdfClass: 'native_tagged',
    reanalyzedScore: 85,
    reanalyzedGrade: 'A',
    reanalyzedPdfClass: 'native_tagged',
    delta: 5,
    appliedTools: [],
    rounds: [],
    analysisBeforeMs: 10,
    remediationDurationMs: 100,
    wallRemediateMs: 110,
    analysisAfterMs: 10,
    totalPipelineMs: 120,
    afterVerificationLevel: 'mixed',
    reanalyzedVerificationLevel: 'mixed',
    structuralConfidenceGuard: {
      rollbackCount: 1,
      lastRollbackReason: 'stage_regressed_structural_confidence(high->medium)',
    },
    remediationOutcomeSummary: {
      documentStatus: 'partially_fixed',
      targetedFamilies: ['headings'],
      familySummaries: [],
    },
    semantic: semantic('figures'),
    semanticHeadings: semantic('headings'),
    semanticPromoteHeadings: {
      ...semantic('promote_headings'),
      skippedReason: 'completed_no_changes',
      changeStatus: 'no_change',
      proposalsAccepted: 0,
    },
    semanticUntaggedHeadings: {
      ...semantic('untagged_headings'),
      skippedReason: 'unsupported_pdf',
      changeStatus: 'skipped',
      proposalsAccepted: 0,
    },
  };
}

describe('stage6 acceptance audit', () => {
  it('aggregates semantic lane usage and trust metrics', () => {
    const audit = buildStage6AcceptanceAudit({
      stage5RunDir: 'Output/experiment-corpus-baseline/run-stage5-full',
      stage6RunDir: 'Output/experiment-corpus-baseline/run-stage6-full',
      comparisonDir: 'Output/experiment-corpus-baseline/comparison-stage6-full-vs-stage5',
      stage5RemediateResults: [makeRow('doc-1')],
      stage6RemediateResults: [makeRow('doc-1')],
      comparison: makeComparison(),
    });

    expect(audit.summary.stage6FileCount).toBe(1);
    expect(audit.summary.semanticLaneUsage[0]?.count).toBeGreaterThan(0);
    expect(audit.summary.semanticOnlyTrustedPassCount).toBe(0);
    expect(audit.summary.acceptedConfidenceRegressionCount).toBe(0);
    const markdown = renderStage6AcceptanceMarkdown(audit);
    expect(markdown).toContain('# Stage 6 acceptance audit');
    expect(markdown).toContain('Semantic lane usage');
    expect(markdown).toContain('Semantic-only trusted passes');
    expect(markdown).toContain('Semantic structural-confidence reverts');
  });
});
