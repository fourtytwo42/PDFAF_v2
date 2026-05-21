import { describe, expect, it } from 'vitest';
import {
  buildAggregateReport,
  safeBase,
  type BoundedHoldoutRow,
} from '../../scripts/bounded-holdout-validation.js';

function row(input: Partial<BoundedHoldoutRow> & { file: string }): BoundedHoldoutRow {
  const beforeScore = Object.hasOwn(input, 'beforeScore') ? input.beforeScore! : 50;
  const afterScore = Object.hasOwn(input, 'afterScore') ? input.afterScore! : 95;
  return {
    file: input.file,
    pdfClassBefore: input.pdfClassBefore ?? 'native_tagged',
    beforeScore,
    beforeGrade: input.beforeGrade ?? 'F',
    categoriesBefore: [],
    afterDeterministicScore: input.afterDeterministicScore ?? afterScore,
    afterDeterministicGrade: input.afterDeterministicGrade ?? input.afterGrade ?? 'A',
    afterScore,
    afterGrade: input.afterGrade ?? 'A',
    pdfClassAfter: input.pdfClassAfter ?? 'native_tagged',
    delta: input.delta ?? 45,
    durationMs: input.durationMs ?? 1000,
    semanticRan: false,
    appliedTools: [],
    falsePositiveApplied: input.falsePositiveApplied ?? 0,
    ...(input.error ? { error: input.error } : {}),
  };
}

describe('bounded holdout validation helpers', () => {
  it('sanitizes per-row artifact names', () => {
    expect(safeBase('A report: fiscal year 2024.pdf')).toBe('A_report_fiscal_year_2024.pdf');
    expect(safeBase('***')).toBe('_');
  });

  it('computes completed-row and all-row means separately', () => {
    const report = buildAggregateReport({
      generatedAt: '2026-05-21T00:00:00.000Z',
      inputDir: '/input',
      outDir: '/out',
      perPdfTimeoutMs: 300000,
      targetScore: 95,
      rows: [
        row({ file: 'a.pdf', beforeScore: 40, afterScore: 95, afterGrade: 'A' }),
        row({ file: 'b.pdf', beforeScore: 50, afterScore: 85, afterGrade: 'B' }),
        row({ file: 'c.pdf', beforeScore: null, afterScore: null, afterGrade: '?', delta: null, error: 'external_per_pdf_timeout_300000ms' }),
      ],
    });

    expect(report.summary.count).toBe(3);
    expect(report.summary.completed).toBe(2);
    expect(report.summary.meanBefore).toBe(45);
    expect(report.summary.meanAfter).toBe(90);
    expect(report.summary.allRowMeanAfter).toBe(60);
    expect(report.summary.belowTarget).toBe(1);
    expect(report.summary.timeoutOrErrorCount).toBe(1);
  });

  it('preserves false-positive accounting in the aggregate report', () => {
    const report = buildAggregateReport({
      inputDir: '/input',
      outDir: '/out',
      perPdfTimeoutMs: 300000,
      rows: [
        row({ file: 'a.pdf', falsePositiveApplied: 0 }),
        row({ file: 'b.pdf', falsePositiveApplied: 2 }),
      ],
    });

    expect(report.summary.falsePositiveApplied).toBe(2);
  });
});
