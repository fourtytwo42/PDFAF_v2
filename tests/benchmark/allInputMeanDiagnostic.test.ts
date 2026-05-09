import { describe, expect, it } from 'vitest';
import {
  buildAllInputMeanDiagnostic,
  classifyAllInputRow,
  type BaselineCorpusRow,
} from '../../scripts/all-input-mean-diagnostic.js';

function row(overrides: Partial<BaselineCorpusRow> & { file: string; afterScore: number }): BaselineCorpusRow {
  return {
    file: overrides.file,
    beforeScore: overrides.beforeScore ?? 40,
    beforeGrade: overrides.beforeGrade ?? 'F',
    afterScore: overrides.afterScore,
    afterGrade: overrides.afterGrade ?? (overrides.afterScore >= 90 ? 'A' : overrides.afterScore >= 80 ? 'B' : overrides.afterScore >= 70 ? 'C' : overrides.afterScore >= 60 ? 'D' : 'F'),
    durationMs: overrides.durationMs ?? 1000,
    categoriesBefore: overrides.categoriesBefore,
    categoryGap: overrides.categoryGap,
  };
}

function categories(values: Record<string, number>) {
  return Object.entries(values).map(([key, score]) => ({ key, score, applicable: true }));
}

describe('all input mean diagnostic helpers', () => {
  it('classifies rows by the weakest score-moving family', () => {
    expect(classifyAllInputRow(row({
      file: 'table-alt.pdf',
      afterScore: 59,
      categoryGap: { after: categories({ table_markup: 0, alt_text: 20, heading_structure: 94 }) },
    }))).toBe('table_alt_mixed');
    expect(classifyAllInputRow(row({
      file: 'table.pdf',
      afterScore: 69,
      categoryGap: { after: categories({ table_markup: 0, alt_text: 100, heading_structure: 95 }) },
    }))).toBe('table_debt');
    expect(classifyAllInputRow(row({
      file: 'heading.pdf',
      afterScore: 59,
      categoryGap: { after: categories({ table_markup: 100, alt_text: 100, heading_structure: 0, reading_order: 80 }) },
    }))).toBe('heading_reading_order');
    expect(classifyAllInputRow(row({
      file: 'link.pdf',
      afterScore: 79,
      categoryGap: { after: categories({ heading_structure: 90, reading_order: 96, link_quality: 79, pdf_ua_compliance: 90 }) },
    }))).toBe('link_reading_debt');
    expect(classifyAllInputRow(row({
      file: 'pdfua.pdf',
      afterScore: 79,
      categoryGap: { after: categories({ heading_structure: 90, reading_order: 96, link_quality: 90, pdf_ua_compliance: 79 }) },
    }))).toBe('pdfua_strict_debt');
  });

  it('computes deterministic mean, deficit, grade, family, and runtime summaries', () => {
    const report = buildAllInputMeanDiagnostic({
      generatedAt: '2026-05-09T00:00:00.000Z',
      sourceRoot: 'run-root',
      targetMean: 93,
      rows: [
        row({
          file: 'b-table.pdf',
          afterScore: 69,
          durationMs: 5000,
          categoryGap: { after: categories({ table_markup: 0, heading_structure: 95, alt_text: 100 }) },
        }),
        row({
          file: 'a-heading.pdf',
          afterScore: 59,
          durationMs: 3000,
          categoryGap: { after: categories({ heading_structure: 0, reading_order: 80, table_markup: 100 }) },
        }),
        row({
          file: 'c-a.pdf',
          afterScore: 95,
          durationMs: 1000,
          categoryGap: { after: categories({ heading_structure: 95, reading_order: 96 }) },
        }),
      ],
      lowestLimit: 3,
      slowestLimit: 2,
    });

    expect(report.summary).toEqual(expect.objectContaining({
      processed: 3,
      mean: 74.3333,
      median: 69,
      rowsBelowTarget: 2,
      pointsNeededForTargetMean: 56,
      runtimeMedianMs: 3000,
      runtimeMaxMs: 5000,
    }));
    expect(report.summary.gradeDistribution).toEqual({ A: 1, D: 1, F: 1 });
    expect(report.familySummaries.map(item => `${item.family}:${item.count}:${item.deficitTo93}`)).toEqual([
      'heading_reading_order:1:34',
      'table_debt:1:24',
    ]);
    expect(report.lowestRows.map(item => item.file)).toEqual(['a-heading.pdf', 'b-table.pdf', 'c-a.pdf']);
    expect(report.slowestRows.map(item => item.file)).toEqual(['b-table.pdf', 'a-heading.pdf']);
  });
});
