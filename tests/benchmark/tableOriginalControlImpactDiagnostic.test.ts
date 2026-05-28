import { describe, expect, it } from 'vitest';

import {
  buildTableOriginalControlImpactReport,
  classifyTableOriginalControlImpact,
  renderTableOriginalControlImpactMarkdown,
} from '../../scripts/table-original-control-impact-diagnostic.js';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'long-4516',
    file: '4516.pdf',
    beforeScore: 43,
    afterScore: 92,
    afterGrade: 'A',
    durationMs: 1000,
    error: null,
    categories: { table_markup: 100, alt_text: 100, heading_structure: 78, pdf_ua_compliance: 79 },
    appliedTools: [],
    ...overrides,
  } as never;
}

describe('table original-control impact diagnostic', () => {
  it('keeps direct table behavior stable when marker fires without regression', () => {
    const result = classifyTableOriginalControlImpact({
      baselineRow: row(),
      candidatePath: '/candidate',
      candidateRow: row({
        afterScore: 95,
        appliedTools: [
          {
            toolName: 'normalize_table_structure',
            outcome: 'applied',
            source: 'post_pass',
            details: JSON.stringify({ note: 'stage180_empty_row_regularity_cleanup' }),
          },
        ],
      }),
    });

    expect(result.classification).toBe('direct_table_behavior_improved_or_stable');
    expect(result.tableBehaviorMarkerFired).toBe(true);
  });

  it('flags direct table behavior non-table PAC side effects', () => {
    const result = classifyTableOriginalControlImpact({
      baselineRow: row(),
      candidatePath: '/candidate',
      candidateRow: row({
        afterScore: 95,
        appliedTools: [
          {
            toolName: 'normalize_table_structure',
            outcome: 'applied',
            source: 'post_pass',
            details: JSON.stringify({ note: 'stage180_header_regularization_sequence', raw: 'pac_rule_regressed(pdfua.figure.alt_present)' }),
          },
        ],
      }),
    });

    expect(result.classification).toBe('direct_table_behavior_non_table_pac_side_effect');
  });

  it('separates table route changes that lack direct behavior markers', () => {
    const result = classifyTableOriginalControlImpact({
      baselineRow: row({ afterScore: 90, categories: { table_markup: 100 } }),
      candidatePath: '/candidate',
      candidateRow: row({
        afterScore: 69,
        categories: { table_markup: 72 },
        appliedTools: [
          { toolName: 'set_table_header_cells', outcome: 'applied', source: 'planner', details: '{}' },
        ],
      }),
    });

    expect(result.classification).toBe('table_route_changed_without_behavior_marker');
  });

  it('classifies non-table score drops as unrelated route regressions', () => {
    const result = classifyTableOriginalControlImpact({
      baselineRow: row({ afterScore: 92, categories: { table_markup: 100 } }),
      candidatePath: '/candidate',
      candidateRow: row({ afterScore: 59, categories: { table_markup: 100, alt_text: 0 } }),
    });

    expect(result.classification).toBe('unrelated_route_regression');
  });

  it('builds a decision that parks unrelated route blockers before table acceptance', () => {
    const report = buildTableOriginalControlImpactReport({
      outDir: '/tmp/out',
      now: new Date('2026-05-28T00:00:00.000Z'),
      baseline: {
        path: '/baseline',
        rows: [
          row({ id: 'long-4516', file: '4516.pdf', afterScore: 92, categories: { table_markup: 100 } }),
          row({ id: 'mt-1', file: 'mt-0001.pdf', afterScore: 89, categories: { table_markup: 70 } }),
        ] as never,
      },
      candidates: [
        {
          path: '/candidate',
          rows: [
            row({ id: 'long-4516', file: '4516.pdf', afterScore: 59, categories: { table_markup: 100, alt_text: 0 } }),
            row({
              id: 'mt-1',
              file: 'mt-0001.pdf',
              afterScore: 95,
              categories: { table_markup: 100 },
              appliedTools: [
                {
                  toolName: 'normalize_table_structure',
                  outcome: 'applied',
                  source: 'post_pass',
                  details: JSON.stringify({ note: 'stage180_empty_row_regularity_cleanup' }),
                },
              ],
            }),
          ] as never,
        },
      ],
    });

    expect(report.decision.status).toBe('original_gate_blocked_by_unrelated_route');
    expect(report.summary.directBehaviorRows).toEqual(['0001']);
    expect(report.summary.unrelatedRouteRegressions).toEqual(['4516']);
    expect(renderTableOriginalControlImpactMarkdown(report)).toContain('Read-only diagnostic');
  });
});
