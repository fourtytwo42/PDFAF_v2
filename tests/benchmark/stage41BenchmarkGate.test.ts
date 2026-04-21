import { describe, expect, it } from 'vitest';
import type { BenchmarkRunSummary, RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';
import { buildStage41BenchmarkGateAudit } from '../../src/services/benchmark/stage41BenchmarkGate.js';

function makeSummary(overrides: {
  selectedEntries?: number;
  analyzeSuccess?: number;
  analyzeErrors?: number;
  remediateSuccess?: number;
  remediateErrors?: number;
  mean?: number;
  median?: number;
  p95WallMs?: number;
  medianWallMs?: number;
  maxWallMs?: number;
} = {}): BenchmarkRunSummary {
  return {
    runId: 'run-test',
    generatedAt: '2026-04-21T00:00:00.000Z',
    mode: 'remediate',
    semanticEnabled: false,
    writePdfs: false,
    selectedFileIds: Array.from({ length: overrides.selectedEntries ?? 50 }, (_, i) => `doc-${i}`),
    counts: {
      manifestEntries: 50,
      selectedEntries: overrides.selectedEntries ?? 50,
      analyzeSuccess: overrides.analyzeSuccess ?? 50,
      analyzeErrors: overrides.analyzeErrors ?? 0,
      remediateSuccess: overrides.remediateSuccess ?? 50,
      remediateErrors: overrides.remediateErrors ?? 0,
    },
    analyze: {
      score: { count: 50, mean: 40, median: 40, p95: 60, min: 10, max: 90 },
      analysisDurationMs: { count: 50, mean: 1, median: 1, p95: 1, min: 1, max: 1 },
      wallAnalyzeMs: { count: 50, mean: 1, median: 1, p95: 1, min: 1, max: 1 },
      gradeDistribution: {},
      pdfClassDistribution: {},
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
      beforeScore: { count: 50, mean: 40, median: 40, p95: 60, min: 10, max: 90 },
      afterScore: {
        count: 50,
        mean: overrides.mean ?? 76.28,
        median: overrides.median ?? 80,
        p95: 99,
        min: 47,
        max: 99,
      },
      reanalyzedScore: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 },
      delta: { count: 50, mean: 30, median: 30, p95: 70, min: 0, max: 80 },
      remediationDurationMs: { count: 50, mean: 10_000, median: 9_000, p95: 70_000, min: 100, max: 220_000 },
      wallRemediateMs: {
        count: 50,
        mean: 10_000,
        median: overrides.medianWallMs ?? 9_678,
        p95: overrides.p95WallMs ?? 72_702,
        min: 100,
        max: overrides.maxWallMs ?? 230_000,
      },
      analysisAfterMs: { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 },
      totalPipelineMs: { count: 50, mean: 10_000, median: 9_000, p95: 70_000, min: 100, max: 220_000 },
      gradeDistributionBefore: {},
      gradeDistributionAfter: {},
      gradeDistributionReanalyzed: {},
      pdfClassDistributionBefore: {},
      pdfClassDistributionAfter: {},
      pdfClassDistributionReanalyzed: {},
      beforeManualReviewRequiredCount: 0,
      afterManualReviewRequiredCount: 0,
      reanalyzedManualReviewRequiredCount: 0,
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
    cohorts: {},
  };
}

function makeRow(input: {
  id?: string;
  score?: number;
  grade?: string;
  wallMs?: number;
  tools?: RemediateBenchmarkRow['appliedTools'];
  routeSummaries?: boolean;
  caps?: RemediateBenchmarkRow['afterScoreCapsApplied'];
} = {}): RemediateBenchmarkRow {
  return {
    id: input.id ?? 'doc-1',
    file: `${input.id ?? 'doc-1'}.pdf`,
    cohort: '00-fixtures',
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: 40,
    beforeGrade: 'F',
    beforePdfClass: 'native_tagged',
    afterScore: input.score ?? 80,
    afterGrade: input.grade ?? 'B',
    afterPdfClass: 'native_tagged',
    afterCategories: [],
    afterScoreCapsApplied: input.caps ?? [],
    reanalyzedScore: null,
    reanalyzedGrade: null,
    reanalyzedPdfClass: null,
    reanalyzedCategories: [],
    reanalyzedScoreCapsApplied: [],
    planningSummary: {
      primaryRoute: 'structure_bootstrap',
      secondaryRoutes: [],
      triggeringSignals: [],
      scheduledTools: [],
      routeSummaries: input.routeSummaries === false ? [] : [{
        route: 'structure_bootstrap',
        status: 'active',
        scheduledTools: ['repair_structure_conformance'],
      }],
      skippedTools: [],
      semanticDeferred: false,
    },
    delta: 40,
    appliedTools: input.tools ?? [],
    rounds: [],
    analysisBeforeMs: 1,
    remediationDurationMs: input.wallMs ?? 1_000,
    wallRemediateMs: input.wallMs ?? 1_000,
    analysisAfterMs: null,
    totalPipelineMs: input.wallMs ?? 1_000,
  } as RemediateBenchmarkRow;
}

function makeRows(count = 50, overrides: Partial<Parameters<typeof makeRow>[0]> = {}): RemediateBenchmarkRow[] {
  return Array.from({ length: count }, (_, i) => makeRow({
    id: `doc-${i}`,
    score: 80,
    grade: i < 19 ? 'F' : 'B',
    ...overrides,
  }));
}

function buildAudit(input: {
  baselineSummary?: BenchmarkRunSummary;
  candidateSummary?: BenchmarkRunSummary;
  baselineRows?: RemediateBenchmarkRow[];
  candidateRows?: RemediateBenchmarkRow[];
} = {}) {
  return buildStage41BenchmarkGateAudit({
    baselineRunDir: 'baseline',
    candidateRunDir: 'candidate',
    baselineSummary: input.baselineSummary ?? makeSummary(),
    candidateSummary: input.candidateSummary ?? makeSummary(),
    baselineRemediateResults: input.baselineRows ?? makeRows(),
    candidateRemediateResults: input.candidateRows ?? makeRows(),
    generatedAt: '2026-04-21T00:00:00.000Z',
  });
}

describe('Stage 41 benchmark gate', () => {
  it('passes when candidate matches baseline', () => {
    const audit = buildAudit();
    expect(audit.passed).toBe(true);
    expect(audit.gates.every(gate => gate.severity === 'advisory' || gate.passed)).toBe(true);
  });

  it('fails when selected count or success counts are wrong', () => {
    const audit = buildAudit({
      candidateSummary: makeSummary({ selectedEntries: 49, analyzeSuccess: 49, analyzeErrors: 1, remediateSuccess: 49, remediateErrors: 1 }),
    });
    expect(audit.passed).toBe(false);
    expect(audit.gates.find(gate => gate.key === 'selected_file_count')?.passed).toBe(false);
    expect(audit.gates.find(gate => gate.key === 'analyze_success')?.passed).toBe(false);
    expect(audit.gates.find(gate => gate.key === 'remediate_success')?.passed).toBe(false);
  });

  it('fails when mean or median score falls below threshold', () => {
    const audit = buildAudit({ candidateSummary: makeSummary({ mean: 75.7, median: 78.5 }) });
    expect(audit.gates.find(gate => gate.key === 'score_mean_floor')?.passed).toBe(false);
    expect(audit.gates.find(gate => gate.key === 'score_median_floor')?.passed).toBe(false);
  });

  it('fails when p95 or median runtime exceeds thresholds', () => {
    const audit = buildAudit({ candidateSummary: makeSummary({ p95WallMs: 83_000, medianWallMs: 15_000 }) });
    expect(audit.gates.find(gate => gate.key === 'runtime_p95_wall')?.passed).toBe(false);
    expect(audit.gates.find(gate => gate.key === 'runtime_median_wall')?.passed).toBe(false);
  });

  it('fails when total tool attempts exceed baseline plus five percent', () => {
    const baselineTool = { toolName: 'repair_structure_conformance', stage: 1, round: 1, scoreBefore: 1, scoreAfter: 1, delta: 0, outcome: 'no_effect' as const };
    const candidateTools = Array.from({ length: 3 }, (_, i) => ({ ...baselineTool, stage: i + 1 }));
    const audit = buildAudit({
      baselineRows: makeRows(50, { tools: [baselineTool] }),
      candidateRows: makeRows(50, { tools: candidateTools }),
    });
    expect(audit.gates.find(gate => gate.key === 'total_tool_attempts')?.passed).toBe(false);
  });

  it('fails on applied rows with invariant-backed no_effect or failed details', () => {
    const audit = buildAudit({
      candidateRows: makeRows(50, {
        tools: [{
          toolName: 'set_figure_alt_text',
          stage: 1,
          round: 1,
          scoreBefore: 80,
          scoreAfter: 80,
          delta: 0,
          outcome: 'applied',
          details: JSON.stringify({ outcome: 'no_effect', invariants: { targetReachable: false } }),
        }],
      }),
    });
    expect(audit.passed).toBe(false);
    expect(audit.gates.find(gate => gate.key === 'false_positive_applied')?.passed).toBe(false);
    expect(audit.falsePositiveAppliedRows).toHaveLength(50);
  });

  it('reports legacy unparseable details without failing truthfulness', () => {
    const audit = buildAudit({
      candidateRows: makeRows(50, {
        tools: [{
          toolName: 'set_document_title',
          stage: 1,
          round: 1,
          scoreBefore: 80,
          scoreAfter: 80,
          delta: 0,
          outcome: 'applied',
          details: 'legacy_note',
        }],
      }),
    });
    expect(audit.gates.find(gate => gate.key === 'false_positive_applied')?.passed).toBe(true);
    expect(audit.summary.unknownDetailsCount).toBe(50);
  });

  it('fails when any row lacks route summaries', () => {
    const rows = makeRows();
    rows[0] = makeRow({ id: 'missing-route-summary', routeSummaries: false });
    const audit = buildAudit({ candidateRows: rows });
    expect(audit.passed).toBe(false);
    expect(audit.gates.find(gate => gate.key === 'route_summary_coverage')?.passed).toBe(false);
  });

  it('fails protected file regressions unless explained by a new score cap', () => {
    const baselineRows = [makeRow({ id: 'a', score: 90 }), ...makeRows(49).map((row, i) => ({ ...row, id: `b-${i}`, file: `b-${i}.pdf` }))];
    const candidateRows = [
      makeRow({ id: 'a', score: 87, caps: [{ category: 'heading_structure', cap: 59, rawScore: 90, finalScore: 59, reason: 'new strict cap' }] }),
      ...makeRows(49).map((row, i) => ({ ...row, id: `b-${i}`, file: `b-${i}.pdf` })),
    ];
    const explained = buildAudit({ baselineRows, candidateRows });
    expect(explained.gates.find(gate => gate.key === 'protected_file_regressions')?.passed).toBe(true);

    const unexplained = buildAudit({ baselineRows, candidateRows: [makeRow({ id: 'a', score: 87 }), ...candidateRows.slice(1)] });
    expect(unexplained.gates.find(gate => gate.key === 'protected_file_regressions')?.passed).toBe(false);
  });
});
