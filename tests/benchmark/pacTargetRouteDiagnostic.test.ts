import { describe, expect, it } from 'vitest';
import {
  classifyFixtureRoute,
  classifyRowDrift,
  classifyStructureCheckpoint,
  firstTimelineDivergence,
  toolTimeline,
} from '../../scripts/pac-target-route-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function row(input: Partial<RemediateBenchmarkRow> & { id: string }): RemediateBenchmarkRow {
  return {
    id: input.id,
    file: input.file ?? `${input.id}.pdf`,
    cohort: input.cohort ?? 'test',
    sourceType: input.sourceType ?? 'fixture',
    intent: input.intent ?? 'test',
    beforeScore: input.beforeScore ?? 40,
    beforeGrade: input.beforeGrade ?? 'F',
    beforePdfClass: input.beforePdfClass ?? 'native_untagged',
    afterScore: input.afterScore ?? 79,
    afterGrade: input.afterGrade ?? 'C',
    afterPdfClass: input.afterPdfClass ?? 'native_tagged',
    reanalyzedScore: input.reanalyzedScore ?? null,
    reanalyzedGrade: input.reanalyzedGrade ?? null,
    reanalyzedPdfClass: input.reanalyzedPdfClass ?? null,
    delta: input.delta ?? null,
    appliedTools: input.appliedTools ?? [],
    rounds: input.rounds ?? [],
    analysisBeforeMs: input.analysisBeforeMs ?? 1000,
    remediationDurationMs: input.remediationDurationMs ?? 1000,
    wallRemediateMs: input.wallRemediateMs ?? 1000,
    analysisAfterMs: input.analysisAfterMs ?? 1000,
    totalPipelineMs: input.totalPipelineMs ?? 1000,
    error: input.error,
  } as RemediateBenchmarkRow;
}

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

describe('PAC target route diagnostic helpers', () => {
  it('builds tool timelines with replay state and PAC reasons', () => {
    const events = toolTimeline(row({
      id: 'fixture-inaccessible',
      appliedTools: [
        tool({
          toolName: 'repair_native_link_structure',
          outcome: 'rejected',
          scoreAfter: 79,
          state: 'abc',
          note: 'pac_rule_regressed(pdfua.content.orphan_mcids_absent)',
        }),
      ],
    }));

    expect(events[0]).toMatchObject({
      toolName: 'repair_native_link_structure',
      outcome: 'rejected',
      stateSignatureBefore: 'abc',
      pacReason: 'pac_rule_regressed(pdfua.content.orphan_mcids_absent)',
      categoryScoresAfter: { link_quality: 79 },
    });
  });

  it('identifies the first deterministic divergence', () => {
    const left = toolTimeline(row({
      id: 'good',
      appliedTools: [
        tool({ toolName: 'bootstrap_struct_tree', outcome: 'applied', scoreAfter: 79, state: 'same' }),
        tool({ toolName: 'repair_native_link_structure', outcome: 'applied', scoreAfter: 97, state: 'link' }),
      ],
    }));
    const right = toolTimeline(row({
      id: 'bad',
      appliedTools: [
        tool({ toolName: 'bootstrap_struct_tree', outcome: 'applied', scoreAfter: 79, state: 'same' }),
        tool({ toolName: 'repair_native_link_structure', outcome: 'rejected', scoreAfter: 79, state: 'link' }),
      ],
    }));

    expect(firstTimelineDivergence(left, right)).toMatchObject({
      index: 1,
      reason: 'tool_outcome_changed',
      left: { toolName: 'repair_native_link_structure', outcome: 'applied' },
      right: { toolName: 'repair_native_link_structure', outcome: 'rejected' },
    });
  });

  it('classifies fixture-inaccessible link repair route volatility', () => {
    const goodRow = row({
      id: 'fixture-inaccessible',
      afterScore: 97,
      appliedTools: [
        tool({ toolName: 'bootstrap_struct_tree', outcome: 'applied', scoreAfter: 79, state: 'same' }),
        tool({ toolName: 'repair_native_link_structure', outcome: 'applied', scoreAfter: 97, state: 'link' }),
      ],
    });
    const badRow = row({
      id: 'fixture-inaccessible',
      afterScore: 79,
      appliedTools: [
        tool({ toolName: 'bootstrap_struct_tree', outcome: 'applied', scoreAfter: 79, state: 'same' }),
        tool({ toolName: 'repair_native_link_structure', outcome: 'rejected', scoreAfter: 79, state: 'link' }),
      ],
    });

    expect(classifyFixtureRoute({ goodRow, badRow })).toMatchObject({
      classification: 'route_volatility',
      goodLinkRepairOutcome: 'applied',
      badLinkRepairOutcome: 'rejected',
      firstDivergence: { reason: 'tool_outcome_changed' },
    });
  });

  it('classifies structure-4438 as no eligible checkpoint when all candidates are below floor', () => {
    expect(classifyStructureCheckpoint({
      floor: 90,
      trace: {
        lastPhase: 'stage_reanalysis_start',
        elapsedMs: 300_000,
        lastStageNumber: 1,
        lastRound: 2,
        lastToolName: 'normalize_pdfua_catalog_settings',
        lastToolOutcome: 'applied',
        lastToolDurationMs: 307,
        lastStateSignatureBefore: 'state',
        lastRejectedOrNoEffectReason: 'no_structural_change',
        completedToolCount: 9,
        completedStageCount: 5,
        completedStageReanalysisCount: 4,
        completedStageReanalysisMs: 180_000,
        lastVerifiedCheckpointScore: 36,
        lastVerifiedCheckpointGrade: 'F',
        lastVerifiedCheckpointReason: 'stage_8',
        lastVerifiedCheckpointAppliedToolCount: 8,
        lastVerifiedCheckpointEligible: false,
        lastVerifiedCheckpointEligibilityReason: 'checkpoint_below_floor(36<90)',
        lastVerifiedCheckpointReturned: false,
        lastVerifiedCheckpointAgeMs: 66_000,
        verifiedCheckpointHistory: [
          {
            reason: 'stage_8',
            score: 36,
            grade: 'F',
            appliedToolCount: 8,
            eligible: false,
            eligibilityReason: 'checkpoint_below_floor(36<90)',
            returned: false,
            elapsedMs: 234_000,
          },
        ],
      },
    })).toMatchObject({
      classification: 'no_eligible_checkpoint_available',
      bestCheckpointScore: 36,
      bestEligibleScore: null,
      checkpointCount: 1,
    });
  });

  it('classifies structure-4076 route drift with first divergence details', () => {
    const goodRow = row({
      id: 'structure-4076',
      afterScore: 70,
      reanalyzedScore: 70,
      appliedTools: [
        tool({ toolName: 'normalize_annotation_tab_order', outcome: 'applied', scoreAfter: 62, state: 'a' }),
        tool({ toolName: 'set_document_language', outcome: 'applied', scoreAfter: 70, state: 'b' }),
      ],
    });
    const badRow = row({
      id: 'structure-4076',
      afterScore: 69,
      reanalyzedScore: 56,
      appliedTools: [
        tool({ toolName: 'normalize_annotation_tab_order', outcome: 'applied', scoreAfter: 62, state: 'a' }),
        tool({ toolName: 'set_document_language', outcome: 'rejected', scoreAfter: 62, state: 'b' }),
      ],
    });

    expect(classifyRowDrift({ rowId: 'structure-4076', goodRow, badRow })).toMatchObject({
      rowId: 'structure-4076',
      classification: 'route_drift',
      finalReanalysisDrop: 13,
      firstDivergence: {
        index: 1,
        reason: 'tool_outcome_changed',
        left: { toolName: 'set_document_language', outcome: 'applied' },
        right: { toolName: 'set_document_language', outcome: 'rejected' },
      },
    });
  });

  it('classifies final reanalysis drops without timeline divergence', () => {
    const tools = [tool({ toolName: 'set_document_language', outcome: 'applied', scoreAfter: 69, state: 'b' })];
    expect(classifyRowDrift({
      rowId: 'structure-4076',
      goodRow: row({ id: 'structure-4076', afterScore: 69, reanalyzedScore: 69, appliedTools: tools }),
      badRow: row({ id: 'structure-4076', afterScore: 69, reanalyzedScore: 56, appliedTools: tools }),
    })).toMatchObject({
      classification: 'final_reanalysis_drop',
      finalReanalysisDrop: 13,
      firstDivergence: null,
    });
  });

  it('handles missing structure-4076 drift rows without crashing', () => {
    expect(classifyRowDrift({ rowId: 'structure-4076', goodRow: null, badRow: null })).toMatchObject({
      classification: 'missing_evidence',
      firstDivergence: null,
    });
  });
});
