import { describe, expect, it } from 'vitest';
import {
  buildFixtureLinkRecoveryDiagnostic,
  type FixtureLinkRecoveryDiagnostic,
} from '../../scripts/fixture-link-recovery-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function tool(input: {
  toolName: string;
  outcome: string;
  scoreBefore?: number;
  scoreAfter: number;
  state?: string;
  note?: string;
  pacRule?: string;
}) {
  const note = input.note ?? (input.pacRule ? `pac_rule_regressed(${input.pacRule})` : undefined);
  return {
    toolName: input.toolName,
    stage: 1,
    round: 1,
    scoreBefore: input.scoreBefore ?? 79,
    scoreAfter: input.scoreAfter,
    delta: input.scoreAfter - (input.scoreBefore ?? 79),
    outcome: input.outcome,
    details: JSON.stringify({
      outcome: input.outcome,
      note,
      pacRuleRegression: input.pacRule
        ? {
            ruleId: input.pacRule,
            category: 'pdf_ua_compliance',
            beforeStatus: 'fail',
            afterStatus: 'fail',
            beforeCount: 3,
            afterCount: 4,
          }
        : undefined,
      pacRuleRegressions: input.pacRule
        ? [{
            ruleId: input.pacRule,
            category: 'pdf_ua_compliance',
            beforeStatus: 'fail',
            afterStatus: 'fail',
            beforeCount: 3,
            afterCount: 4,
          }]
        : undefined,
      debug: {
        replayState: {
          stateSignatureBefore: input.state,
          stateSignatureAfter: `${input.state ?? 'state'}-after`,
          scoreBefore: input.scoreBefore ?? 79,
          scoreAfter: input.scoreAfter,
          categoryScoresBefore: {
            link_quality: 73,
            reading_order: 76,
            pdf_ua_compliance: 71,
          },
          categoryScoresAfter: {
            link_quality: input.toolName === 'repair_native_link_structure' ? 100 : 73,
            reading_order: 79,
            pdf_ua_compliance: 79,
          },
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

function diagnostic(input: {
  goodRow?: RemediateBenchmarkRow | null;
  badRow?: RemediateBenchmarkRow | null;
}): FixtureLinkRecoveryDiagnostic {
  return buildFixtureLinkRecoveryDiagnostic({
    goodRun: 'good',
    badRun: 'bad',
    rowId: 'fixture-inaccessible',
    generatedAt: '2026-05-08T00:00:00.000Z',
    goodRow: input.goodRow,
    badRow: input.badRow,
  });
}

describe('fixture link recovery diagnostic', () => {
  it('detects missing native link repair after upstream route drift', () => {
    const goodRow = row({
      id: 'fixture-inaccessible',
      afterScore: 95,
      appliedTools: [
        tool({ toolName: 'artifact_repeating_page_furniture', outcome: 'rejected', scoreAfter: 79, state: 'good-state' }),
        tool({
          toolName: 'repair_native_link_structure',
          outcome: 'applied',
          scoreAfter: 95,
          state: 'link-state',
          note: 'pac_orphan_mcid_recovery(repair_native_link_structure)',
        }),
      ],
    });
    const badRow = row({
      id: 'fixture-inaccessible',
      afterScore: 79,
      appliedTools: [
        tool({ toolName: 'artifact_repeating_page_furniture', outcome: 'rejected', scoreAfter: 79, state: 'bad-state' }),
        tool({ toolName: 'mark_untagged_content_as_artifact', outcome: 'applied', scoreAfter: 79, state: 'bad-state' }),
      ],
    });

    expect(diagnostic({ goodRow, badRow })).toMatchObject({
      classification: 'upstream_route_volatility',
      goodLinkRepairStatus: 'applied_with_pac_recovery',
      badLinkRepairStatus: 'missing',
      laterLinkRecoveryMissing: true,
      noBenefitArtifactAppliedInBadRoute: true,
      firstDivergence: { classification: 'upstream_state_drift' },
    });
  });

  it('classifies same-state no-benefit artifact drift as a guard candidate', () => {
    const goodRow = row({
      id: 'fixture-inaccessible',
      afterScore: 95,
      appliedTools: [
        tool({ toolName: 'mark_untagged_content_as_artifact', outcome: 'rejected', scoreAfter: 79, state: 'same-state' }),
        tool({
          toolName: 'repair_native_link_structure',
          outcome: 'applied',
          scoreAfter: 95,
          state: 'link-state',
          note: 'pac_orphan_mcid_recovery(repair_native_link_structure)',
        }),
      ],
    });
    const badRow = row({
      id: 'fixture-inaccessible',
      afterScore: 79,
      appliedTools: [
        tool({ toolName: 'mark_untagged_content_as_artifact', outcome: 'applied', scoreAfter: 79, state: 'same-state' }),
      ],
    });

    expect(diagnostic({ goodRow, badRow })).toMatchObject({
      classification: 'same_state_artifact_route_guard_candidate',
      firstDivergence: { classification: 'same_state_outcome_drift' },
    });
  });

  it('classifies rejected native link repair with only orphan-MCID PAC debt', () => {
    const goodRow = row({
      id: 'fixture-inaccessible',
      afterScore: 95,
      appliedTools: [
        tool({
          toolName: 'repair_native_link_structure',
          outcome: 'applied',
          scoreAfter: 95,
          state: 'link-state',
          note: 'pac_orphan_mcid_recovery(repair_native_link_structure)',
        }),
      ],
    });
    const badRow = row({
      id: 'fixture-inaccessible',
      afterScore: 79,
      appliedTools: [
        tool({
          toolName: 'repair_native_link_structure',
          outcome: 'rejected',
          scoreAfter: 79,
          state: 'link-state',
          pacRule: 'pdfua.content.orphan_mcids_absent',
        }),
      ],
    });

    expect(diagnostic({ goodRow, badRow })).toMatchObject({
      classification: 'pac_blocked_useful_link_repair',
      badLinkRepairStatus: 'rejected_orphan_mcid_pac',
      pacOrphanMcidRejectionCount: 1,
    });
  });

  it('handles missing evidence without crashing', () => {
    expect(diagnostic({ goodRow: null, badRow: null })).toMatchObject({
      classification: 'missing_evidence',
      goodTimeline: [],
      badTimeline: [],
    });
  });
});
