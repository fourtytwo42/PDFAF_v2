import { describe, expect, it } from 'vitest';
import { buildTableBatchAcceptanceDiagnostic } from '../../scripts/table-batch-acceptance-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function tool(input: {
  toolName: string;
  outcome?: string;
  tableBefore?: number;
  tableAfter?: number;
  tdBefore?: number;
  tdAfter?: number;
  tableTreeValidAfter?: boolean;
}) {
  return {
    toolName: input.toolName,
    stage: 1,
    round: 1,
    scoreBefore: 70,
    scoreAfter: 78,
    delta: 8,
    outcome: input.outcome ?? 'applied',
    details: JSON.stringify({
      outcome: input.outcome ?? 'applied',
      invariants: {
        headerAssociationMissingCountBefore: input.tableBefore,
        headerAssociationMissingCountAfter: input.tableAfter,
        dataCellsWithoutHeaderCountBefore: input.tdBefore,
        dataCellsWithoutHeaderCountAfter: input.tdAfter,
        tableTreeValidAfter: input.tableTreeValidAfter,
        ownershipPreserved: true,
      },
    }),
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
    afterScore: input.afterScore ?? 90,
    afterGrade: input.afterGrade ?? 'A',
    afterPdfClass: 'native_tagged',
    reanalyzedScore: input.reanalyzedScore ?? input.afterScore ?? 90,
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
    error: input.error,
  } as RemediateBenchmarkRow;
}

function report(input: {
  baselineRows: RemediateBenchmarkRow[];
  candidateRows: RemediateBenchmarkRow[];
}) {
  return buildTableBatchAcceptanceDiagnostic({
    baselineRun: 'baseline',
    candidateRun: 'candidate',
    generatedAt: '2026-05-08T00:00:00.000Z',
    baselineRows: input.baselineRows,
    candidateRows: input.candidateRows,
  });
}

describe('table batch acceptance diagnostic', () => {
  it('excludes parked route rows from non-parked blocker counts', () => {
    const diagnostic = report({
      baselineRows: [row({ id: 'fixture-inaccessible', afterScore: 95, afterGrade: 'A' })],
      candidateRows: [row({ id: 'fixture-inaccessible', afterScore: 79, afterGrade: 'C' })],
    });

    expect(diagnostic.summary).toMatchObject({
      parkedDebtCount: 1,
      nonParkedRegressionCount: 0,
      decision: 'needs_more_evidence',
    });
    expect(diagnostic.rows[0]).toMatchObject({
      id: 'fixture-inaccessible',
      classification: 'parked_debt',
    });
  });

  it('blocks acceptance on non-parked control regressions', () => {
    const diagnostic = report({
      baselineRows: [row({ id: 'font-4035', afterScore: 99, afterGrade: 'A' })],
      candidateRows: [row({ id: 'font-4035', afterScore: 80, afterGrade: 'B' })],
    });

    expect(diagnostic.summary).toMatchObject({
      nonParkedRegressionCount: 1,
      decision: 'blocked_by_non_parked_regression',
    });
  });

  it('summarizes stable long-4700 table debt reduction deterministically', () => {
    const diagnostic = report({
      baselineRows: [row({ id: 'long-4700', afterScore: 78, afterGrade: 'C' })],
      candidateRows: [row({
        id: 'long-4700',
        afterScore: 78,
        afterGrade: 'C',
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
            tableBefore: 10,
            tableAfter: 2,
            tdBefore: 220,
            tdAfter: 17,
          }),
        ],
      })],
    });

    expect(diagnostic.summary).toMatchObject({
      tableObservationCount: 1,
      tableImprovementCount: 1,
      decision: 'accept_table_batch_with_parked_debt',
    });
    expect(diagnostic.rows[0]).toMatchObject({
      id: 'long-4700',
      classification: 'table_observation',
      tableHeaderAssociationBefore: 10,
      tableHeaderAssociationAfter: 2,
      dataCellsWithoutHeaderBefore: 220,
      dataCellsWithoutHeaderAfter: 17,
      tableCapCount: 1,
    });
  });

  it('keeps font-4699 A-grade preservation as a table observation', () => {
    const diagnostic = report({
      baselineRows: [row({ id: 'font-4699', afterScore: 91, afterGrade: 'A' })],
      candidateRows: [row({
        id: 'font-4699',
        afterScore: 91,
        afterGrade: 'A',
        appliedTools: [
          tool({
            toolName: 'set_table_header_cells',
            tableBefore: 1,
            tableAfter: 0,
            tdBefore: 6,
            tdAfter: 0,
          }),
        ],
      })],
    });

    expect(diagnostic.rows[0]).toMatchObject({
      id: 'font-4699',
      classification: 'table_observation',
      candidateGrade: 'A',
      tableAssociationImproved: true,
    });
  });

  it('blocks on false-positive applied evidence', () => {
    const diagnostic = report({
      baselineRows: [row({ id: 'long-4700', afterScore: 78, afterGrade: 'C' })],
      candidateRows: [row({
        id: 'long-4700',
        afterScore: 78,
        afterGrade: 'C',
        appliedTools: [
          tool({
            toolName: 'set_table_header_cells',
            tableBefore: 10,
            tableAfter: 2,
            tdBefore: 220,
            tdAfter: 17,
            tableTreeValidAfter: false,
          }),
        ],
      })],
    });

    expect(diagnostic.summary).toMatchObject({
      falsePositiveAppliedCount: 1,
      decision: 'blocked_by_false_positive',
    });
  });
});
