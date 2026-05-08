import { describe, expect, it } from 'vitest';
import {
  buildProtectedRegressionRuntimeSplitDiagnostic,
} from '../../scripts/protected-regression-runtime-split-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';
import type { CategoryKey } from '../../src/types.js';

function tool(input: {
  toolName: string;
  outcome: string;
  scoreBefore?: number;
  scoreAfter: number;
  state?: string;
  note?: string;
  pacRuleId?: string;
}) {
  const details: Record<string, unknown> = {
    note: input.note,
    debug: {
      replayState: {
        stateSignatureBefore: input.state,
        stateSignatureAfter: `${input.state ?? 'state'}-after`,
        scoreBefore: input.scoreBefore ?? 40,
        scoreAfter: input.scoreAfter,
        categoryScoresBefore: { heading_structure: input.scoreBefore ?? 40 },
        categoryScoresAfter: { heading_structure: input.scoreAfter },
      },
    },
  };
  if (input.pacRuleId) {
    details.note = `pac_rule_regressed(${input.pacRuleId})`;
    details.pacRuleRegression = { ruleId: input.pacRuleId };
  }
  return {
    toolName: input.toolName,
    stage: 1,
    round: 1,
    scoreBefore: input.scoreBefore ?? 40,
    scoreAfter: input.scoreAfter,
    delta: input.scoreAfter - (input.scoreBefore ?? 40),
    outcome: input.outcome,
    details: JSON.stringify(details),
    source: 'planner',
  } as RemediateBenchmarkRow['appliedTools'][number];
}

function category(key: CategoryKey, score: number) {
  return {
    key,
    score,
    weight: 1,
    applicable: true,
    severity: score >= 90 ? 'pass' : 'critical',
    findings: [],
    evidence: 'verified',
    verificationLevel: 'verified',
    manualReviewRequired: false,
    manualReviewReasons: [],
    countsTowardGrade: true,
    diagnosticOnly: false,
    measurementStatus: 'measured',
  };
}

function row(input: Partial<RemediateBenchmarkRow> & { id: string }): RemediateBenchmarkRow {
  const afterScore = input.afterScore === undefined ? 90 : input.afterScore;
  const reanalyzedScore = input.reanalyzedScore === undefined
    ? afterScore
    : input.reanalyzedScore;
  return {
    id: input.id,
    file: `${input.id}.pdf`,
    cohort: 'test',
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: input.beforeScore ?? 40,
    beforeGrade: 'F',
    beforePdfClass: 'native_untagged',
    afterScore,
    afterGrade: input.afterGrade ?? 'A',
    afterPdfClass: 'native_tagged',
    reanalyzedScore,
    reanalyzedGrade: input.reanalyzedGrade ?? input.afterGrade ?? 'A',
    reanalyzedPdfClass: null,
    delta: input.delta ?? null,
    appliedTools: input.appliedTools ?? [],
    rounds: [],
    analysisBeforeMs: 1,
    remediationDurationMs: 1,
    wallRemediateMs: input.wallRemediateMs ?? 1,
    analysisAfterMs: 1,
    totalPipelineMs: input.totalPipelineMs ?? input.wallRemediateMs ?? 1,
    afterCategories: input.afterCategories ?? [
      category('heading_structure', afterScore ?? 90),
      category('reading_order', afterScore ?? 90),
      category('title_language', afterScore ?? 90),
    ],
    reanalyzedCategories: input.reanalyzedCategories ?? input.afterCategories ?? [
      category('heading_structure', reanalyzedScore ?? afterScore ?? 90),
      category('reading_order', reanalyzedScore ?? afterScore ?? 90),
      category('title_language', reanalyzedScore ?? afterScore ?? 90),
    ],
    error: input.error,
  } as RemediateBenchmarkRow;
}

function diagnostic(input: {
  stage42Rows: RemediateBenchmarkRow[];
  strictRows?: RemediateBenchmarkRow[];
  currentRows: RemediateBenchmarkRow[];
  gate?: Record<string, unknown>;
  regressionRows?: string[];
  runtimeRows?: string[];
}) {
  return buildProtectedRegressionRuntimeSplitDiagnostic({
    generatedAt: '2026-05-08T00:00:00.000Z',
    stage42Run: 'stage42',
    strictRun: 'strict',
    currentRun: 'current',
    stage42Rows: input.stage42Rows,
    strictRows: input.strictRows ?? input.stage42Rows,
    currentRows: input.currentRows,
    gate: input.gate ?? null,
    regressionRows: input.regressionRows,
    runtimeRows: input.runtimeRows,
  });
}

describe('protected regression/runtime split diagnostic', () => {
  it('classifies font-3448 style protected regression as route volatility with category deltas', () => {
    const report = diagnostic({
      regressionRows: ['font-3448'],
      runtimeRows: [],
      stage42Rows: [row({
        id: 'font-3448',
        afterScore: 86,
        reanalyzedScore: 86,
        appliedTools: [tool({ toolName: 'post_pass_bookmarks', outcome: 'applied', scoreAfter: 86, state: 'good' })],
        reanalyzedCategories: [category('heading_structure', 98), category('reading_order', 100)],
      })],
      currentRows: [row({
        id: 'font-3448',
        afterScore: 51,
        reanalyzedScore: 51,
        appliedTools: [tool({ toolName: 'post_pass_bookmarks', outcome: 'applied', scoreAfter: 51, state: 'bad' })],
        reanalyzedCategories: [category('heading_structure', 0), category('reading_order', 30)],
      })],
    });

    expect(report.protectedRegressions[0]).toMatchObject({
      rowId: 'font-3448',
      classification: 'route_volatility',
      currentScore: 51,
      currentReanalyzedScore: 51,
      firstStage42ToCurrentDivergence: { classification: 'upstream_state_drift' },
    });
    expect(report.protectedRegressions[0].categoryDeltas[0]).toMatchObject({
      key: 'heading_structure',
      deltaFromStage42: -98,
    });
  });

  it('classifies long-4680 style in-run recovery followed by reanalysis drop', () => {
    const report = diagnostic({
      regressionRows: ['long-4680'],
      runtimeRows: [],
      stage42Rows: [row({ id: 'long-4680', afterScore: 65, reanalyzedScore: 65 })],
      currentRows: [row({
        id: 'long-4680',
        afterScore: 80,
        reanalyzedScore: 59,
        appliedTools: [tool({ toolName: 'set_document_title', outcome: 'rejected', scoreBefore: 80, scoreAfter: 80, state: 'same', note: 'post_pass_regressed_score(59)' })],
      })],
    });

    expect(report.protectedRegressions[0]).toMatchObject({
      classification: 'final_reanalysis_drift',
      currentFinalReanalysisDrop: 21,
    });
  });

  it('captures PAC-blocked tools in protected rows', () => {
    const report = diagnostic({
      regressionRows: ['font-3448'],
      runtimeRows: [],
      stage42Rows: [row({ id: 'font-3448', afterScore: 86 })],
      currentRows: [row({
        id: 'font-3448',
        afterScore: 51,
        appliedTools: [
          tool({
            toolName: 'repair_structure_conformance',
            outcome: 'rejected',
            scoreAfter: 51,
            state: 's',
            pacRuleId: 'pdfua.structure.parent_links_valid',
          }),
        ],
      })],
    });

    expect(report.protectedRegressions[0].pacRejections).toEqual([
      expect.objectContaining({
        toolName: 'repair_structure_conformance',
        ruleIds: ['pdfua.structure.parent_links_valid'],
      }),
    ]);
  });

  it('groups hard timeouts and long successful recovery runtime rows', () => {
    const report = diagnostic({
      regressionRows: [],
      runtimeRows: ['structure-4438', 'long-4683'],
      stage42Rows: [],
      currentRows: [
        row({ id: 'structure-4438', afterScore: null, reanalyzedScore: null, error: 'The operation was aborted due to timeout', wallRemediateMs: 300_000 }),
        row({ id: 'long-4683', afterScore: 92, reanalyzedScore: 92, wallRemediateMs: 250_000, appliedTools: [tool({ toolName: 'set_document_title', outcome: 'applied', scoreAfter: 92 })] }),
      ],
      gate: {
        summary: { candidateMean: 90.4, candidateP95WallMs: 246_000, candidateAttemptCount: 912, falsePositiveAppliedCount: 0 },
        topRuntimeRegressions: [
          { id: 'long-4683', deltaMs: 267_000 },
          { id: 'structure-4438', deltaMs: 200_000 },
        ],
      },
    });

    expect(report.runtimeTail.map(row => [row.rowId, row.classification])).toEqual([
      ['structure-4438', 'hard_timeout'],
      ['long-4683', 'long_successful_recovery'],
    ]);
    expect(report.summary.runtimeTailClassifications).toMatchObject({
      hard_timeout: 1,
      long_successful_recovery: 1,
    });
  });

  it('classifies repeated rejected/no-effect churn separately', () => {
    const report = diagnostic({
      regressionRows: [],
      runtimeRows: ['row-a'],
      stage42Rows: [],
      currentRows: [
        row({
          id: 'row-a',
          afterScore: 82,
          reanalyzedScore: 82,
          wallRemediateMs: 121_000,
          appliedTools: Array.from({ length: 7 }, (_, index) => tool({ toolName: `tool_${index}`, outcome: 'rejected', scoreAfter: 82, state: `${index}` })),
        }),
      ],
    });

    expect(report.runtimeTail[0]).toMatchObject({
      classification: 'repeated_no_gain_or_rejected_churn',
      rejectedOrNoEffectCount: 7,
    });
  });

  it('handles missing rows without crashing', () => {
    const report = diagnostic({
      regressionRows: ['missing-row'],
      runtimeRows: ['missing-runtime'],
      stage42Rows: [],
      currentRows: [],
    });

    expect(report.protectedRegressions[0]).toMatchObject({
      rowId: 'missing-row',
      classification: 'missing_evidence',
    });
    expect(report.runtimeTail[0]).toMatchObject({
      rowId: 'missing-runtime',
      classification: 'runtime_observation',
    });
  });
});
