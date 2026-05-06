import { describe, expect, it } from 'vitest';
import {
  buildRuntimeTailDiagnostic,
  classifyRuntimeTail,
} from '../../scripts/pac-runtime-tail-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function row(input: Partial<RemediateBenchmarkRow> & { id: string }): RemediateBenchmarkRow {
  return {
    id: input.id,
    file: input.file ?? `${input.id}.pdf`,
    cohort: input.cohort ?? 'test',
    sourceType: input.sourceType ?? 'original',
    intent: input.intent ?? 'test',
    beforeScore: input.beforeScore ?? 50,
    beforeGrade: input.beforeGrade ?? 'F',
    beforePdfClass: input.beforePdfClass ?? 'native_untagged',
    afterScore: input.afterScore ?? 80,
    afterGrade: input.afterGrade ?? 'B',
    afterPdfClass: input.afterPdfClass ?? 'native_tagged',
    reanalyzedScore: input.reanalyzedScore ?? null,
    reanalyzedGrade: input.reanalyzedGrade ?? null,
    reanalyzedPdfClass: input.reanalyzedPdfClass ?? null,
    delta: input.delta ?? 30,
    appliedTools: input.appliedTools ?? [],
    rounds: input.rounds ?? [],
    runtimeSummary: input.runtimeSummary,
    analysisBeforeMs: input.analysisBeforeMs ?? 1000,
    remediationDurationMs: input.remediationDurationMs ?? 1000,
    wallRemediateMs: input.wallRemediateMs ?? 1000,
    analysisAfterMs: input.analysisAfterMs ?? 1000,
    totalPipelineMs: input.totalPipelineMs ?? 1000,
    error: input.error,
  } as RemediateBenchmarkRow;
}

function runtime(input: {
  stageReanalyzeMs?: number[];
  toolMs?: number[];
  earlyExit?: string;
}) {
  return {
    deterministicTotalMs: 1000,
    stageTimings: (input.stageReanalyzeMs ?? []).map((reanalyzeMs, index) => ({
      key: `planner:stage${index + 1}`,
      stageNumber: index + 1,
      round: 1,
      source: 'planner' as const,
      toolCount: 1,
      totalMs: reanalyzeMs + 100,
      reanalyzeMs,
    })),
    toolTimings: (input.toolMs ?? []).map((durationMs, index) => ({
      toolName: `tool_${index}`,
      stage: index + 1,
      round: 1,
      source: 'planner' as const,
      durationMs,
      outcome: 'applied' as const,
    })),
    semanticLaneTimings: [],
    boundedWork: {
      semanticCandidateCapsHit: 0,
      deterministicEarlyExitCount: input.earlyExit ? 1 : 0,
      deterministicEarlyExitReasons: input.earlyExit ? [{ key: input.earlyExit, count: 1 }] : [],
      semanticSkipReasons: [],
      zeroHeadingLaneActivations: 0,
      headingConvergenceAttemptCount: 0,
      headingConvergenceSuccessCount: 0,
      headingConvergenceFailureCount: 0,
      headingConvergenceTimeoutCount: 0,
      structureConformanceTimeoutCount: 0,
    },
  };
}

describe('PAC runtime tail diagnostic helpers', () => {
  it('classifies timeout rows separately from completed runtime tails', () => {
    expect(classifyRuntimeTail({
      row: row({ id: 'timeout', error: 'The operation was aborted due to timeout' }),
      candidateWallMs: null,
      stageReanalysisMs: 0,
      mutationToolMs: 0,
      sameStateNoGainEarlyExitCount: 0,
      protectedReanalysisPassCount: 0,
      pacGateRejectionCount: 0,
    })).toBe('per_pdf_timeout');
  });

  it('classifies repeated no-gain runtime churn before generic reanalysis heaviness', () => {
    expect(classifyRuntimeTail({
      row: row({ id: 'churn' }),
      candidateWallMs: 120_000,
      stageReanalysisMs: 80_000,
      mutationToolMs: 10_000,
      sameStateNoGainEarlyExitCount: 1,
      protectedReanalysisPassCount: 0,
      pacGateRejectionCount: 0,
    })).toBe('repeated_no_gain_tool_churn');
  });

  it('builds deterministic rows from focus ids and p95 tails', () => {
    const report = buildRuntimeTailDiagnostic({
      referenceRunDir: 'ref',
      recoveryRunDir: 'recovery',
      candidateRunDir: 'candidate',
      referenceRows: [
        row({ id: 'a', wallRemediateMs: 10_000, afterScore: 90 }),
        row({ id: 'b', wallRemediateMs: 20_000, afterScore: 95 }),
      ],
      recoveryRows: [
        row({ id: 'a', wallRemediateMs: 15_000, afterScore: 80 }),
        row({ id: 'b', wallRemediateMs: 30_000, afterScore: 85 }),
      ],
      candidateRows: [
        row({
          id: 'b',
          wallRemediateMs: 120_000,
          afterScore: 70,
          runtimeSummary: runtime({ stageReanalyzeMs: [50_000], toolMs: [5000] }),
        }),
        row({
          id: 'a',
          error: 'timeout',
          afterScore: null,
          wallRemediateMs: null,
        }),
      ],
      focusRows: ['a'],
      generatedAt: '2026-05-06T00:00:00.000Z',
    });

    expect(report.summary.timeoutRows).toEqual(['a']);
    expect(report.rows.map(item => `${item.fileId}:${item.classification}`)).toEqual([
      'a:per_pdf_timeout',
      'b:reanalysis_heavy_large_document',
    ]);
  });
});
