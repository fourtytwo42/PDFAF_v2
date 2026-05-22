import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildAggregateReport,
  externalKillTimeoutMs,
  listPdfs,
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

  it('lists real and symlinked PDF inputs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-bounded-holdout-'));
    try {
      const sourcePdf = join(dir, 'source.pdf');
      await writeFile(sourcePdf, '%PDF-1.7\n');
      await writeFile(join(dir, 'notes.txt'), 'ignore me');
      await symlink(sourcePdf, join(dir, 'linked.pdf'));
      await symlink(join(dir, 'notes.txt'), join(dir, 'linked.txt'));

      const pdfs = await listPdfs(dir, 10);

      expect(pdfs.map(file => basename(file))).toEqual(['linked.pdf', 'source.pdf']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
    expect(report.flags.childRemediationTimeoutMs).toBe(300000);
    expect(report.flags.externalTimeoutGraceMs).toBe(10000);
    expect(report.flags.externalPerPdfTimeoutMs).toBe(310000);
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

  it('adds external process grace after the child remediation timeout', () => {
    expect(externalKillTimeoutMs(300_000)).toBe(310_000);
    expect(externalKillTimeoutMs(300_000, 30_000)).toBe(330_000);
  });
});
