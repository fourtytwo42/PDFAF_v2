import { describe, expect, it } from 'vitest';
import {
  buildPacGateRecoveryDiagnostic,
  parsePacGateDetails,
} from '../../scripts/pac-gate-recovery-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function row(input: Partial<RemediateBenchmarkRow> & { id: string }): RemediateBenchmarkRow {
  return {
    id: input.id,
    file: input.file ?? `/tmp/${input.id}.pdf`,
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
    afterScoreCapsApplied: input.afterScoreCapsApplied ?? [],
    reanalyzedScoreCapsApplied: input.reanalyzedScoreCapsApplied ?? [],
    delta: input.delta ?? 0,
    appliedTools: input.appliedTools ?? [],
    runtimeSummary: input.runtimeSummary ?? { wallMs: 1000 },
    error: input.error,
  } as RemediateBenchmarkRow;
}

function pacDetails(input: {
  ruleId: string;
  category?: string;
  beforeStatus: string;
  afterStatus?: string;
  beforeCount?: number;
  afterCount?: number;
  scoreBefore?: number;
  scoreAfter?: number;
  categoryBefore?: number;
  categoryAfter?: number;
}): string {
  const category = input.category ?? 'pdf_ua_compliance';
  return JSON.stringify({
    outcome: 'rejected',
    note: `pac_rule_regressed(${input.ruleId})`,
    pacRuleRegression: {
      ruleId: input.ruleId,
      category,
      beforeStatus: input.beforeStatus,
      afterStatus: input.afterStatus ?? 'fail',
      beforeCount: input.beforeCount ?? 0,
      afterCount: input.afterCount ?? 1,
      beforeMessage: 'before',
      afterMessage: 'after',
    },
    debug: {
      replayState: {
        scoreBefore: input.scoreBefore ?? 50,
        scoreAfter: input.scoreAfter ?? 70,
        categoryScoresBefore: { [category]: input.categoryBefore ?? 20 },
        categoryScoresAfter: { [category]: input.categoryAfter ?? 60 },
      },
    },
  });
}

function rejectedTool(input: {
  toolName?: string;
  ruleId: string;
  beforeStatus: string;
  beforeCount?: number;
  afterCount?: number;
  scoreBefore?: number;
  scoreAfter?: number;
}) {
  return {
    toolName: input.toolName ?? 'bootstrap_struct_tree',
    stage: 3,
    round: 1,
    scoreBefore: 50,
    scoreAfter: 50,
    delta: 0,
    outcome: 'rejected' as const,
    details: pacDetails(input),
  };
}

function report(input: {
  referenceRows: RemediateBenchmarkRow[];
  strictRows: RemediateBenchmarkRow[];
}) {
  return buildPacGateRecoveryDiagnostic({
    referenceRunDir: 'reference',
    strictRunDir: 'strict',
    referenceRows: input.referenceRows,
    strictRows: input.strictRows,
    generatedAt: '2026-05-06T00:00:00.000Z',
  });
}

describe('PAC gate recovery diagnostic helpers', () => {
  it('parses PAC regression details with replay score and category evidence', () => {
    const parsed = parsePacGateDetails(pacDetails({
      ruleId: 'pdfua.annotations.tab_order_structure',
      category: 'reading_order',
      beforeStatus: 'not_applicable',
      beforeCount: 0,
      afterCount: 18,
      scoreBefore: 41,
      scoreAfter: 69,
      categoryBefore: 30,
      categoryAfter: 25,
    }));

    expect(parsed).toMatchObject({
      ruleId: 'pdfua.annotations.tab_order_structure',
      category: 'reading_order',
      beforeStatus: 'not_applicable',
      afterStatus: 'fail',
      beforeCount: 0,
      afterCount: 18,
      scoreBefore: 41,
      scoreAfter: 69,
      categoryScoreBefore: 30,
      categoryScoreAfter: 25,
    });
  });

  it('separates newly evaluable debt from true regressions', () => {
    const validation = report({
      referenceRows: [row({ id: 'a', afterScore: 98 }), row({ id: 'b', afterScore: 92 })],
      strictRows: [
        row({
          id: 'a',
          afterScore: 41,
          appliedTools: [rejectedTool({
            ruleId: 'pdfua.annotations.tab_order_structure',
            beforeStatus: 'not_applicable',
            scoreBefore: 41,
            scoreAfter: 69,
          })],
        }),
        row({
          id: 'b',
          afterScore: 80,
          appliedTools: [rejectedTool({
            ruleId: 'pdfua.figure.alt_present',
            beforeStatus: 'pass',
            scoreBefore: 90,
            scoreAfter: 70,
          })],
        }),
      ],
    });

    expect(validation.summary.newlyEvaluableDebtCount).toBe(1);
    expect(validation.summary.trueRegressionCount).toBe(1);
    expect(validation.rows.map(item => `${item.fileId}:${item.classification}`)).toEqual([
      'a:newly_evaluable_debt',
      'b:true_regression',
    ]);
  });

  it('identifies blocked useful repairs and estimates recovery from rejected replay score', () => {
    const validation = report({
      referenceRows: [row({ id: 'a', afterScore: 98 })],
      strictRows: [
        row({
          id: 'a',
          afterScore: 41,
          appliedTools: [
            rejectedTool({
              ruleId: 'pdfua.annotations.tab_order_structure',
              beforeStatus: 'not_applicable',
              scoreBefore: 41,
              scoreAfter: 69,
            }),
          ],
        }),
      ],
    });

    expect(validation.rows[0]).toMatchObject({
      fileId: 'a',
      blockedUsefulRepair: true,
      estimatedRecovery: 28,
      strictFinalScore: 41,
      referenceFinalScore: 98,
      strictToReferenceGap: 57,
    });
    expect(validation.summary.estimatedRecoverableFiles).toBe(1);
    expect(validation.summary.estimatedRecoveryScoreSum).toBe(28);
  });

  it('groups deterministically by rule and tool', () => {
    const validation = report({
      referenceRows: [row({ id: 'b' }), row({ id: 'a' })],
      strictRows: [
        row({
          id: 'b',
          appliedTools: [rejectedTool({
            toolName: 'set_figure_alt_text',
            ruleId: 'pdfua.figure.alt_present',
            beforeStatus: 'fail',
            beforeCount: 1,
            afterCount: 2,
          })],
        }),
        row({
          id: 'a',
          appliedTools: [rejectedTool({
            toolName: 'bootstrap_struct_tree',
            ruleId: 'pdfua.annotations.tab_order_structure',
            beforeStatus: 'not_applicable',
          })],
        }),
      ],
    });

    expect(validation.byRule.map(item => item.key)).toEqual([
      'pdfua.annotations.tab_order_structure',
      'pdfua.figure.alt_present',
    ]);
    expect(validation.byTool.map(item => item.key)).toEqual([
      'bootstrap_struct_tree',
      'set_figure_alt_text',
    ]);
  });
});
