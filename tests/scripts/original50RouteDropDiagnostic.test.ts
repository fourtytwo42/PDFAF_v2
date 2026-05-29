import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildOriginal50RouteDropDiagnostic,
  renderOriginal50RouteDropMarkdown,
  writeOriginal50RouteDropDiagnostic,
} from '../../scripts/original50-route-drop-diagnostic.js';

function category(key: string, score: number) {
  return { key, score, applicable: true };
}

function tool(toolName: string, outcome = 'applied', details: unknown = '{}') {
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

describe('original50 route-drop diagnostic', () => {
  it('classifies a high-reference alt drop as figure/alt route volatility', () => {
    const diagnostic = buildOriginal50RouteDropDiagnostic({
      generatedAt: '2026-05-29T00:00:00.000Z',
      outDir: '/out',
      gatePath: '/gate.json',
      gate: report([
        row('4516-long-report.pdf', 59, {
          categoryGap: {
            after: [
              category('alt_text', 0),
              category('heading_structure', 78),
              category('reading_order', 79),
              category('table_markup', 100),
              category('pdf_ua_compliance', 57),
            ],
          },
          appliedTools: [tool('set_figure_alt_text', 'rejected', '{"note":"pac_rule_regressed(pdfua.figure.alt_present)"}')],
        }),
      ]),
      referenceInputs: [
        {
          label: 'focused',
          path: '/focused.json',
          report: report([
            row('4516-long-report.pdf', 92, {
              categoryGap: {
                after: [
                  category('alt_text', 100),
                  category('heading_structure', 78),
                  category('reading_order', 79),
                  category('table_markup', 100),
                  category('pdf_ua_compliance', 57),
                ],
              },
            }),
          ]),
        },
      ],
    });

    expect(diagnostic.rows[0]).toMatchObject({
      key: '4516',
      classification: 'figure_alt_route_drop',
      gateDropFromBest: 33,
    });
    expect(diagnostic.decision.status).toBe('diagnose_non_table_route_volatility_before_table_reopen');
  });

  it('keeps stable table-control debt separate from route drops', () => {
    const diagnostic = buildOriginal50RouteDropDiagnostic({
      outDir: '/out',
      gatePath: '/gate.json',
      gate: report([
        row('4438-table-control.pdf', 83, {
          categoryGap: {
            after: [
              category('alt_text', 50),
              category('heading_structure', 94),
              category('reading_order', 100),
              category('table_markup', 72),
              category('pdf_ua_compliance', 57),
            ],
          },
          appliedTools: [tool('set_table_header_cells', 'applied')],
        }),
      ]),
      referenceInputs: [
        { label: 'accepted', path: '/accepted.json', report: report([row('4438-table-control.pdf', 83)]) },
      ],
    });

    expect(diagnostic.rows[0]?.classification).toBe('table_control_checkpoint_debt');
    expect(diagnostic.summary.routeDropRows).toEqual([]);
  });

  it('requires repeat for a newly observed moderate gate drop', () => {
    const diagnostic = buildOriginal50RouteDropDiagnostic({
      outDir: '/out',
      gatePath: '/gate.json',
      gate: report([
        row('4754-new-drop.pdf', 85, {
          categoryGap: {
            after: [
              category('alt_text', 100),
              category('heading_structure', 44),
              category('reading_order', 100),
              category('table_markup', 79),
              category('pdf_ua_compliance', 71),
            ],
          },
        }),
      ]),
      referenceInputs: [
        {
          label: 'accepted',
          path: '/accepted.json',
          report: report([
            row('4754-new-drop.pdf', 94, {
              categoryGap: {
                after: [
                  category('alt_text', 100),
                  category('heading_structure', 86),
                  category('reading_order', 100),
                  category('table_markup', 79),
                  category('pdf_ua_compliance', 71),
                ],
              },
            }),
          ]),
        },
      ],
    });

    expect(diagnostic.rows[0]?.classification).toBe('new_gate_drop_requires_repeat');
    expect(diagnostic.summary.newGateDropRows).toEqual(['4754']);
    expect(renderOriginal50RouteDropMarkdown(diagnostic)).toContain('new_gate_drop_requires_repeat');
  });

  it('writes JSON and Markdown reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-route-drop-'));
    try {
      const gatePath = join(dir, 'gate.json');
      const refPath = join(dir, 'ref.json');
      await writeFile(gatePath, JSON.stringify(report([row('4076-structure.pdf', null)])), 'utf8');
      await writeFile(refPath, JSON.stringify(report([row('4076-structure.pdf', 90)])), 'utf8');
      const outDir = join(dir, 'out');

      const diagnostic = await writeOriginal50RouteDropDiagnostic({
        gate: gatePath,
        references: [{ label: 'focused', path: refPath }],
        rows: [],
        outDir,
        targetScore: 93,
        timeoutMs: 300000,
      });
      const json = JSON.parse(await readFile(join(outDir, 'original50-route-drop-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'original50-route-drop-diagnostic.md'), 'utf8');

      expect(diagnostic.summary.timeoutCount).toBe(1);
      expect(json).toMatchObject({ summary: { timeoutCount: 1 } });
      expect(md).toContain('Original-50 Route-Drop Diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
