import { describe, expect, it } from 'vitest';
import {
  buildPacGateBlockerDiagnostic,
  classifyPacGateBlocker,
} from '../../scripts/pac-gate-blocker-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function row(input: Partial<RemediateBenchmarkRow> & { id: string }): RemediateBenchmarkRow {
  return {
    id: input.id,
    file: input.file ?? `${input.id}.pdf`,
    cohort: input.cohort ?? 'test',
    sourceType: input.sourceType ?? 'original',
    intent: input.intent ?? 'test',
    beforeScore: input.beforeScore ?? 50,
    beforeGrade: input.beforeGrade ?? 'F',
    beforePdfClass: input.beforePdfClass ?? 'native_untagged',
    afterScore: input.afterScore ?? 50,
    afterGrade: input.afterGrade ?? 'F',
    afterPdfClass: input.afterPdfClass ?? 'native_tagged',
    reanalyzedScore: input.reanalyzedScore ?? null,
    reanalyzedGrade: input.reanalyzedGrade ?? null,
    reanalyzedPdfClass: input.reanalyzedPdfClass ?? null,
    delta: input.delta ?? 0,
    appliedTools: input.appliedTools ?? [],
    rounds: input.rounds ?? [],
    error: input.error,
  } as RemediateBenchmarkRow;
}

function details(input: {
  ruleId: string;
  category?: string;
  beforeStatus?: string;
  beforeCount?: number;
  afterCount?: number;
  scoreBefore?: number;
  scoreAfter?: number;
  categoryBefore?: number;
  categoryAfter?: number;
}) {
  const category = input.category ?? 'pdf_ua_compliance';
  return JSON.stringify({
    outcome: 'rejected',
    note: `pac_rule_regressed(${input.ruleId})`,
    pacRuleRegression: {
      ruleId: input.ruleId,
      category,
      beforeStatus: input.beforeStatus ?? 'fail',
      afterStatus: 'fail',
      beforeCount: input.beforeCount ?? 1,
      afterCount: input.afterCount ?? 2,
    },
    debug: {
      replayState: {
        scoreBefore: input.scoreBefore ?? 40,
        scoreAfter: input.scoreAfter ?? 70,
        categoryScoresBefore: { [category]: input.categoryBefore ?? 20 },
        categoryScoresAfter: { [category]: input.categoryAfter ?? 60 },
      },
    },
  });
}

function rejected(input: {
  toolName?: string;
  ruleId: string;
  scoreBefore?: number;
  scoreAfter?: number;
  categoryBefore?: number;
  categoryAfter?: number;
}) {
  return {
    toolName: input.toolName ?? 'create_heading_from_candidate',
    stage: 3,
    round: 1,
    scoreBefore: input.scoreBefore ?? 40,
    scoreAfter: input.scoreBefore ?? 40,
    delta: 0,
    outcome: 'rejected' as const,
    details: details(input),
  };
}

describe('PAC gate blocker diagnostic helpers', () => {
  it('classifies same-category improvement as a blocked useful repair', () => {
    expect(classifyPacGateBlocker({
      ruleId: 'pdfua.content.orphan_mcids_absent',
      scoreBefore: 40,
      scoreAfter: 60,
      categoryScoreBefore: 20,
      categoryScoreAfter: 30,
    })).toBe('blocked_useful_same_category_improvement');
  });

  it('classifies score/category loss as a harmful regression', () => {
    expect(classifyPacGateBlocker({
      ruleId: 'pdfua.figure.alt_present',
      scoreBefore: 80,
      scoreAfter: 70,
      categoryScoreBefore: 90,
      categoryScoreAfter: 60,
    })).toBe('real_harmful_regression');
  });

  it('excludes non-focus rules from promotion recommendations', () => {
    expect(classifyPacGateBlocker({
      ruleId: 'pdfua.annotations.tab_order_structure',
      scoreBefore: 40,
      scoreAfter: 80,
      categoryScoreBefore: 20,
      categoryScoreAfter: 70,
    })).toBe('non_focus_rule');
  });

  it('ranks repeated orphan-MCID useful blockers for narrow policy review', () => {
    const report = buildPacGateBlockerDiagnostic({
      referenceRunDir: 'ref',
      candidateRunDir: 'candidate',
      referenceRows: [row({ id: 'b', afterScore: 90 }), row({ id: 'a', afterScore: 90 })],
      candidateRows: [
        row({
          id: 'b',
          afterScore: 50,
          appliedTools: [rejected({
            toolName: 'set_figure_alt_text',
            ruleId: 'pdfua.figure.alt_present',
            scoreBefore: 80,
            scoreAfter: 70,
            categoryBefore: 90,
            categoryAfter: 60,
          })],
        }),
        row({
          id: 'a',
          afterScore: 40,
          appliedTools: [rejected({
            toolName: 'create_heading_from_candidate',
            ruleId: 'pdfua.content.orphan_mcids_absent',
            scoreBefore: 40,
            scoreAfter: 70,
            categoryBefore: 20,
            categoryAfter: 60,
          })],
        }),
      ],
      generatedAt: '2026-05-06T00:00:00.000Z',
    });

    expect(report.summary.candidateForPolicyReviewCount).toBe(1);
    expect(report.summary.realHarmfulRegressionCount).toBe(1);
    expect(report.rows.map(item => `${item.fileId}:${item.recommendation}`)).toEqual([
      'a:candidate_for_narrow_policy_review',
      'b:keep_gate',
    ]);
    expect(report.byRule[0]).toMatchObject({
      key: 'pdfua.content.orphan_mcids_absent',
      candidateForReviewCount: 1,
    });
  });
});
