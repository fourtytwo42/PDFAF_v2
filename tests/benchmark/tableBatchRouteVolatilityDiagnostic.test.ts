import { describe, expect, it } from 'vitest';
import {
  buildTableBatchRouteVolatilityDiagnostic,
  classifyTableBatchRouteBlocker,
} from '../../scripts/table-batch-route-volatility-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function tool(input: {
  toolName: string;
  outcome: string;
  scoreAfter: number;
  state?: string;
  note?: string;
}) {
  return {
    toolName: input.toolName,
    stage: 1,
    round: 1,
    scoreBefore: 40,
    scoreAfter: input.scoreAfter,
    delta: input.scoreAfter - 40,
    outcome: input.outcome,
    details: JSON.stringify({
      note: input.note,
      debug: {
        replayState: {
          stateSignatureBefore: input.state,
          stateSignatureAfter: `${input.state ?? 'state'}-after`,
          categoryScoresBefore: { link_quality: 40 },
          categoryScoresAfter: { link_quality: input.scoreAfter },
        },
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
  } as RemediateBenchmarkRow;
}

describe('table batch route volatility diagnostic', () => {
  it('classifies same-state outcome drift as a guard candidate', () => {
    const goodRow = row({
      id: 'fixture-inaccessible',
      afterScore: 97,
      appliedTools: [
        tool({ toolName: 'mark_untagged_content_as_artifact', outcome: 'rejected', scoreAfter: 79, state: 'same' }),
        tool({ toolName: 'repair_native_link_structure', outcome: 'applied', scoreAfter: 97, state: 'link' }),
      ],
    });
    const badRow = row({
      id: 'fixture-inaccessible',
      afterScore: 79,
      appliedTools: [
        tool({ toolName: 'mark_untagged_content_as_artifact', outcome: 'applied', scoreAfter: 79, state: 'same' }),
      ],
    });

    expect(classifyTableBatchRouteBlocker({ rowId: 'fixture-inaccessible', goodRow, badRow })).toMatchObject({
      classification: 'same_state_guard_candidate',
      firstDivergence: { classification: 'same_state_outcome_drift' },
    });
  });

  it('classifies upstream route volatility separately from same-state drift', () => {
    const goodRow = row({
      id: 'figure-4754',
      afterScore: 78,
      appliedTools: [tool({ toolName: 'set_document_language', outcome: 'applied', scoreAfter: 67, state: 'left' })],
    });
    const badRow = row({
      id: 'figure-4754',
      afterScore: 67,
      appliedTools: [tool({ toolName: 'set_document_language', outcome: 'applied', scoreAfter: 67, state: 'right' })],
    });

    expect(classifyTableBatchRouteBlocker({ rowId: 'figure-4754', goodRow, badRow })).toMatchObject({
      classification: 'upstream_route_volatility',
      firstDivergence: { classification: 'upstream_state_drift' },
    });
  });

  it('classifies PAC-blocked useful repair rows when later link recovery is blocked', () => {
    const goodRow = row({
      id: 'fixture-inaccessible',
      afterScore: 97,
      appliedTools: [
        tool({ toolName: 'bootstrap_struct_tree', outcome: 'applied', scoreAfter: 79, state: 'a' }),
        tool({ toolName: 'repair_native_link_structure', outcome: 'applied', scoreAfter: 97, state: 'b' }),
      ],
    });
    const badRow = row({
      id: 'fixture-inaccessible',
      afterScore: 79,
      appliedTools: [
        tool({ toolName: 'bootstrap_struct_tree', outcome: 'applied', scoreAfter: 79, state: 'a' }),
        tool({
          toolName: 'repair_native_link_structure',
          outcome: 'rejected',
          scoreAfter: 79,
          state: 'b',
          note: 'pac_rule_regressed(pdfua.content.orphan_mcids_absent)',
        }),
      ],
    });

    expect(classifyTableBatchRouteBlocker({ rowId: 'fixture-inaccessible', goodRow, badRow })).toMatchObject({
      classification: 'same_state_guard_candidate',
      laterLinkRecoveryBlocked: true,
      pacRejectionCount: 1,
    });
  });

  it('builds deterministic summaries', () => {
    const diagnostic = buildTableBatchRouteVolatilityDiagnostic({
      goodRun: 'good',
      badRun: 'bad',
      rowIds: ['fixture-inaccessible', 'figure-4754'],
      generatedAt: '2026-05-08T00:00:00.000Z',
      goodRows: [
        row({
          id: 'fixture-inaccessible',
          afterScore: 97,
          appliedTools: [tool({ toolName: 'repair_native_link_structure', outcome: 'applied', scoreAfter: 97, state: 'same' })],
        }),
        row({
          id: 'figure-4754',
          afterScore: 78,
          appliedTools: [tool({ toolName: 'set_document_language', outcome: 'applied', scoreAfter: 67, state: 'left' })],
        }),
      ],
      badRows: [
        row({
          id: 'fixture-inaccessible',
          afterScore: 79,
          appliedTools: [tool({ toolName: 'repair_native_link_structure', outcome: 'rejected', scoreAfter: 79, state: 'same' })],
        }),
        row({
          id: 'figure-4754',
          afterScore: 67,
          appliedTools: [tool({ toolName: 'set_document_language', outcome: 'applied', scoreAfter: 67, state: 'right' })],
        }),
      ],
    });

    expect(diagnostic.summary).toEqual({
      sameStateGuardCandidates: ['fixture-inaccessible'],
      upstreamVolatilityRows: ['figure-4754'],
      pacBlockedUsefulRepairRows: [],
      parkedRows: [],
    });
  });
});
