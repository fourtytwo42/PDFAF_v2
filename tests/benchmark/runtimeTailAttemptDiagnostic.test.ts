import { describe, expect, it } from 'vitest';
import {
  buildRuntimeAttemptDiagnostic,
  type RuntimeAttemptClassification,
} from '../../scripts/runtime-tail-attempt-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';
import type { AppliedRemediationTool } from '../../src/types.js';

function tool(input: Partial<AppliedRemediationTool> & { toolName: string; outcome: AppliedRemediationTool['outcome'] }): AppliedRemediationTool {
  return {
    toolName: input.toolName,
    stage: input.stage ?? 1,
    round: input.round ?? 1,
    scoreBefore: input.scoreBefore ?? 80,
    scoreAfter: input.scoreAfter ?? 80,
    delta: input.delta ?? ((input.scoreAfter ?? 80) - (input.scoreBefore ?? 80)),
    outcome: input.outcome,
    details: input.details ?? JSON.stringify({
      outcome: input.outcome,
      debug: { replayState: { stateSignatureBefore: input.toolName } },
    }),
    durationMs: input.durationMs ?? 100,
    source: input.source,
  };
}

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
    afterScore: input.afterScore ?? 90,
    afterGrade: input.afterGrade ?? 'A',
    afterPdfClass: input.afterPdfClass ?? 'native_tagged',
    reanalyzedScore: input.reanalyzedScore ?? input.afterScore ?? 90,
    reanalyzedGrade: input.reanalyzedGrade ?? input.afterGrade ?? 'A',
    reanalyzedPdfClass: input.reanalyzedPdfClass ?? 'native_tagged',
    delta: input.delta ?? 40,
    appliedTools: input.appliedTools ?? [],
    rounds: input.rounds ?? [],
    runtimeSummary: input.runtimeSummary,
    protectedDebugStateCaptures: input.protectedDebugStateCaptures,
    protectedReanalysisSelection: input.protectedReanalysisSelection,
    analysisBeforeMs: input.analysisBeforeMs ?? 1000,
    remediationDurationMs: input.remediationDurationMs ?? 1000,
    wallRemediateMs: input.wallRemediateMs ?? 1000,
    analysisAfterMs: input.analysisAfterMs ?? 1000,
    totalPipelineMs: input.totalPipelineMs ?? 1000,
    error: input.error,
  } as RemediateBenchmarkRow;
}

function reportFor(rows: RemediateBenchmarkRow[]) {
  return buildRuntimeAttemptDiagnostic({
    baselineRunDir: 'baseline',
    candidateRunDir: 'candidate',
    baselineRows: rows.map(item => row({ id: item.id, afterScore: 90, reanalyzedScore: 90, wallRemediateMs: 1000 })),
    candidateRows: rows,
    focusRows: rows.map(item => item.id),
    gateJson: {
      passed: false,
      summary: {
        baselineP95WallMs: 1000,
        candidateP95WallMs: 200000,
        baselineAttemptCount: 10,
        candidateAttemptCount: 20,
        falsePositiveAppliedCount: 0,
      },
      gates: [{ key: 'runtime_p95_wall', passed: false }],
    },
    generatedAt: '2026-05-09T00:00:00.000Z',
  });
}

function classification(rows: RemediateBenchmarkRow[], id = rows[0]?.id ?? ''): RuntimeAttemptClassification {
  const found = reportFor(rows).rows.find(item => item.id === id);
  if (!found) throw new Error(`missing row ${id}`);
  return found.classification;
}

describe('runtime tail attempt diagnostic', () => {
  it('classifies hard timeout rows separately from slow successful rows', () => {
    expect(classification([
      row({ id: 'structure-4438', error: 'The operation was aborted due to timeout', afterScore: null, reanalyzedScore: null }),
    ])).toBe('parked_hard_timeout');
  });

  it('classifies final reanalysis drops as final reanalysis tail', () => {
    expect(classification([
      row({ id: 'long-4680', afterScore: 92, reanalyzedScore: 73, wallRemediateMs: 126000 }),
    ])).toBe('final_reanalysis_tail');
  });

  it('classifies low final scores as residual score debt rather than runtime fix candidates', () => {
    expect(classification([
      row({ id: 'font-4057', afterScore: 69, reanalyzedScore: 69, wallRemediateMs: 64000 }),
    ])).toBe('residual_score_debt_not_runtime_fix');
  });

  it('detects optional post-pass churn before generic quality tradeoff', () => {
    expect(classification([
      row({
        id: 'post-pass',
        afterScore: 91,
        reanalyzedScore: 91,
        wallRemediateMs: 120000,
        appliedTools: [
          tool({ toolName: 'set_pdfua_identification', outcome: 'rejected', source: 'post_pass' }),
          tool({ toolName: 'remap_orphan_mcids_as_artifacts', outcome: 'rejected', source: 'post_pass' }),
          tool({ toolName: 'embed_local_font_substitutes', outcome: 'rejected', source: 'post_pass' }),
        ],
      }),
    ])).toBe('optional_postpass_churn');
  });

  it('detects repeated no-gain churn when the same tool repeats without movement', () => {
    expect(classification([
      row({
        id: 'churn',
        afterScore: 85,
        reanalyzedScore: 85,
        wallRemediateMs: 90000,
        appliedTools: [
          tool({ toolName: 'repair_native_link_structure', outcome: 'no_effect' }),
          tool({ toolName: 'repair_native_link_structure', outcome: 'no_effect' }),
        ],
      }),
    ])).toBe('repeated_no_gain_churn');
  });

  it('classifies slow successful high-quality rows as quality/runtime tradeoffs', () => {
    expect(classification([
      row({ id: 'long-4683', afterScore: 91, reanalyzedScore: 91, wallRemediateMs: 240000 }),
    ])).toBe('quality_gain_runtime_tradeoff');
  });

  it('summarizes gate failures and deterministic class counts', () => {
    const report = reportFor([
      row({ id: 'structure-4438', error: 'timeout', afterScore: null, reanalyzedScore: null }),
      row({ id: 'font-4057', afterScore: 69, reanalyzedScore: 69 }),
    ]);
    expect(report.gateSummary.failedGates).toEqual(['runtime_p95_wall']);
    expect(report.summary.classificationCounts).toEqual([
      { key: 'parked_hard_timeout', count: 1 },
      { key: 'residual_score_debt_not_runtime_fix', count: 1 },
    ]);
  });
});
