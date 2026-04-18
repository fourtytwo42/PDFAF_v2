import { describe, expect, it } from 'vitest';
import { buildStage7AcceptanceAudit, renderStage7AcceptanceMarkdown } from '../../src/services/benchmark/stage7Acceptance.js';
import type { BenchmarkComparison } from '../../src/services/benchmark/compareRuns.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function makeComparison(): BenchmarkComparison {
  return {
    beforeRunId: 'run-stage6-full',
    afterRunId: 'run-stage7-full',
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
      afterMeanDelta: 0,
      reanalyzedMeanDelta: 0,
      deltaMeanDelta: 0,
      wallMedianDeltaMs: 100,
      wallP95DeltaMs: 50,
      totalMedianDeltaMs: 90,
      totalP95DeltaMs: 80,
      beforeManualReviewRequiredDelta: 0,
      afterManualReviewRequiredDelta: 0,
      reanalyzedManualReviewRequiredDelta: 0,
      scoreCapFrequencyDelta: [],
      stageRuntimeMedianDeltaMs: [{ key: 'planner:stage1', beforeMedianMs: 10, afterMedianMs: 20, deltaMedianMs: 10 }],
      toolRuntimeMedianDeltaMs: [{ key: 'bootstrap_struct_tree', beforeMedianMs: 5, afterMedianMs: 9, deltaMedianMs: 4 }],
      semanticLaneRuntimeMedianDeltaMs: [{ key: 'figures', beforeMedianMs: 100, afterMedianMs: 120, deltaMedianMs: 20 }],
      costBenefitDelta: { scoreDeltaPerSecond: 0.1, confidenceDeltaPerSecond: 0 },
    },
    cohorts: {
      '20-figure-ownership': {
        analyzeMeanDelta: 0,
        analyzeRuntimeMedianDeltaMs: 0,
        manualReviewRequiredDelta: 0,
        scoreCapFrequencyDelta: [],
        remediationDeltaMeanDelta: 1.2,
        remediationRuntimeMedianDeltaMs: 500,
        costBenefitDelta: { scoreDeltaPerSecond: 0.2, confidenceDeltaPerSecond: 0 },
      },
      '30-structure-reading-order': {
        analyzeMeanDelta: 0,
        analyzeRuntimeMedianDeltaMs: 0,
        manualReviewRequiredDelta: 0,
        scoreCapFrequencyDelta: [],
        remediationDeltaMeanDelta: 0.7,
        remediationRuntimeMedianDeltaMs: 400,
        costBenefitDelta: { scoreDeltaPerSecond: 0.1, confidenceDeltaPerSecond: 0 },
      },
      '40-font-extractability': {
        analyzeMeanDelta: 0,
        analyzeRuntimeMedianDeltaMs: 0,
        manualReviewRequiredDelta: 0,
        scoreCapFrequencyDelta: [],
        remediationDeltaMeanDelta: 0.6,
        remediationRuntimeMedianDeltaMs: 300,
        costBenefitDelta: { scoreDeltaPerSecond: 0.1, confidenceDeltaPerSecond: 0 },
      },
      '50-long-report-mixed': {
        analyzeMeanDelta: 0,
        analyzeRuntimeMedianDeltaMs: 0,
        manualReviewRequiredDelta: 0,
        scoreCapFrequencyDelta: [],
        remediationDeltaMeanDelta: 0.8,
        remediationRuntimeMedianDeltaMs: 700,
        costBenefitDelta: { scoreDeltaPerSecond: 0.15, confidenceDeltaPerSecond: 0 },
      },
    },
  };
}

function makeRow(id: string): RemediateBenchmarkRow {
  return {
    id,
    file: `${id}.pdf`,
    cohort: '50-long-report-mixed',
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: 80,
    beforeGrade: 'B',
    beforePdfClass: 'native_tagged',
    afterScore: 81,
    afterGrade: 'B',
    afterPdfClass: 'native_tagged',
    reanalyzedScore: 81,
    reanalyzedGrade: 'B',
    reanalyzedPdfClass: 'native_tagged',
    delta: 1,
    appliedTools: [],
    rounds: [],
    analysisBeforeMs: 10,
    remediationDurationMs: 100,
    wallRemediateMs: 120,
    analysisAfterMs: 11,
    totalPipelineMs: 131,
    afterVerificationLevel: 'mixed',
    reanalyzedVerificationLevel: 'mixed',
    runtimeSummary: {
      analysisBefore: null,
      analysisAfter: null,
      deterministicTotalMs: 60,
      stageTimings: [],
      toolTimings: [],
      semanticLaneTimings: [],
      boundedWork: {
        semanticCandidateCapsHit: 0,
        deterministicEarlyExitCount: 1,
        deterministicEarlyExitReasons: [{ key: 'target_score_reached', count: 1 }],
        semanticSkipReasons: [{ key: 'figures:no_candidates', count: 1 }],
      },
    },
  };
}

describe('stage7 acceptance audit', () => {
  it('reports runtime gates and bounded-work signals', () => {
    const audit = buildStage7AcceptanceAudit({
      stage6RunDir: 'Output/experiment-corpus-baseline/run-stage6-full',
      stage7RunDir: 'Output/experiment-corpus-baseline/run-stage7-full',
      comparisonDir: 'Output/experiment-corpus-baseline/comparison-stage7-full-vs-stage6',
      stage7RemediateResults: [makeRow('doc-1')],
      comparison: makeComparison(),
    });

    expect(audit.gates.every(gate => gate.passed)).toBe(true);
    expect(audit.summary.boundedWorkFrequency[0]?.key).toContain('figures:no_candidates');
    const markdown = renderStage7AcceptanceMarkdown(audit);
    expect(markdown).toContain('# Stage 7 acceptance audit');
    expect(markdown).toContain('Bounded-work signals');
  });
});
