import { describe, expect, it } from 'vitest';
import {
  buildStage8FinalGateAudit,
  classifyStage8Disposition,
  renderStage8FinalGateMarkdown,
} from '../../src/services/benchmark/stage8FinalGate.js';
import type { BenchmarkComparison } from '../../src/services/benchmark/compareRuns.js';
import type { BenchmarkRunSummary, RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function makeSummary(runId: string, remediateMedian = 100, remediateP95 = 200): BenchmarkRunSummary {
  return {
    runId,
    generatedAt: '2026-04-18T00:00:00.000Z',
    mode: 'full',
    semanticEnabled: true,
    writePdfs: false,
    selectedFileIds: ['doc-1', 'doc-2'],
    counts: {
      manifestEntries: 50,
      selectedEntries: 2,
      analyzeSuccess: 2,
      analyzeErrors: 0,
      remediateSuccess: 2,
      remediateErrors: 0,
    },
    analyze: {
      score: { count: 2, mean: 80, median: 80, p95: 80, min: 79, max: 81 },
      analysisDurationMs: { count: 2, mean: 50, median: 50, p95: 60, min: 40, max: 60 },
      wallAnalyzeMs: { count: 2, mean: 60, median: 60, p95: 70, min: 50, max: 70 },
      gradeDistribution: { A: 1, B: 1 },
      pdfClassDistribution: { native_tagged: 2 },
      structureClassDistribution: {},
      primaryFailureFamilyDistribution: {},
      weakestCategories: [],
      topFindingMessages: [],
      manualReviewReasonFrequency: [],
      categoryManualReviewFrequency: [],
      categoryVerificationLevels: {},
      deterministicIssueFrequency: [],
      semanticIssueFrequency: [],
      manualOnlyIssueFrequency: [],
      readingOrderSignalFrequency: [],
      annotationSignalFrequency: [],
      taggedContentSignalFrequency: [],
      listTableSignalFrequency: [],
      manualReviewRequiredCount: 0,
      scoreCapsByCategory: [],
      topSlowestAnalyzeFiles: [],
    },
    remediate: {
      beforeScore: { count: 2, mean: 70, median: 70, p95: 72, min: 68, max: 72 },
      afterScore: { count: 2, mean: 85, median: 85, p95: 100, min: 70, max: 100 },
      reanalyzedScore: { count: 2, mean: 85, median: 85, p95: 100, min: 70, max: 100 },
      delta: { count: 2, mean: 15, median: 15, p95: 20, min: 10, max: 20 },
      remediationDurationMs: { count: 2, mean: 90, median: 90, p95: 100, min: 80, max: 100 },
      wallRemediateMs: { count: 2, mean: remediateMedian, median: remediateMedian, p95: remediateP95, min: 80, max: remediateP95 },
      analysisAfterMs: { count: 2, mean: 20, median: 20, p95: 30, min: 10, max: 30 },
      totalPipelineMs: { count: 2, mean: 120, median: 120, p95: 150, min: 100, max: 150 },
      gradeDistributionBefore: {},
      gradeDistributionAfter: {},
      gradeDistributionReanalyzed: {},
      pdfClassDistributionBefore: {},
      pdfClassDistributionAfter: {},
      pdfClassDistributionReanalyzed: {},
      beforeManualReviewRequiredCount: 1,
      afterManualReviewRequiredCount: 1,
      reanalyzedManualReviewRequiredCount: 1,
      afterManualReviewReasonFrequency: [],
      afterCategoryManualReviewFrequency: [],
      afterCategoryVerificationLevels: {},
      afterScoreCapsByCategory: [],
      primaryRouteDistribution: {},
      skippedToolReasonFrequency: [],
      scheduledToolFrequency: [],
      outcomeStatusDistribution: {},
      outcomeFamilyStatusFrequency: [],
      semanticLaneUsageFrequency: [],
      semanticLaneSkipReasonFrequency: [],
      semanticLaneChangeStatusFrequency: [],
      stageRuntimeFrequency: [],
      toolRuntimeFrequency: [],
      semanticLaneRuntimeFrequency: [],
      semanticOutcomeRuntimeFrequency: [],
      boundedWorkFrequency: [],
      costBenefit: { scoreDeltaPerSecond: 1, confidenceDeltaPerSecond: 0.1 },
      topSlowestRemediateFiles: [],
      topHighestDeltaFiles: [],
      topLowestDeltaFiles: [],
    },
    cohorts: {
      '00-fixtures': { fileCount: 0, analyzeSuccess: 0, analyzeErrors: 0, remediateSuccess: 0, remediateErrors: 0, analyzeScore: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, analyzeDurationMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, wallAnalyzeMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, remediationDelta: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, remediationDurationMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, wallRemediateMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, totalPipelineMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, costBenefit: { scoreDeltaPerSecond: null, confidenceDeltaPerSecond: null }, weakestCategories: [], topFindingMessages: [], manualReviewReasonFrequency: [], categoryManualReviewFrequency: [], categoryVerificationLevels: {}, structureClassDistribution: {}, primaryFailureFamilyDistribution: {}, deterministicIssueFrequency: [], semanticIssueFrequency: [], manualOnlyIssueFrequency: [], readingOrderSignalFrequency: [], annotationSignalFrequency: [], taggedContentSignalFrequency: [], listTableSignalFrequency: [], manualReviewRequiredCount: 0, scoreCapsByCategory: [] },
      '10-short-near-pass': { fileCount: 0, analyzeSuccess: 0, analyzeErrors: 0, remediateSuccess: 0, remediateErrors: 0, analyzeScore: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, analyzeDurationMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, wallAnalyzeMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, remediationDelta: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, remediationDurationMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, wallRemediateMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, totalPipelineMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, costBenefit: { scoreDeltaPerSecond: null, confidenceDeltaPerSecond: null }, weakestCategories: [], topFindingMessages: [], manualReviewReasonFrequency: [], categoryManualReviewFrequency: [], categoryVerificationLevels: {}, structureClassDistribution: {}, primaryFailureFamilyDistribution: {}, deterministicIssueFrequency: [], semanticIssueFrequency: [], manualOnlyIssueFrequency: [], readingOrderSignalFrequency: [], annotationSignalFrequency: [], taggedContentSignalFrequency: [], listTableSignalFrequency: [], manualReviewRequiredCount: 0, scoreCapsByCategory: [] },
      '20-figure-ownership': { fileCount: 1, analyzeSuccess: 1, analyzeErrors: 0, remediateSuccess: 1, remediateErrors: 0, analyzeScore: { count: 1, mean: 80, median: 80, p95: 80, min: 80, max: 80 }, analyzeDurationMs: { count: 1, mean: 50, median: 50, p95: 50, min: 50, max: 50 }, wallAnalyzeMs: { count: 1, mean: 60, median: 60, p95: 60, min: 60, max: 60 }, remediationDelta: { count: 1, mean: 10, median: 10, p95: 10, min: 10, max: 10 }, remediationDurationMs: { count: 1, mean: 90, median: 90, p95: 90, min: 90, max: 90 }, wallRemediateMs: { count: 1, mean: 100, median: 100, p95: 100, min: 100, max: 100 }, totalPipelineMs: { count: 1, mean: 120, median: 120, p95: 120, min: 120, max: 120 }, costBenefit: { scoreDeltaPerSecond: 1, confidenceDeltaPerSecond: 0.1 }, weakestCategories: [], topFindingMessages: [], manualReviewReasonFrequency: [], categoryManualReviewFrequency: [], categoryVerificationLevels: {}, structureClassDistribution: {}, primaryFailureFamilyDistribution: {}, deterministicIssueFrequency: [], semanticIssueFrequency: [], manualOnlyIssueFrequency: [], readingOrderSignalFrequency: [], annotationSignalFrequency: [], taggedContentSignalFrequency: [], listTableSignalFrequency: [], manualReviewRequiredCount: 0, scoreCapsByCategory: [] },
      '30-structure-reading-order': { fileCount: 0, analyzeSuccess: 0, analyzeErrors: 0, remediateSuccess: 0, remediateErrors: 0, analyzeScore: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, analyzeDurationMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, wallAnalyzeMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, remediationDelta: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, remediationDurationMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, wallRemediateMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, totalPipelineMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, costBenefit: { scoreDeltaPerSecond: null, confidenceDeltaPerSecond: null }, weakestCategories: [], topFindingMessages: [], manualReviewReasonFrequency: [], categoryManualReviewFrequency: [], categoryVerificationLevels: {}, structureClassDistribution: {}, primaryFailureFamilyDistribution: {}, deterministicIssueFrequency: [], semanticIssueFrequency: [], manualOnlyIssueFrequency: [], readingOrderSignalFrequency: [], annotationSignalFrequency: [], taggedContentSignalFrequency: [], listTableSignalFrequency: [], manualReviewRequiredCount: 0, scoreCapsByCategory: [] },
      '40-font-extractability': { fileCount: 0, analyzeSuccess: 0, analyzeErrors: 0, remediateSuccess: 0, remediateErrors: 0, analyzeScore: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, analyzeDurationMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, wallAnalyzeMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, remediationDelta: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, remediationDurationMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, wallRemediateMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, totalPipelineMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 }, costBenefit: { scoreDeltaPerSecond: null, confidenceDeltaPerSecond: null }, weakestCategories: [], topFindingMessages: [], manualReviewReasonFrequency: [], categoryManualReviewFrequency: [], categoryVerificationLevels: {}, structureClassDistribution: {}, primaryFailureFamilyDistribution: {}, deterministicIssueFrequency: [], semanticIssueFrequency: [], manualOnlyIssueFrequency: [], readingOrderSignalFrequency: [], annotationSignalFrequency: [], taggedContentSignalFrequency: [], listTableSignalFrequency: [], manualReviewRequiredCount: 0, scoreCapsByCategory: [] },
      '50-long-report-mixed': { fileCount: 1, analyzeSuccess: 1, analyzeErrors: 0, remediateSuccess: 1, remediateErrors: 0, analyzeScore: { count: 1, mean: 80, median: 80, p95: 80, min: 80, max: 80 }, analyzeDurationMs: { count: 1, mean: 50, median: 50, p95: 50, min: 50, max: 50 }, wallAnalyzeMs: { count: 1, mean: 60, median: 60, p95: 60, min: 60, max: 60 }, remediationDelta: { count: 1, mean: 20, median: 20, p95: 20, min: 20, max: 20 }, remediationDurationMs: { count: 1, mean: 90, median: 90, p95: 90, min: 90, max: 90 }, wallRemediateMs: { count: 1, mean: 100, median: 100, p95: 100, min: 100, max: 100 }, totalPipelineMs: { count: 1, mean: 120, median: 120, p95: 120, min: 120, max: 120 }, costBenefit: { scoreDeltaPerSecond: 1, confidenceDeltaPerSecond: 0.1 }, weakestCategories: [], topFindingMessages: [], manualReviewReasonFrequency: [], categoryManualReviewFrequency: [], categoryVerificationLevels: {}, structureClassDistribution: {}, primaryFailureFamilyDistribution: {}, deterministicIssueFrequency: [], semanticIssueFrequency: [], manualOnlyIssueFrequency: [], readingOrderSignalFrequency: [], annotationSignalFrequency: [], taggedContentSignalFrequency: [], listTableSignalFrequency: [], manualReviewRequiredCount: 0, scoreCapsByCategory: [] },
    },
  };
}

function makeComparison(): BenchmarkComparison {
  return {
    beforeRunId: 'run-stage1-pre-full',
    afterRunId: 'run-stage8-full',
    generatedAt: '2026-04-18T00:00:00.000Z',
    analyze: {
      scoreMeanDelta: 2,
      scoreMedianDelta: 2,
      scoreP95Delta: 2,
      runtimeMedianDeltaMs: -10,
      runtimeP95DeltaMs: -20,
      manualReviewRequiredDelta: 0,
      scoreCapFrequencyDelta: [],
    },
    remediate: {
      beforeMeanDelta: 0,
      afterMeanDelta: 10,
      reanalyzedMeanDelta: 12,
      deltaMeanDelta: 12,
      wallMedianDeltaMs: -200,
      wallP95DeltaMs: 100,
      totalMedianDeltaMs: -150,
      totalP95DeltaMs: 120,
      beforeManualReviewRequiredDelta: 0,
      afterManualReviewRequiredDelta: 0,
      reanalyzedManualReviewRequiredDelta: 0,
      scoreCapFrequencyDelta: [],
      stageRuntimeMedianDeltaMs: [],
      toolRuntimeMedianDeltaMs: [],
      semanticLaneRuntimeMedianDeltaMs: [],
      costBenefitDelta: { scoreDeltaPerSecond: 0.5, confidenceDeltaPerSecond: 0.1 },
    },
    cohorts: {
      '00-fixtures': { analyzeMeanDelta: 0, analyzeRuntimeMedianDeltaMs: 0, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0, costBenefitDelta: { scoreDeltaPerSecond: 0, confidenceDeltaPerSecond: 0 } },
      '10-short-near-pass': { analyzeMeanDelta: 0, analyzeRuntimeMedianDeltaMs: 0, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 0, remediationRuntimeMedianDeltaMs: 0, costBenefitDelta: { scoreDeltaPerSecond: 0, confidenceDeltaPerSecond: 0 } },
      '20-figure-ownership': { analyzeMeanDelta: 1, analyzeRuntimeMedianDeltaMs: -10, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 5, remediationRuntimeMedianDeltaMs: -100, costBenefitDelta: { scoreDeltaPerSecond: 0.5, confidenceDeltaPerSecond: 0.1 } },
      '30-structure-reading-order': { analyzeMeanDelta: 1, analyzeRuntimeMedianDeltaMs: -10, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 2, remediationRuntimeMedianDeltaMs: -100, costBenefitDelta: { scoreDeltaPerSecond: 0.5, confidenceDeltaPerSecond: 0.1 } },
      '40-font-extractability': { analyzeMeanDelta: 1, analyzeRuntimeMedianDeltaMs: -10, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 1, remediationRuntimeMedianDeltaMs: -100, costBenefitDelta: { scoreDeltaPerSecond: 0.5, confidenceDeltaPerSecond: 0.1 } },
      '50-long-report-mixed': { analyzeMeanDelta: 1, analyzeRuntimeMedianDeltaMs: -10, manualReviewRequiredDelta: 0, scoreCapFrequencyDelta: [], remediationDeltaMeanDelta: 1, remediationRuntimeMedianDeltaMs: -100, costBenefitDelta: { scoreDeltaPerSecond: 0.5, confidenceDeltaPerSecond: 0.1 } },
    },
  };
}

function makeRow(input: {
  id: string;
  cohort: RemediateBenchmarkRow['cohort'];
  baselineScore: number;
  finalScore: number;
  baselineGrade: string;
  finalGrade: string;
  outcome?: 'needs_manual_review' | 'unsafe_to_autofix' | 'fixed';
}): { baseline: RemediateBenchmarkRow; final: RemediateBenchmarkRow } {
  const baseline: RemediateBenchmarkRow = {
    id: input.id,
    file: `${input.id}.pdf`,
    cohort: input.cohort,
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: input.baselineScore,
    beforeGrade: input.baselineGrade as never,
    beforePdfClass: 'native_tagged',
    afterScore: input.baselineScore,
    afterGrade: input.baselineGrade as never,
    afterPdfClass: 'native_tagged',
    reanalyzedScore: input.baselineScore,
    reanalyzedGrade: input.baselineGrade as never,
    reanalyzedPdfClass: 'native_tagged',
    delta: 0,
    appliedTools: [],
    rounds: [],
    analysisBeforeMs: 10,
    remediationDurationMs: 100,
    wallRemediateMs: 100,
    analysisAfterMs: 20,
    totalPipelineMs: 120,
    afterVerificationLevel: 'mixed',
    reanalyzedVerificationLevel: 'mixed',
  };
  const final: RemediateBenchmarkRow = {
    ...baseline,
    afterScore: input.finalScore,
    afterGrade: input.finalGrade as never,
    reanalyzedScore: input.finalScore,
    reanalyzedGrade: input.finalGrade as never,
    delta: input.finalScore - input.baselineScore,
    remediationOutcomeSummary: input.outcome ? {
      documentStatus: input.outcome,
      targetedFamilies: [],
      familySummaries: [],
    } : undefined,
  };
  return { baseline, final };
}

describe('stage8 final gate', () => {
  it('classifies final dispositions', () => {
    const reached100 = makeRow({ id: 'a', cohort: '20-figure-ownership', baselineScore: 70, finalScore: 100, baselineGrade: 'C', finalGrade: 'A' });
    const reachedA = makeRow({ id: 'b', cohort: '20-figure-ownership', baselineScore: 80, finalScore: 95, baselineGrade: 'B', finalGrade: 'A' });
    const material = makeRow({ id: 'c', cohort: '20-figure-ownership', baselineScore: 60, finalScore: 72, baselineGrade: 'D', finalGrade: 'D' });
    const manual = makeRow({ id: 'd', cohort: '20-figure-ownership', baselineScore: 60, finalScore: 65, baselineGrade: 'D', finalGrade: 'D', outcome: 'needs_manual_review' });
    const unsafe = makeRow({ id: 'e', cohort: '20-figure-ownership', baselineScore: 60, finalScore: 65, baselineGrade: 'D', finalGrade: 'D', outcome: 'unsafe_to_autofix' });
    const notImproved = makeRow({ id: 'f', cohort: '20-figure-ownership', baselineScore: 60, finalScore: 62, baselineGrade: 'D', finalGrade: 'D' });

    expect(classifyStage8Disposition(reached100)).toBe('reached_100');
    expect(classifyStage8Disposition(reachedA)).toBe('reached_A_not_100');
    expect(classifyStage8Disposition(material)).toBe('materially_improved_but_incomplete');
    expect(classifyStage8Disposition(manual)).toBe('honest_bounded_manual_review');
    expect(classifyStage8Disposition(unsafe)).toBe('honest_bounded_unsafe_to_autofix');
    expect(classifyStage8Disposition(notImproved)).toBe('not_materially_improved');
  });

  it('reports final gate status and gate rows', () => {
    const row1 = makeRow({ id: 'doc-1', cohort: '20-figure-ownership', baselineScore: 70, finalScore: 100, baselineGrade: 'C', finalGrade: 'A' });
    const row2 = makeRow({ id: 'doc-2', cohort: '50-long-report-mixed', baselineScore: 60, finalScore: 72, baselineGrade: 'D', finalGrade: 'C' });
    const audit = buildStage8FinalGateAudit({
      baselineRunDir: 'Output/experiment-corpus-baseline/run-stage1-pre-full',
      finalRunDir: 'Output/experiment-corpus-baseline/run-stage8-full',
      comparisonDir: 'Output/experiment-corpus-baseline/comparison-stage8-full-vs-stage0',
      baselineSummary: makeSummary('baseline'),
      finalSummary: makeSummary('final', 90, 150),
      baselineRemediateResults: [row1.baseline, row2.baseline],
      finalRemediateResults: [row1.final, row2.final],
      comparison: makeComparison(),
    });

    expect(audit.summary.reached100Count).toBe(1);
    expect(audit.summary.reachedACount).toBe(1);
    expect(audit.gates.find(gate => gate.key === 'majority_reached_100')?.passed).toBe(false);
    const markdown = renderStage8FinalGateMarkdown(audit);
    expect(markdown).toContain('# Stage 8 final experiment gate');
    expect(markdown).toContain('Final gate: FAIL');
  });
});
