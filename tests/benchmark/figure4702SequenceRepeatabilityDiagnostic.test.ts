import { describe, expect, it } from 'vitest';
import { buildFigure4702SequenceRepeatabilityDiagnostic } from '../../scripts/figure4702-sequence-repeatability-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function tool(input: {
  toolName: string;
  outcome: string;
  scoreBefore?: number;
  scoreAfter: number;
  state?: string;
  note?: string;
  tableBefore?: number;
  tableAfter?: number;
  tdBefore?: number;
  tdAfter?: number;
  pacRuleId?: string;
}) {
  const details: Record<string, unknown> = {
    outcome: input.outcome,
    note: input.note,
    debug: {
      replayState: {
        stateSignatureBefore: input.state,
        stateSignatureAfter: `${input.state ?? 'state'}-after`,
        scoreBefore: input.scoreBefore ?? 79,
        scoreAfter: input.scoreAfter,
        categoryScoresBefore: {
          heading_structure: 0,
          table_markup: 79,
        },
        categoryScoresAfter: {
          heading_structure: input.note === 'structure_annotation_sequence_recovered' ? 94 : 0,
          table_markup: 79,
        },
      },
    },
  };
  if (input.tableBefore != null || input.tableAfter != null || input.tdBefore != null || input.tdAfter != null) {
    details.invariants = {
      headerAssociationMissingCountBefore: input.tableBefore,
      headerAssociationMissingCountAfter: input.tableAfter,
      dataCellsWithoutHeaderCountBefore: input.tdBefore,
      dataCellsWithoutHeaderCountAfter: input.tdAfter,
    };
  }
  if (input.pacRuleId) {
    details.note = `pac_rule_regressed(${input.pacRuleId})`;
    details.pacRuleRegression = {
      ruleId: input.pacRuleId,
      category: 'pdf_ua_compliance',
      beforeStatus: 'pass',
      afterStatus: 'fail',
      beforeCount: 0,
      afterCount: 1,
    };
  }
  return {
    toolName: input.toolName,
    stage: 1,
    round: 1,
    scoreBefore: input.scoreBefore ?? 79,
    scoreAfter: input.scoreAfter,
    delta: input.scoreAfter - (input.scoreBefore ?? 79),
    outcome: input.outcome,
    details: JSON.stringify(details),
    source: 'planner',
  } as RemediateBenchmarkRow['appliedTools'][number];
}

function row(input: Partial<RemediateBenchmarkRow> & { id: string }): RemediateBenchmarkRow {
  return {
    id: input.id,
    file: `${input.id}.pdf`,
    cohort: 'test',
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: 40,
    beforeGrade: 'F',
    beforePdfClass: 'native_untagged',
    afterScore: input.afterScore ?? 91,
    afterGrade: input.afterGrade ?? 'A',
    afterPdfClass: 'native_tagged',
    reanalyzedScore: input.reanalyzedScore ?? input.afterScore ?? 91,
    reanalyzedGrade: input.reanalyzedGrade ?? input.afterGrade ?? 'A',
    reanalyzedPdfClass: null,
    delta: input.delta ?? null,
    appliedTools: input.appliedTools ?? [],
    rounds: [],
    analysisBeforeMs: 1,
    remediationDurationMs: 1,
    wallRemediateMs: 1,
    analysisAfterMs: 1,
    totalPipelineMs: 1,
    afterScoreCapsApplied: input.afterScoreCapsApplied ?? [],
    reanalyzedScoreCapsApplied: input.reanalyzedScoreCapsApplied ?? input.afterScoreCapsApplied ?? [],
    remediationOutcomeSummary: input.remediationOutcomeSummary,
    error: input.error,
  } as RemediateBenchmarkRow;
}

function report(rowsByRun: RemediateBenchmarkRow[][], rowIds: string[]) {
  return buildFigure4702SequenceRepeatabilityDiagnostic({
    generatedAt: '2026-05-08T00:00:00.000Z',
    runDirs: rowsByRun.map((_, index) => `r${index + 1}`),
    rowIds,
    runs: rowsByRun.map((rows, index) => ({ runDir: `r${index + 1}`, rows })),
  });
}

describe('figure-4702 sequence repeatability diagnostic', () => {
  it('classifies repeated figure-4702 sequence recovery as stable', () => {
    const runs = [1, 2, 3].map(() => [
      row({
        id: 'figure-4702',
        afterScore: 91,
        reanalyzedScore: 91,
        appliedTools: [
          tool({
            toolName: 'synthesize_basic_structure_from_layout',
            outcome: 'applied',
            scoreBefore: 48,
            scoreAfter: 82,
            state: 'sequence',
            note: 'structure_annotation_sequence_recovered',
          }),
        ],
      }),
      row({ id: 'font-4035', afterScore: 99 }),
    ]);

    const built = report(runs, ['figure-4702', 'font-4035']);

    expect(built.rows.find(row => row.rowId === 'figure-4702')).toMatchObject({
      classification: 'sequence_stable',
      sequenceRecoveredCount: 3,
      reanalyzedScoreRange: { min: 91, max: 91 },
    });
    expect(built.summary.fixed50Allowed).toBe(true);
  });

  it('classifies structure-3775 and long-4516 as parked route volatility only for known parked rows', () => {
    const runs = [
      [
        row({ id: 'structure-3775', afterScore: 97, afterGrade: 'A', appliedTools: [tool({ toolName: 'repair_alt_text_structure', outcome: 'applied', scoreAfter: 97, state: 'a' })] }),
        row({ id: 'long-4516', afterScore: 96, afterGrade: 'A', appliedTools: [tool({ toolName: 'set_pdfua_identification', outcome: 'applied', scoreAfter: 96, state: 'x' })] }),
      ],
      [
        row({ id: 'structure-3775', afterScore: 79, afterGrade: 'C', appliedTools: [tool({ toolName: 'repair_alt_text_structure', outcome: 'no_effect', scoreAfter: 79, state: 'b' })] }),
        row({ id: 'long-4516', afterScore: 84, afterGrade: 'B', appliedTools: [tool({ toolName: 'set_pdfua_identification', outcome: 'applied', scoreAfter: 84, state: 'y' })] }),
      ],
    ];

    const built = report(runs, ['structure-3775', 'long-4516']);

    expect(built.rows.map(row => [row.rowId, row.classification])).toEqual([
      ['structure-3775', 'parked_route_volatility'],
      ['long-4516', 'parked_route_volatility'],
    ]);
  });

  it('classifies structure-4438 hard timeout as parked runtime debt', () => {
    const built = report([
      [row({ id: 'structure-4438', afterScore: null, reanalyzedScore: null, error: 'The operation was aborted due to timeout' })],
      [row({ id: 'structure-4438', afterScore: null, reanalyzedScore: null, error: 'The operation was aborted due to timeout' })],
    ], ['structure-4438']);

    expect(built.rows[0]).toMatchObject({
      classification: 'parked_runtime_debt',
      hardTimeoutCount: 2,
    });
  });

  it('tracks table observations for long-4700 and font-4699', () => {
    const runs = [1, 2].map(() => [
      row({
        id: 'long-4700',
        afterScore: 78,
        afterGrade: 'C',
        appliedTools: [
          tool({
            toolName: 'set_table_header_cells',
            outcome: 'applied',
            scoreBefore: 59,
            scoreAfter: 78,
            state: 'table',
            tableBefore: 10,
            tableAfter: 2,
            tdBefore: 220,
            tdAfter: 17,
          }),
        ],
      }),
      row({ id: 'font-4699', afterScore: 91, afterGrade: 'A' }),
    ]);

    const built = report(runs, ['long-4700', 'font-4699']);

    expect(built.rows.find(row => row.rowId === 'long-4700')).toMatchObject({
      classification: 'table_observation_stable',
      tableAssociationImprovedCount: 2,
    });
    expect(built.rows.find(row => row.rowId === 'font-4699')).toMatchObject({
      classification: 'table_observation_stable',
    });
  });

  it('blocks acceptance when false-positive-applied appears', () => {
    const built = report([
      [
        row({
          id: 'figure-4702',
          afterScore: 91,
          appliedTools: [tool({ toolName: 'synthesize_basic_structure_from_layout', outcome: 'applied', scoreBefore: 48, scoreAfter: 82, state: 'seq', note: 'structure_annotation_sequence_recovered' })],
        }),
        row({
          id: 'font-4035',
          afterScore: 99,
          remediationOutcomeSummary: { falsePositiveApplied: true },
        }),
      ],
      [
        row({
          id: 'figure-4702',
          afterScore: 91,
          appliedTools: [tool({ toolName: 'synthesize_basic_structure_from_layout', outcome: 'applied', scoreBefore: 48, scoreAfter: 82, state: 'seq', note: 'structure_annotation_sequence_recovered' })],
        }),
        row({ id: 'font-4035', afterScore: 99 }),
      ],
    ], ['figure-4702', 'font-4035']);

    expect(built.summary).toMatchObject({
      decision: 'blocked_by_false_positive',
      fixed50Allowed: false,
      falsePositiveAppliedRows: ['font-4035'],
    });
  });

  it('handles missing row data deterministically', () => {
    const built = report([
      [],
      [row({ id: 'figure-4702', afterScore: 91, appliedTools: [tool({ toolName: 'synthesize_basic_structure_from_layout', outcome: 'applied', scoreBefore: 48, scoreAfter: 82, state: 'seq', note: 'structure_annotation_sequence_recovered' })] })],
    ], ['figure-4702']);

    expect(built.rows[0]).toMatchObject({
      rowId: 'figure-4702',
      classification: 'needs_behavior_diagnostic',
    });
    expect(built.summary.decision).toBe('blocked_by_sequence_instability');
  });
});
