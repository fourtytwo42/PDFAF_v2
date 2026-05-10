import { describe, expect, it } from 'vitest';
import { buildReadingOrderShellDiagnostic } from '../../scripts/all-input-reading-order-shell-diagnostic.js';

function details(input: {
  outcome?: string;
  beforeState?: string;
  afterState?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  headingBefore?: number;
  headingAfter?: number;
  readingBefore?: number;
  readingAfter?: number;
  pdfUaBefore?: number;
  pdfUaAfter?: number;
  orphanBefore?: number;
  orphanAfter?: number;
  pacRuleIds?: string[];
}) {
  const pacRuleRegressions = (input.pacRuleIds ?? []).map(ruleId => ({
    ruleId,
    beforeStatus: 'pass',
    afterStatus: 'fail',
    beforeCount: input.orphanBefore ?? 0,
    afterCount: input.orphanAfter ?? 1,
  }));
  return JSON.stringify({
    outcome: input.outcome ?? 'rejected',
    note: input.pacRuleIds?.[0] ? `pac_rule_regressed(${input.pacRuleIds[0]})` : undefined,
    pacRuleRegression: pacRuleRegressions[0],
    pacRuleRegressions,
    debug: {
      replayState: {
        stateSignatureBefore: input.beforeState,
        stateSignatureAfter: input.afterState,
        scoreBefore: input.scoreBefore ?? 69,
        scoreAfter: input.scoreAfter ?? 93,
        categoryScoresBefore: {
          heading_structure: input.headingBefore ?? 95,
          reading_order: input.readingBefore ?? 35,
          pdf_ua_compliance: input.pdfUaBefore ?? 100,
        },
        categoryScoresAfter: {
          heading_structure: input.headingAfter ?? 95,
          reading_order: input.readingAfter ?? 79,
          pdf_ua_compliance: input.pdfUaAfter ?? 79,
        },
        detectionSignalsBefore: {
          orphanMcidCount: input.orphanBefore ?? 0,
        },
        detectionSignalsAfter: {
          orphanMcidCount: input.orphanAfter ?? 64,
        },
      },
    },
  });
}

function row(file: string, tools: any[], afterScore = 69, afterGrade = 'D') {
  return {
    file,
    afterScore,
    afterGrade,
    appliedTools: tools,
  };
}

describe('all-input reading-order shell diagnostic', () => {
  it('classifies orphan-only rejected reading shell proposals as cleanup sequence candidates', () => {
    const report = buildReadingOrderShellDiagnostic({
      generatedAt: '2026-05-10T00:00:00.000Z',
      rows: [row('0239.pdf', [{
        toolName: 'repair_degenerate_native_reading_order_shell',
        outcome: 'rejected',
        scoreBefore: 69,
        scoreAfter: 69,
        details: details({
          beforeState: 'before',
          afterState: 'proposal',
          pacRuleIds: ['pdfua.content.orphan_mcids_absent'],
          orphanAfter: 14,
        }),
      }])],
    });

    expect(report.summary.sequenceCandidateCount).toBe(1);
    expect(report.rows[0]).toMatchObject({
      classification: 'sequence_candidate_needs_proposal_cleanup',
      bestProposal: {
        classification: 'pac_orphan_blocked_reading_candidate',
        stateSignatureBefore: 'before',
        stateSignatureAfter: 'proposal',
        scoreBefore: 69,
        scoreAfter: 93,
        readingBefore: 35,
        readingAfter: 79,
        orphanAfter: 14,
      },
    });
  });

  it('keeps applied safe routes as controls when orphan debt is not introduced', () => {
    const report = buildReadingOrderShellDiagnostic({
      generatedAt: '2026-05-10T00:00:00.000Z',
      rows: [row('0238.pdf', [{
        toolName: 'repair_degenerate_native_reading_order_shell',
        outcome: 'applied',
        scoreBefore: 69,
        scoreAfter: 93,
        details: details({
          outcome: 'applied',
          beforeState: 'before',
          afterState: 'safe',
          pdfUaAfter: 100,
          orphanAfter: 0,
        }),
      }], 93, 'A')],
    });

    expect(report.summary.safeRouteControlCount).toBe(1);
    expect(report.rows[0]).toMatchObject({
      classification: 'safe_route_control_observed',
      bestProposal: {
        classification: 'applied_safe_repair',
        orphanAfter: 0,
      },
    });
  });

  it('separates recovered routes that still carry final orphan debt', () => {
    const report = buildReadingOrderShellDiagnostic({
      generatedAt: '2026-05-10T00:00:00.000Z',
      rows: [row('0238.pdf', [
        {
          toolName: 'repair_degenerate_native_reading_order_shell',
          outcome: 'applied',
          scoreBefore: 69,
          scoreAfter: 93,
          details: details({
            outcome: 'applied',
            beforeState: 'before',
            afterState: 'safe',
            pdfUaAfter: 100,
            orphanAfter: 0,
          }),
        },
        {
          toolName: 'repair_top_level_parent_links',
          outcome: 'applied',
          scoreBefore: 93,
          scoreAfter: 97,
          details: details({
            outcome: 'applied',
            beforeState: 'safe',
            afterState: 'parent',
            scoreBefore: 93,
            scoreAfter: 97,
            readingBefore: 79,
            readingAfter: 96,
            pdfUaBefore: 100,
            pdfUaAfter: 79,
            orphanBefore: 0,
            orphanAfter: 64,
          }),
        },
      ], 97, 'A')],
    });

    expect(report.rows[0]).toMatchObject({
      classification: 'final_orphan_debt_after_recovery',
      finalObservedOrphanCount: 64,
    });
  });

  it('rejects mixed PAC blockers and non-score-moving proposals', () => {
    const report = buildReadingOrderShellDiagnostic({
      generatedAt: '2026-05-10T00:00:00.000Z',
      rows: [
        row('mixed.pdf', [{
          toolName: 'repair_degenerate_native_reading_order_shell',
          outcome: 'rejected',
          details: details({
            beforeState: 'before',
            afterState: 'proposal',
            pacRuleIds: ['pdfua.content.orphan_mcids_absent', 'pdfua.structure.parent_links_valid'],
          }),
        }]),
        row('flat.pdf', [{
          toolName: 'repair_degenerate_native_reading_order_shell',
          outcome: 'rejected',
          details: details({
            beforeState: 'before',
            afterState: 'proposal',
            scoreBefore: 69,
            scoreAfter: 69,
            readingBefore: 35,
            readingAfter: 35,
            pacRuleIds: ['pdfua.content.orphan_mcids_absent'],
          }),
        }]),
      ],
    });

    expect(report.summary.sequenceCandidateCount).toBe(0);
    expect(report.rows.map(item => item.bestProposal?.classification).sort()).toEqual([
      'not_score_moving',
      'unsafe_mixed_pac_regression',
    ]);
  });
});
