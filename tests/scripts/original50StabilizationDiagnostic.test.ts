import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildOriginal50StabilizationDiagnostic,
  renderOriginal50StabilizationMarkdown,
  writeOriginal50StabilizationDiagnostic,
} from '../../scripts/original50-stabilization-diagnostic.js';

function category(key: string, score: number) {
  return { key, score };
}

function tool(toolName: string, outcome = 'applied', details = '{}') {
  return { toolName, outcome, details };
}

function row(file: string, afterScore: number | null, extra: Record<string, unknown> = {}) {
  return {
    file,
    beforeScore: 50,
    afterScore,
    afterGrade: afterScore === null ? '?' : afterScore >= 90 ? 'A' : 'F',
    durationMs: afterScore === null ? 300000 : 1000,
    falsePositiveApplied: 0,
    categoryGap: {
      after: [
        category('alt_text', 100),
        category('heading_structure', 100),
        category('reading_order', 100),
        category('table_markup', 100),
        category('pdf_ua_compliance', 100),
      ],
    },
    ...(afterScore === null ? { boundedRunner: { errorType: 'timeout' } } : {}),
    ...extra,
  };
}

function report(rows: ReturnType<typeof row>[]) {
  return { rows };
}

describe('original50 stabilization diagnostic', () => {
  it('classifies recovered rows as gate clear', () => {
    const diagnostic = buildOriginal50StabilizationDiagnostic({
      generatedAt: '2026-05-29T00:00:00.000Z',
      outDir: '/out',
      currentPath: '/current.json',
      current: report([row('4683-long-report.pdf', 94)]),
    });

    expect(diagnostic.decision.status).toBe('return_to_table_lanes');
    expect(diagnostic.rows[0]).toMatchObject({
      key: '4683',
      classification: 'gate_clear',
    });
  });

  it('separates table-related side effects from non-table debt', () => {
    const diagnostic = buildOriginal50StabilizationDiagnostic({
      outDir: '/out',
      currentPath: '/current.json',
      current: report([
        row('4438-table-control.pdf', 83, {
          categoryGap: {
            after: [
              category('table_markup', 0),
              category('alt_text', 100),
              category('heading_structure', 100),
              category('reading_order', 100),
              category('pdf_ua_compliance', 100),
            ],
          },
          appliedTools: [tool('set_document_language', 'applied')],
        }),
        row('4516-long-figure-alt.pdf', 59, {
          categoryGap: {
            after: [
              category('alt_text', 0),
              category('table_markup', 100),
              category('heading_structure', 100),
              category('reading_order', 100),
              category('pdf_ua_compliance', 100),
            ],
          },
          appliedTools: [tool('set_figure_alt_text', 'no_effect')],
        }),
      ]),
    });

    expect(diagnostic.rows.find(item => item.key === '4438')?.classification)
      .toBe('table_related_side_effect');
    expect(diagnostic.rows.find(item => item.key === '4516')?.classification)
      .toBe('non_table_remediation_debt');
    expect(diagnostic.decision.status).toBe('fix_or_park_original50_blockers_first');
  });

  it('classifies wide score spread as route/analyzer volatility', () => {
    const diagnostic = buildOriginal50StabilizationDiagnostic({
      outDir: '/out',
      currentPath: '/current.json',
      current: report([row('4076-structure.pdf', 90)]),
      referenceInputs: [
        { path: '/high.json', report: report([row('4076-structure.pdf', 97)]) },
        { path: '/low.json', report: report([row('4076-structure.pdf', 69)]) },
      ],
    });

    expect(diagnostic.rows[0]?.classification).toBe('route_analyzer_volatility');
    expect(diagnostic.rows[0]?.scoreRange.spread).toBe(28);
    expect(renderOriginal50StabilizationMarkdown(diagnostic)).toContain('route_analyzer_volatility');
  });

  it('writes JSON and Markdown reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-original50-stabilization-'));
    try {
      const currentPath = join(dir, 'current.json');
      await writeFile(currentPath, JSON.stringify(report([row('4438-table-control.pdf', null)])), 'utf8');
      const outDir = join(dir, 'out');

      const diagnostic = await writeOriginal50StabilizationDiagnostic({
        current: currentPath,
        references: [],
        outDir,
        targetScore: 93,
        timeoutMs: 300000,
      });
      const json = JSON.parse(await readFile(join(outDir, 'original50-stabilization-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'original50-stabilization-diagnostic.md'), 'utf8');

      expect(diagnostic.decision.status).toBe('investigate_runtime_tail_first');
      expect(json).toMatchObject({ decision: { status: 'investigate_runtime_tail_first' } });
      expect(md).toContain('Original-50 Stabilization Diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
