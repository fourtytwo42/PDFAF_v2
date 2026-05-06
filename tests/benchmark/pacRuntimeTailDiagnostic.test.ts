import { describe, expect, it } from 'vitest';
import {
  buildRuntimeTailDiagnostic,
  classifyRuntimeTail,
  parseRuntimeTimeoutTrace,
} from '../../scripts/pac-runtime-tail-diagnostic.js';
import { shouldSkipBenchmarkFinalReanalysis } from '../../scripts/experiment-corpus-benchmark.js';
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
  it('uses a soft deadline before benchmark final reanalysis', () => {
    expect(shouldSkipBenchmarkFinalReanalysis({
      startedAtMs: 0,
      score: 92,
      targetScore: 90,
      nowMs: 251_000,
      wallTimeoutMs: 300_000,
      requiredRemainingMs: 50_000,
    })).toBe(true);
    expect(shouldSkipBenchmarkFinalReanalysis({
      startedAtMs: 0,
      score: 92,
      targetScore: 90,
      nowMs: 250_000,
      wallTimeoutMs: 300_000,
      requiredRemainingMs: 50_000,
    })).toBe(false);
    expect(shouldSkipBenchmarkFinalReanalysis({
      startedAtMs: 0,
      score: 89,
      targetScore: 90,
      nowMs: 251_000,
      wallTimeoutMs: 300_000,
      requiredRemainingMs: 50_000,
    })).toBe(false);
  });

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

  it('classifies soft-stopped rows separately from hard timeouts', () => {
    expect(classifyRuntimeTail({
      row: row({
        id: 'soft',
        runtimeSummary: runtime({ earlyExit: 'soft_deadline_before_final_reanalysis' }),
      }),
      candidateWallMs: 260_000,
      stageReanalysisMs: 120_000,
      mutationToolMs: 10_000,
      sameStateNoGainEarlyExitCount: 0,
      protectedReanalysisPassCount: 0,
      pacGateRejectionCount: 0,
      softDeadlineEarlyExitCount: 1,
    })).toBe('soft_deadline_stop');
  });

  it('builds deterministic rows from focus ids and p95 tails', () => {
    const timeoutTraces = new Map([
      ['a', parseRuntimeTimeoutTrace({
        rowId: 'a',
        lastPhase: 'tool_start',
        elapsedMs: 299_000,
        lastStageNumber: 4,
        lastRound: 2,
        lastToolName: 'normalize_table_structure',
        lastToolOutcome: null,
        lastToolDurationMs: null,
        lastStateSignatureBefore: 'state-a',
        lastRejectedOrNoEffectReason: 'previous_no_effect',
        completedToolCount: 6,
        completedStageCount: 3,
        completedStageReanalysisCount: 2,
        completedStageReanalysisMs: 90_000,
      })!],
    ]);
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
      timeoutTraces,
      focusRows: ['a'],
      generatedAt: '2026-05-06T00:00:00.000Z',
    });

    expect(report.summary.timeoutRows).toEqual(['a']);
    expect(report.rows[0]?.timeoutTrace).toMatchObject({
      lastPhase: 'tool_start',
      lastToolName: 'normalize_table_structure',
      completedStageReanalysisMs: 90_000,
    });
    expect(report.rows.map(item => `${item.fileId}:${item.classification}`)).toEqual([
      'a:per_pdf_timeout',
      'b:reanalysis_heavy_large_document',
    ]);
  });

  it('does not count soft-stopped rows as timeout rows', () => {
    const report = buildRuntimeTailDiagnostic({
      referenceRunDir: 'ref',
      recoveryRunDir: 'recovery',
      candidateRunDir: 'candidate',
      referenceRows: [],
      recoveryRows: [],
      candidateRows: [
        row({
          id: 'soft',
          wallRemediateMs: 260_000,
          runtimeSummary: runtime({
            stageReanalyzeMs: [60_000, 80_000],
            earlyExit: 'soft_deadline_before_final_reanalysis',
          }),
        }),
        row({
          id: 'timeout',
          error: 'The operation was aborted due to timeout',
          wallRemediateMs: null,
        }),
      ],
      focusRows: ['soft', 'timeout'],
      generatedAt: '2026-05-06T00:00:00.000Z',
    });

    expect(report.summary.timeoutRows).toEqual(['timeout']);
    expect(report.rows.map(item => `${item.fileId}:${item.classification}`)).toEqual([
      'timeout:per_pdf_timeout',
      'soft:soft_deadline_stop',
    ]);
    expect(report.rows.find(item => item.fileId === 'soft')?.topStageKeys).toEqual([
      'soft_deadline_before_final_reanalysis',
    ]);
  });
});
