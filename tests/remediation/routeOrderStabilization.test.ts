import { describe, expect, it } from 'vitest';
import type { AnalysisResult, CategoryKey } from '../../src/types.js';
import {
  stage160CleanupTransactionFinalDecision,
  stage160CleanupTransactionPlan,
} from '../../src/services/remediation/routeOrderStabilization.js';

function analysis(score: number, categories: Partial<Record<CategoryKey, number>>): AnalysisResult {
  return {
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    categories: Object.entries(categories).map(([key, value]) => ({
      key: key as CategoryKey,
      score: value ?? 0,
      applicable: true,
    })),
    pdfClass: 'native_tagged',
    issues: [],
    suggestions: [],
    scoreCapsApplied: [],
  } as unknown as AnalysisResult;
}

describe('Stage 160 route-order stabilization', () => {
  it('plans a cleanup transaction for targetless core-category harm', () => {
    const before = analysis(70, { alt_text: 80, table_markup: 100, reading_order: 80 });
    const afterCleanup = analysis(72, { alt_text: 80, table_markup: 20, reading_order: 80 });

    const plan = stage160CleanupTransactionPlan({
      toolName: 'repair_alt_text_structure',
      before,
      afterCleanup,
    });

    expect(plan.shouldAttempt).toBe(true);
    expect(plan.droppedCategory).toBe('table_markup');
    expect(plan.recoveryTools).toContain('normalize_table_structure');
  });

  it('does not plan transactions for unguarded tool families', () => {
    const before = analysis(70, { alt_text: 80, table_markup: 100 });
    const afterCleanup = analysis(72, { alt_text: 80, table_markup: 20 });

    const plan = stage160CleanupTransactionPlan({
      toolName: 'set_document_title',
      before,
      afterCleanup,
    });

    expect(plan.shouldAttempt).toBe(false);
  });

  it('commits only when recovery restores core categories and improves score or target', () => {
    const before = analysis(70, { alt_text: 80, table_markup: 100, reading_order: 80 });
    const afterCleanup = analysis(72, { alt_text: 80, table_markup: 20, reading_order: 80 });
    const plan = stage160CleanupTransactionPlan({
      toolName: 'repair_alt_text_structure',
      before,
      afterCleanup,
    });
    const final = analysis(82, { alt_text: 80, table_markup: 100, reading_order: 80 });

    const decision = stage160CleanupTransactionFinalDecision({
      toolName: 'repair_alt_text_structure',
      before,
      final,
      plan,
    });

    expect(decision.accept).toBe(true);
  });

  it('rolls back when recovery leaves a core category below pre-cleanup state', () => {
    const before = analysis(70, { alt_text: 80, table_markup: 100, reading_order: 80 });
    const afterCleanup = analysis(72, { alt_text: 80, table_markup: 20, reading_order: 80 });
    const plan = stage160CleanupTransactionPlan({
      toolName: 'repair_alt_text_structure',
      before,
      afterCleanup,
    });
    const final = analysis(82, { alt_text: 80, table_markup: 90, reading_order: 80 });

    const decision = stage160CleanupTransactionFinalDecision({
      toolName: 'repair_alt_text_structure',
      before,
      final,
      plan,
    });

    expect(decision.accept).toBe(false);
  });
});
