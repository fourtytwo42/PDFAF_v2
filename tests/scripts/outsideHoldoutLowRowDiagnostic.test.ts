import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildOutsideHoldoutLowRowReport,
  renderOutsideHoldoutLowRowMarkdown,
  writeOutsideHoldoutLowRowReport,
} from '../../scripts/outside-holdout-low-row-diagnostic.js';

function categories(values: Record<string, number>) {
  return Object.entries(values).map(([key, score]) => ({ key, score, applicable: true }));
}

function row(input: {
  file: string;
  score: number | null;
  grade?: string;
  cats?: Record<string, number>;
  tools?: Array<Record<string, unknown>>;
  error?: string;
}) {
  return {
    file: input.file,
    afterScore: input.score,
    afterGrade: input.grade ?? 'A',
    durationMs: 1000,
    falsePositiveApplied: 0,
    ...(input.error ? { error: input.error } : {}),
    categoryGap: {
      after: categories(input.cats ?? {
        text_extractability: 100,
        title_language: 100,
        heading_structure: 100,
        alt_text: 100,
        pdf_ua_compliance: 100,
        table_markup: 100,
        link_quality: 100,
        reading_order: 100,
      }),
    },
    appliedTools: input.tools ?? [],
  };
}

describe('outside holdout low-row diagnostic', () => {
  it('classifies high-impact figure, table, and reading/link candidates', () => {
    const report = buildOutsideHoldoutLowRowReport({
      sourceRun: '/tmp/baseline_report.json',
      targetMean: 93,
      report: {
        inputDir: '/input',
        rows: [
          row({
            file: 'figure.pdf',
            score: 59,
            grade: 'F',
            cats: { alt_text: 20, pdf_ua_compliance: 79, reading_order: 100 },
            tools: [
              { toolName: 'set_figure_alt_text', outcome: 'applied', details: '{"note":"figure_alt_set"}' },
              { toolName: 'repair_structure_conformance', outcome: 'rejected', details: '{"note":"pac_rule_regressed(pdfua.figure.alt_present)"}' },
            ],
          }),
          row({
            file: 'table.pdf',
            score: 69,
            grade: 'D',
            cats: { table_markup: 0, heading_structure: 60, pdf_ua_compliance: 71 },
            tools: [
              { toolName: 'normalize_table_structure', outcome: 'rejected', details: '{"note":"pac_rule_regressed(pdfua.table.header_association_present)"}' },
              { toolName: 'set_table_header_cells', outcome: 'applied', details: '{"note":"table_header_association_improved"}' },
            ],
          }),
          row({
            file: 'reading.pdf',
            score: 79,
            grade: 'C',
            cats: { reading_order: 68, link_quality: 73, pdf_ua_compliance: 79 },
            tools: [
              { toolName: 'normalize_annotation_tab_order', outcome: 'applied' },
              { toolName: 'repair_native_link_structure', outcome: 'rejected' },
            ],
          }),
          row({ file: 'ok.pdf', score: 95, grade: 'A' }),
        ],
      },
    });

    expect(report.decision.status).toBe('plan_high_impact_targeted_diagnostic');
    expect(report.decision.recommendedLane).toBe('figure_alt_object_candidate');
    expect(report.rawPointsNeededForTargetMean).toBe(70);
    expect(report.lowRows.map(item => [item.file, item.candidateClass])).toEqual([
      ['figure.pdf', 'figure_alt_object_candidate'],
      ['table.pdf', 'table_target_resolution_needed'],
      ['reading.pdf', 'reading_link_order_candidate'],
    ]);
  });

  it('keeps near misses low priority even when they expose lane hints', () => {
    const report = buildOutsideHoldoutLowRowReport({
      sourceRun: '/tmp/baseline_report.json',
      targetMean: 93,
      report: {
        rows: [
          row({
            file: 'near.pdf',
            score: 91,
            grade: 'A',
            cats: { reading_order: 66, pdf_ua_compliance: 79 },
            tools: [{ toolName: 'artifact_repeating_page_furniture', outcome: 'applied' }],
          }),
          row({ file: 'pass.pdf', score: 94, grade: 'A' }),
        ],
      },
    });

    expect(report.decision.status).toBe('no_safe_low_row_lane');
    expect(report.lowRows[0]?.candidateClass).toBe('near_miss_monitor');
    expect(report.lowRows[0]?.evidence.join(';')).toContain('near_miss_lane_hint:reading_link_order_candidate');
  });

  it('reports timeout rows as blocked runtime debt', () => {
    const report = buildOutsideHoldoutLowRowReport({
      sourceRun: '/tmp/baseline_report.json',
      report: {
        rows: [
          row({ file: 'timeout.pdf', score: null, grade: '?', error: 'external_per_pdf_timeout_300000ms' }),
          row({ file: 'pass.pdf', score: 100, grade: 'A' }),
        ],
      },
    });

    expect(report.timeoutOrErrorCount).toBe(1);
    expect(report.lowRows[0]?.candidateClass).toBe('timeout_or_error');
    expect(renderOutsideHoldoutLowRowMarkdown(report)).toContain('This is a diagnostic/reporting artifact only');
  });

  it('writes JSON and Markdown reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-outside-low-row-'));
    try {
      const run = join(dir, 'baseline_report.json');
      await writeFile(run, JSON.stringify({
        generatedAt: '2026-05-21T00:00:00.000Z',
        rows: [
          row({
            file: 'metadata.pdf',
            score: 89,
            grade: 'B',
            cats: { title_language: 50, pdf_ua_compliance: 50, reading_order: 80 },
            tools: [{ toolName: 'set_document_language', outcome: 'rejected' }],
          }),
        ],
      }, null, 2), 'utf8');

      const out = join(dir, 'out');
      const report = await writeOutsideHoldoutLowRowReport({ runPath: run, outDir: out });
      const json = JSON.parse(await readFile(join(out, 'outside-holdout-low-row-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(out, 'outside-holdout-low-row-diagnostic.md'), 'utf8');

      expect(report.lowRows[0]?.candidateClass).toBe('metadata_pdfua_candidate');
      expect(json).toMatchObject({ decision: { recommendedLane: 'metadata_pdfua_candidate' } });
      expect(md).toContain('metadata_pdfua_candidate');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
