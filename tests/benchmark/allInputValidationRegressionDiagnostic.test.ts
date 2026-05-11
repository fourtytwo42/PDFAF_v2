import { describe, expect, it } from 'vitest';
import {
  buildValidationRegressionDiagnostic,
  type ValidationRegressionClassification,
} from '../../scripts/all-input-validation-regression-diagnostic.js';
import type { BaselineCorpusRow } from '../../scripts/all-input-mean-diagnostic.js';

function row(input: Partial<BaselineCorpusRow> & { file: string; afterScore: number }): BaselineCorpusRow {
  return {
    file: input.file,
    afterScore: input.afterScore,
    afterGrade: input.afterGrade ?? (input.afterScore >= 90 ? 'A' : input.afterScore >= 80 ? 'B' : input.afterScore >= 70 ? 'C' : input.afterScore >= 60 ? 'D' : 'F'),
    durationMs: input.durationMs ?? 1000,
    error: input.error,
    categoryGap: input.categoryGap ?? {
      after: [
        { key: 'heading_structure', score: input.afterScore, applicable: true },
        { key: 'reading_order', score: 96, applicable: true },
      ],
    },
  };
}

function classification(report: ReturnType<typeof buildValidationRegressionDiagnostic>, file: string): ValidationRegressionClassification | undefined {
  return report.rows.find(item => item.file === file)?.classification;
}

describe('all-input validation regression diagnostic', () => {
  it('classifies fresh regressions and runtime timeout regressions separately', () => {
    const report = buildValidationRegressionDiagnostic({
      previousRows: [
        row({ file: 'a.pdf', afterScore: 94, durationMs: 1000 }),
        row({ file: 'b.pdf', afterScore: 91, durationMs: 1000 }),
      ],
      currentRows: [
        row({ file: 'a.pdf', afterScore: 59, durationMs: 1000 }),
        row({ file: 'b.pdf', afterScore: 0, afterGrade: '?', durationMs: 300_000, error: 'per_pdf_timeout' }),
      ],
      generatedAt: '2026-05-11T00:00:00.000Z',
    });

    expect(classification(report, 'a.pdf')).toBe('fresh_regression');
    expect(classification(report, 'b.pdf')).toBe('runtime_timeout_regression');
    expect(report.summary.regressionRows).toBe(1);
    expect(report.summary.runtimeTimeoutRegressionRows).toBe(1);
  });

  it('ranks overlay misses when a targeted route beat the current fresh route', () => {
    const report = buildValidationRegressionDiagnostic({
      previousRows: [row({ file: 'volatile.pdf', afterScore: 59 })],
      currentRows: [row({ file: 'volatile.pdf', afterScore: 59 })],
      overlayRowsByRun: [
        { runDir: 'target-a', rows: [row({ file: '/tmp/volatile.pdf', afterScore: 94 })] },
      ],
      generatedAt: '2026-05-11T00:00:00.000Z',
    });

    expect(classification(report, 'volatile.pdf')).toBe('overlay_not_repeated');
    expect(report.topOverlayMisses[0]).toEqual(expect.objectContaining({
      file: 'volatile.pdf',
      overlayDelta: 35,
      targetDeficit: 34,
    }));
  });

  it('keeps stable below-target rows distinct from fresh improvements', () => {
    const report = buildValidationRegressionDiagnostic({
      previousRows: [
        row({ file: 'stable-low.pdf', afterScore: 69 }),
        row({ file: 'improved.pdf', afterScore: 59 }),
      ],
      currentRows: [
        row({ file: 'stable-low.pdf', afterScore: 69 }),
        row({ file: 'improved.pdf', afterScore: 91 }),
      ],
      generatedAt: '2026-05-11T00:00:00.000Z',
    });

    expect(classification(report, 'stable-low.pdf')).toBe('stable_low_debt');
    expect(classification(report, 'improved.pdf')).toBe('fresh_improvement');
    expect(report.summary.stableLowDebtRows).toBe(1);
  });
});
