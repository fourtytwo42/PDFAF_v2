import { describe, expect, it } from 'vitest';
import {
  buildProtectedFixed50RouteDiagnostic,
} from '../../scripts/protected-fixed50-route-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function tool(input: {
  toolName: string;
  outcome?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  state?: string;
  note?: string;
}) {
  return {
    toolName: input.toolName,
    stage: 1,
    round: 1,
    scoreBefore: input.scoreBefore ?? 50,
    scoreAfter: input.scoreAfter ?? 50,
    delta: (input.scoreAfter ?? 50) - (input.scoreBefore ?? 50),
    outcome: input.outcome ?? 'applied',
    source: 'planner',
    details: JSON.stringify({
      note: input.note,
      debug: {
        replayState: {
          stateSignatureBefore: input.state ?? 'state',
          scoreBefore: input.scoreBefore ?? 50,
          scoreAfter: input.scoreAfter ?? 50,
        },
      },
    }),
  } as RemediateBenchmarkRow['appliedTools'][number];
}

function row(input: Partial<RemediateBenchmarkRow> & { id: string }): RemediateBenchmarkRow {
  return {
    id: input.id,
    file: `${input.id}.pdf`,
    cohort: 'test',
    sourceType: 'original',
    intent: 'test',
    beforeScore: 40,
    beforeGrade: 'F',
    beforePdfClass: 'native_tagged',
    afterScore: 'afterScore' in input ? input.afterScore ?? null : 91,
    afterGrade: input.afterGrade ?? 'A',
    afterPdfClass: 'native_tagged',
    reanalyzedScore: 'reanalyzedScore' in input ? input.reanalyzedScore ?? null : ('afterScore' in input ? input.afterScore ?? null : 91),
    reanalyzedGrade: input.reanalyzedGrade ?? input.afterGrade ?? 'A',
    reanalyzedPdfClass: 'native_tagged',
    delta: null,
    appliedTools: input.appliedTools ?? [
      tool({ toolName: 'set_document_title', outcome: 'applied', scoreBefore: 50, scoreAfter: 91, state: 'a' }),
    ],
    rounds: [],
    analysisBeforeMs: 1,
    remediationDurationMs: 1,
    wallRemediateMs: input.wallRemediateMs ?? 1000,
    analysisAfterMs: 1,
    totalPipelineMs: 1,
    error: input.error,
  } as RemediateBenchmarkRow;
}

function report(input: {
  stage42?: RemediateBenchmarkRow[];
  reference?: RemediateBenchmarkRow[];
  protected?: RemediateBenchmarkRow[];
  rowIds?: string[];
}) {
  return buildProtectedFixed50RouteDiagnostic({
    generatedAt: '2026-05-09T00:00:00.000Z',
    referenceRun: 'reference',
    protectedRun: 'protected',
    stage42Run: 'stage42',
    stage42Rows: input.stage42 ?? [],
    referenceRows: input.reference ?? [],
    protectedRows: input.protected ?? [],
    rowIds: input.rowIds ?? ['row'],
  });
}

describe('protected fixed-50 route diagnostic', () => {
  it('classifies protected route volatility when a high reference row drops below B with a route divergence', () => {
    const diagnostic = report({
      rowIds: ['figure-4702'],
      stage42: [row({ id: 'figure-4702', afterScore: 87, reanalyzedScore: 87 })],
      reference: [row({ id: 'figure-4702', afterScore: 91, reanalyzedScore: 91, appliedTools: [tool({ toolName: 'repair_alt_text_structure', outcome: 'applied', scoreAfter: 91, state: 'good' })] })],
      protected: [row({ id: 'figure-4702', afterScore: 59, reanalyzedScore: 59, appliedTools: [tool({ toolName: 'repair_structure_conformance', outcome: 'rejected', scoreAfter: 59, state: 'bad', note: 'pac_rule_regressed(pdfua.annotations.tagged_annotations_present)' })] })],
    });

    expect(diagnostic.rows[0]).toMatchObject({
      rowId: 'figure-4702',
      classification: 'protected_route_volatility',
      referenceReanalyzedScore: 91,
      protectedReanalyzedScore: 59,
    });
    expect(diagnostic.rows[0].firstReferenceToProtectedDivergence?.classification).toBe('tool_order_drift');
    expect(diagnostic.rows[0].pacRejectedTools).toEqual(['repair_structure_conformance']);
  });

  it('classifies final reanalysis drops separately from route volatility', () => {
    const diagnostic = report({
      rowIds: ['long-4683'],
      stage42: [row({ id: 'long-4683', afterScore: 92, reanalyzedScore: 59 })],
      reference: [row({ id: 'long-4683', afterScore: 91, reanalyzedScore: 91 })],
      protected: [row({ id: 'long-4683', afterScore: 92, reanalyzedScore: 59 })],
    });

    expect(diagnostic.rows[0]).toMatchObject({
      classification: 'protected_final_reanalysis_drop',
      protectedFinalDrop: 33,
    });
  });

  it('does not block rows that remain B-or-better in the protected run', () => {
    const diagnostic = report({
      rowIds: ['long-4700'],
      reference: [row({ id: 'long-4700', afterScore: 86, reanalyzedScore: 86 })],
      protected: [row({ id: 'long-4700', afterScore: 82, reanalyzedScore: 82 })],
    });

    expect(diagnostic.rows[0].classification).toBe('stable_or_not_blocking');
  });

  it('classifies missing evidence deterministically', () => {
    expect(report({ rowIds: ['missing'] }).rows[0]).toMatchObject({
      rowId: 'missing',
      classification: 'missing_evidence',
      referenceScore: null,
      protectedScore: null,
    });
  });
});
