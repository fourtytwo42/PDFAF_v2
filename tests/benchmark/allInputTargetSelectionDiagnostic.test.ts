import { describe, expect, it } from 'vitest';
import { buildAllInputTargetSelectionDiagnostic } from '../../scripts/all-input-target-selection-diagnostic.js';
import type { AllInputMeanDiagnostic, AllInputSummaryRow } from '../../scripts/all-input-mean-diagnostic.js';

function summaryRow(overrides: Partial<AllInputSummaryRow> & { file: string; score: number; family: AllInputSummaryRow['family'] }): AllInputSummaryRow {
  return {
    file: overrides.file,
    score: overrides.score,
    grade: overrides.grade ?? (overrides.score >= 90 ? 'A' : overrides.score >= 80 ? 'B' : overrides.score >= 70 ? 'C' : overrides.score >= 60 ? 'D' : 'F'),
    family: overrides.family,
    deficitTo93: overrides.deficitTo93 ?? Math.max(0, 93 - overrides.score),
    durationMs: overrides.durationMs ?? 1000,
    weakest: overrides.weakest ?? [],
  };
}

function allInput(rows: AllInputSummaryRow[]): AllInputMeanDiagnostic {
  return {
    generatedAt: '2026-05-09T00:00:00.000Z',
    sourceRoot: 'root',
    targetMean: 93,
    summary: {
      processed: rows.length,
      mean: 80,
      median: 80,
      gradeDistribution: {},
      rowsBelowTarget: rows.length,
      pointsNeededForTargetMean: rows.reduce((sum, row) => sum + row.deficitTo93, 0),
      runtimeMeanMs: 1000,
      runtimeMedianMs: 1000,
      runtimeP95Ms: 1000,
      runtimeMaxMs: 1000,
    },
    familySummaries: [],
    lowestRows: rows,
    slowestRows: [],
  };
}

function poc(files: Array<{ file: string; rules: Array<{ ruleId: string; category?: string }> }>) {
  return {
    files: files.map(file => ({
      file: `/tmp/${file.file}`,
      rules: file.rules.map(rule => ({
        ruleId: rule.ruleId,
        category: rule.category ?? 'pdf_ua_compliance',
        confidence: 'verified',
        status: 'fail',
      })),
    })),
  };
}

describe('all input target selection diagnostic helpers', () => {
  it('selects heading/reading targets when they dominate and have PAC structure evidence', () => {
    const report = buildAllInputTargetSelectionDiagnostic({
      generatedAt: '2026-05-09T00:00:00.000Z',
      allInput: allInput([
        summaryRow({ file: 'heading-low.pdf', score: 51, family: 'heading_reading_order' }),
        summaryRow({ file: 'table-low.pdf', score: 69, family: 'table_debt' }),
      ]),
      pocMatrix: poc([
        { file: 'heading-low.pdf', rules: [{ ruleId: 'pdfua.content.text_tagged_or_artifacted', category: 'reading_order' }] },
        { file: 'table-low.pdf', rules: [{ ruleId: 'pdfua.table.header_association_present', category: 'table_markup' }] },
      ]),
    });

    expect(report.summary.selectedDirection).toBe('heading_reading_recovery_target');
    expect(report.rows[0]).toEqual(expect.objectContaining({
      file: 'heading-low.pdf',
      classification: 'heading_reading_recovery_target',
      pocFamilies: ['content_tagging'],
    }));
  });

  it('classifies table rows with PAC table evidence as table header recovery targets', () => {
    const report = buildAllInputTargetSelectionDiagnostic({
      allInput: allInput([
        summaryRow({ file: 'table-low.pdf', score: 59, family: 'table_debt' }),
      ]),
      pocMatrix: poc([
        { file: 'table-low.pdf', rules: [{ ruleId: 'pdfua.table.header_cells_associated', category: 'table_markup' }] },
      ]),
    });

    expect(report.rows[0]).toEqual(expect.objectContaining({
      classification: 'table_header_recovery_target',
      rationale: expect.stringContaining('table header-association'),
    }));
    expect(report.familySummaries[0]).toEqual(expect.objectContaining({
      classification: 'table_header_recovery_target',
      deficitTo93: 34,
    }));
  });

  it('parks known or extreme runtime debt ahead of behavior selection', () => {
    const report = buildAllInputTargetSelectionDiagnostic({
      allInput: allInput([
        summaryRow({ file: '0031-structure-4438.pdf', score: 36, family: 'heading_reading_order', durationMs: 650000 }),
        summaryRow({ file: 'other-slow.pdf', score: 59, family: 'table_debt', durationMs: 700000 }),
      ]),
      pocMatrix: poc([
        { file: '0031-structure-4438.pdf', rules: [{ ruleId: 'pdfua.content.image_tagged_or_artifacted' }] },
        { file: 'other-slow.pdf', rules: [{ ruleId: 'pdfua.table.header_association_present', category: 'table_markup' }] },
      ]),
    });

    expect(report.rows.map(row => `${row.file}:${row.classification}`)).toEqual([
      '0031-structure-4438.pdf:parked_runtime_debt',
      'other-slow.pdf:parked_runtime_debt',
    ]);
  });
});
