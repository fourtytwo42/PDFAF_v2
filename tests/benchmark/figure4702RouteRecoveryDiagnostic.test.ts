import { describe, expect, it } from 'vitest';
import {
  buildFigure4702RouteDiagnostic,
} from '../../scripts/figure4702-route-recovery-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function tool(input: {
  toolName: string;
  outcome: string;
  scoreBefore: number;
  scoreAfter: number;
  state?: string;
  note?: string;
  pacRuleIds?: string[];
  headingAfter?: number;
}) {
  const pacRuleRegressions = (input.pacRuleIds ?? []).map(ruleId => ({
    ruleId,
    category: 'pdf_ua_compliance',
    beforeStatus: 'pass',
    afterStatus: 'fail',
    beforeCount: 0,
    afterCount: 1,
    beforeMessage: 'before',
    afterMessage: 'after',
  }));
  return {
    toolName: input.toolName,
    stage: 1,
    round: 1,
    scoreBefore: input.scoreBefore,
    scoreAfter: input.scoreAfter,
    delta: input.scoreAfter - input.scoreBefore,
    outcome: input.outcome,
    details: JSON.stringify({
      outcome: input.outcome,
      note: input.note ?? (input.pacRuleIds?.[0] ? `pac_rule_regressed(${input.pacRuleIds[0]})` : undefined),
      pacRuleRegression: pacRuleRegressions[0],
      pacRuleRegressions,
      debug: {
        replayState: {
          stateSignatureBefore: input.state,
          stateSignatureAfter: `${input.state ?? 'state'}-after`,
          scoreBefore: input.scoreBefore,
          scoreAfter: input.scoreAfter,
          categoryScoresBefore: { heading_structure: 0 },
          categoryScoresAfter: { heading_structure: input.headingAfter ?? 0 },
        },
      },
    }),
    source: 'planner',
  } as RemediateBenchmarkRow['appliedTools'][number];
}

function row(input: Partial<RemediateBenchmarkRow> & { id?: string }): RemediateBenchmarkRow {
  return {
    id: input.id ?? 'figure-4702',
    file: 'figure-4702.pdf',
    cohort: 'test',
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: 37,
    beforeGrade: 'F',
    beforePdfClass: 'native_untagged',
    afterScore: input.afterScore ?? 59,
    afterGrade: input.afterGrade ?? 'F',
    afterPdfClass: 'native_tagged',
    reanalyzedScore: input.reanalyzedScore ?? input.afterScore ?? 59,
    reanalyzedGrade: input.reanalyzedGrade ?? input.afterGrade ?? 'F',
    reanalyzedPdfClass: null,
    delta: null,
    appliedTools: input.appliedTools ?? [],
    rounds: [],
    analysisBeforeMs: 1,
    remediationDurationMs: 1,
    wallRemediateMs: 1,
    analysisAfterMs: 1,
    totalPipelineMs: 1,
  } as RemediateBenchmarkRow;
}

function diagnostic(input: {
  goodRow?: RemediateBenchmarkRow | null;
  strictRow?: RemediateBenchmarkRow | null;
  currentRow?: RemediateBenchmarkRow | null;
}) {
  return buildFigure4702RouteDiagnostic({
    rowId: 'figure-4702',
    goodRun: 'stage42',
    strictRun: 'strict',
    currentRun: 'current',
    generatedAt: '2026-05-08T00:00:00.000Z',
    ...input,
  });
}

describe('figure-4702 route recovery diagnostic', () => {
  it('classifies PAC-blocked score-moving structure recovery', () => {
    const goodRow = row({
      afterScore: 87,
      afterGrade: 'B',
      appliedTools: [
        tool({ toolName: 'synthesize_basic_structure_from_layout', outcome: 'applied', scoreBefore: 38, scoreAfter: 69, state: 'old', headingAfter: 94 }),
        tool({ toolName: 'set_document_title', outcome: 'applied', scoreBefore: 82, scoreAfter: 87, state: 'title', headingAfter: 94 }),
      ],
    });
    const currentRow = row({
      afterScore: 59,
      appliedTools: [
        tool({ toolName: 'synthesize_basic_structure_from_layout', outcome: 'rejected', scoreBefore: 48, scoreAfter: 77, state: 'blocked', headingAfter: 94, pacRuleIds: ['pdfua.annotations.tagged_annotations_present', 'pdfua.content.orphan_mcids_absent'] }),
      ],
    });

    expect(diagnostic({ goodRow, strictRow: currentRow, currentRow })).toMatchObject({
      classification: 'pac_blocked_structure_recovery_candidate',
      pacBlockedToolNames: ['synthesize_basic_structure_from_layout'],
      pacBlockedRuleIds: ['pdfua.annotations.tagged_annotations_present', 'pdfua.content.orphan_mcids_absent'],
      bestBlockedScoreAfter: 77,
      bestBlockedHeadingAfter: 94,
    });
  });

  it('detects missing scheduled tools separately from PAC blocking', () => {
    const goodRow = row({
      afterScore: 87,
      appliedTools: [
        tool({ toolName: 'synthesize_basic_structure_from_layout', outcome: 'applied', scoreBefore: 38, scoreAfter: 69, state: 'a' }),
        tool({ toolName: 'set_document_title', outcome: 'applied', scoreBefore: 82, scoreAfter: 87, state: 'b' }),
      ],
    });
    const currentRow = row({
      afterScore: 59,
      appliedTools: [
        tool({ toolName: 'set_document_language', outcome: 'applied', scoreBefore: 37, scoreAfter: 48, state: 'c' }),
      ],
    });

    expect(diagnostic({ goodRow, strictRow: currentRow, currentRow })).toMatchObject({
      classification: 'scheduling_or_admission_drift',
      missingGoodToolsInCurrent: ['set_document_title', 'synthesize_basic_structure_from_layout'],
    });
  });

  it('classifies same-state route drift', () => {
    const goodRow = row({
      afterScore: 87,
      appliedTools: [
        tool({ toolName: 'synthesize_basic_structure_from_layout', outcome: 'applied', scoreBefore: 38, scoreAfter: 69, state: 'same' }),
      ],
    });
    const currentRow = row({
      afterScore: 59,
      appliedTools: [
        tool({ toolName: 'synthesize_basic_structure_from_layout', outcome: 'rejected', scoreBefore: 38, scoreAfter: 38, state: 'same' }),
      ],
    });

    expect(diagnostic({ goodRow, strictRow: currentRow, currentRow })).toMatchObject({
      classification: 'same_state_route_drift',
      firstGoodToCurrentDivergence: { classification: 'same_state_outcome_drift' },
    });
  });

  it('handles missing evidence without crashing', () => {
    expect(diagnostic({ goodRow: null, strictRow: null, currentRow: null })).toMatchObject({
      classification: 'missing_evidence',
      goodScore: null,
      currentScore: null,
    });
  });
});
