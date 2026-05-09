import { describe, expect, it } from 'vitest';
import {
  buildCurrentFixed50AcceptanceDiagnostic,
  type CurrentFixed50Classification,
} from '../../scripts/current-fixed50-acceptance-diagnostic.js';
import type { BenchmarkRunSummary, RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function row(input: Partial<RemediateBenchmarkRow> & { id: string }): RemediateBenchmarkRow {
  return {
    id: input.id,
    file: `${input.id}.pdf`,
    cohort: 'test',
    sourceType: 'original',
    intent: 'test',
    beforeScore: 40,
    beforeGrade: 'F',
    beforePdfClass: 'native_untagged',
    afterScore: 'afterScore' in input ? input.afterScore ?? null : 93,
    afterGrade: 'afterGrade' in input ? input.afterGrade ?? null : 'A',
    afterPdfClass: 'native_tagged',
    reanalyzedScore: 'reanalyzedScore' in input
      ? input.reanalyzedScore ?? null
      : ('afterScore' in input ? input.afterScore ?? null : 93),
    reanalyzedGrade: 'reanalyzedGrade' in input
      ? input.reanalyzedGrade ?? null
      : ('afterGrade' in input ? input.afterGrade ?? null : 'A'),
    reanalyzedPdfClass: 'native_tagged',
    delta: null,
    appliedTools: input.appliedTools ?? [],
    rounds: [],
    analysisBeforeMs: 1,
    remediationDurationMs: 1,
    wallRemediateMs: input.wallRemediateMs ?? 1000,
    analysisAfterMs: 1,
    totalPipelineMs: 1,
    remediationOutcomeSummary: input.remediationOutcomeSummary,
    error: input.error,
  } as RemediateBenchmarkRow;
}

function summary(input: {
  selected?: number;
  success?: number;
  errors?: number;
  mean?: number;
  median?: number;
  p95?: number;
}): BenchmarkRunSummary {
  return {
    counts: {
      selectedEntries: input.selected ?? 1,
      remediateSuccess: input.success ?? 1,
      remediateErrors: input.errors ?? 0,
    },
    remediate: {
      reanalyzedScore: { mean: input.mean ?? 93, median: input.median ?? 93 },
      wallRemediateMs: { p95: input.p95 ?? 1000 },
    },
  } as BenchmarkRunSummary;
}

function report(rows: RemediateBenchmarkRow[], stage42BaselineAvailable = true) {
  return buildCurrentFixed50AcceptanceDiagnostic({
    runDir: 'run',
    summary: summary({
      selected: rows.length,
      success: rows.filter(item => !item.error).length,
      errors: rows.filter(item => item.error).length,
    }),
    rows,
    stage42BaselineAvailable,
    generatedAt: '2026-05-09T00:00:00.000Z',
  });
}

function classification(rows: RemediateBenchmarkRow[], id = rows[0]?.id ?? ''): CurrentFixed50Classification {
  const found = report(rows).rows.find(row => row.id === id);
  if (!found) throw new Error(`missing row ${id}`);
  return found.classification;
}

describe('current fixed-50 acceptance diagnostic', () => {
  it('keeps structure-4438 as parked hard-timeout debt', () => {
    expect(classification([
      row({ id: 'structure-4438', afterScore: null, reanalyzedScore: null, error: 'The operation was aborted due to timeout' }),
    ])).toBe('parked_runtime_debt');
  });

  it('does not hide non-parked hard timeouts', () => {
    const diagnostic = report([
      row({ id: 'long-4516', afterScore: null, reanalyzedScore: null, error: 'The operation was aborted due to timeout' }),
    ]);

    expect(diagnostic.summary.decision).toBe('blocked_by_non_parked_runtime_or_score_debt');
    expect(diagnostic.summary.nonParkedTimeoutRows).toEqual(['long-4516']);
  });

  it('classifies known route-volatility rows separately from score blockers', () => {
    expect(classification([
      row({ id: 'fixture-inaccessible', afterScore: 79, afterGrade: 'C', reanalyzedScore: 79, reanalyzedGrade: 'C' }),
    ])).toBe('parked_route_volatility');
  });

  it('blocks on non-parked residual F rows', () => {
    const diagnostic = report([
      row({ id: 'font-4057', afterScore: 38, afterGrade: 'F', reanalyzedScore: 38, reanalyzedGrade: 'F' }),
    ]);

    expect(diagnostic.summary.decision).toBe('blocked_by_non_parked_runtime_or_score_debt');
    expect(diagnostic.summary.nonParkedLowScoreRows).toEqual(['font-4057']);
  });

  it('blocks acceptance when Stage 42 baseline artifacts are unavailable', () => {
    const diagnostic = report([
      row({ id: 'font-3448', afterScore: 93, afterGrade: 'A' }),
    ], false);

    expect(diagnostic.summary.decision).toBe('blocked_by_missing_stage42_baseline');
  });

  it('blocks immediately on false-positive applied evidence', () => {
    const diagnostic = report([
      row({
        id: 'font-3448',
        afterScore: 93,
        afterGrade: 'A',
        remediationOutcomeSummary: { notes: ['false_positive_applied(set_figure_alt_text)'] } as never,
      }),
    ]);

    expect(diagnostic.summary.decision).toBe('blocked_by_false_positive');
    expect(diagnostic.summary.falsePositiveAppliedCount).toBe(1);
  });
});
