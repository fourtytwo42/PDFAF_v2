import { describe, expect, it } from 'vitest';
import { buildRouteRepeatabilityDiagnostic } from '../../scripts/route-repeatability-table-batch-diagnostic.js';
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
          link_quality: 73,
          table_markup: 79,
        },
        categoryScoresAfter: {
          link_quality: input.toolName === 'repair_native_link_structure' ? 100 : 73,
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
    afterScore: input.afterScore ?? 79,
    afterGrade: input.afterGrade ?? 'C',
    afterPdfClass: 'native_tagged',
    reanalyzedScore: input.reanalyzedScore ?? input.afterScore ?? 79,
    reanalyzedGrade: input.reanalyzedGrade ?? input.afterGrade ?? 'C',
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
  } as RemediateBenchmarkRow;
}

describe('route repeatability table batch diagnostic', () => {
  it('classifies stable same-state route drift as a guard candidate', () => {
    const report = buildRouteRepeatabilityDiagnostic({
      generatedAt: '2026-05-08T00:00:00.000Z',
      runDirs: ['r1', 'r2'],
      rowIds: ['fixture-inaccessible'],
      runs: [
        {
          runDir: 'r1',
          rows: [row({
            id: 'fixture-inaccessible',
            afterScore: 95,
            appliedTools: [
              tool({ toolName: 'mark_untagged_content_as_artifact', outcome: 'rejected', scoreAfter: 79, state: 'same' }),
              tool({ toolName: 'repair_native_link_structure', outcome: 'applied', scoreAfter: 95, state: 'link', note: 'pac_orphan_mcid_recovery(repair_native_link_structure)' }),
            ],
          })],
        },
        {
          runDir: 'r2',
          rows: [row({
            id: 'fixture-inaccessible',
            afterScore: 79,
            appliedTools: [
              tool({ toolName: 'mark_untagged_content_as_artifact', outcome: 'applied', scoreAfter: 79, state: 'same' }),
            ],
          })],
        },
      ],
    });

    expect(report.rows[0]).toMatchObject({
      rowId: 'fixture-inaccessible',
      classification: 'same_state_guard_candidate',
      stableSameStateBadRouteCount: 1,
      linkRepairAppliedCount: 1,
      linkRepairMissingCount: 1,
    });
  });

  it('classifies upstream route volatility separately from same-state drift', () => {
    const report = buildRouteRepeatabilityDiagnostic({
      generatedAt: '2026-05-08T00:00:00.000Z',
      runDirs: ['r1', 'r2'],
      rowIds: ['figure-4754'],
      runs: [
        {
          runDir: 'r1',
          rows: [row({
            id: 'figure-4754',
            afterScore: 78,
            appliedTools: [tool({ toolName: 'set_document_language', outcome: 'applied', scoreAfter: 78, state: 'left' })],
          })],
        },
        {
          runDir: 'r2',
          rows: [row({
            id: 'figure-4754',
            afterScore: 67,
            appliedTools: [tool({ toolName: 'set_document_language', outcome: 'applied', scoreAfter: 67, state: 'right' })],
          })],
        },
      ],
    });

    expect(report.rows[0]).toMatchObject({
      classification: 'upstream_route_volatility',
      upstreamDivergenceCount: 1,
    });
  });

  it('tracks stable table debt reduction as an observation, not a guard', () => {
    const report = buildRouteRepeatabilityDiagnostic({
      generatedAt: '2026-05-08T00:00:00.000Z',
      runDirs: ['r1', 'r2'],
      rowIds: ['long-4700'],
      runs: [
        {
          runDir: 'r1',
          rows: [row({
            id: 'long-4700',
            afterScore: 78,
            afterScoreCapsApplied: [{
              category: 'table_markup',
              cap: 79,
              rawScore: 100,
              finalScore: 79,
              reason: 'PAC rule failure: pdfua.table.header_association_present',
            }],
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
          })],
        },
        {
          runDir: 'r2',
          rows: [row({
            id: 'long-4700',
            afterScore: 78,
            appliedTools: [
              tool({
                toolName: 'set_table_header_cells',
                outcome: 'applied',
                scoreBefore: 59,
                scoreAfter: 78,
                state: 'table2',
                tableBefore: 10,
                tableAfter: 2,
                tdBefore: 220,
                tdAfter: 17,
              }),
            ],
          })],
        },
      ],
    });

    expect(report.rows[0]).toMatchObject({
      classification: 'table_batch_stable_observation',
      tableAssociationImprovedCount: 2,
    });
    expect(report.rows[0].observations[0]).toMatchObject({
      tableHeaderAssociationBefore: 10,
      tableHeaderAssociationAfter: 2,
      dataCellsWithoutHeaderBefore: 220,
      dataCellsWithoutHeaderAfter: 17,
      tableCapCount: 1,
    });
  });

  it('handles missing replay rows without crashing and parks them', () => {
    const report = buildRouteRepeatabilityDiagnostic({
      generatedAt: '2026-05-08T00:00:00.000Z',
      runDirs: ['r1', 'r2'],
      rowIds: ['font-4035'],
      runs: [
        { runDir: 'r1', rows: [] },
        { runDir: 'r2', rows: [row({ id: 'font-4035', afterScore: 99, afterGrade: 'A' })] },
      ],
    });

    expect(report.rows[0]).toMatchObject({
      classification: 'parked_no_safe_guard',
      falsePositiveAppliedCount: 0,
    });
  });
});
