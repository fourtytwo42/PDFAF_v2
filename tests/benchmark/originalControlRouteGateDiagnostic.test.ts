import { describe, expect, it } from 'vitest';

import {
  buildOriginalControlGateReport,
  classifyOriginalControlGateRow,
  renderOriginalControlGateMarkdown,
} from '../../scripts/original-control-route-gate-diagnostic.js';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'long-4516',
    file: '4516.pdf',
    role: 'current',
    inputPath: '/tmp/run',
    beforeScore: 43,
    afterScore: 59,
    afterGrade: 'F',
    durationMs: 90_000,
    error: null,
    categories: {
      heading_structure: 78,
      alt_text: 0,
      pdf_ua_compliance: 57,
      table_markup: 100,
      reading_order: 79,
    },
    appliedTools: [],
    ...overrides,
  } as never;
}

describe('original-control route gate diagnostic', () => {
  it('classifies current figure-alt route blockers as non-table blockers', () => {
    const classified = classifyOriginalControlGateRow(row());

    expect(classified.classification).toBe('current_non_table_figure_alt_route_blocker');
    expect(classified.reasons).toEqual(expect.arrayContaining(['alt_text=0', 'table_markup=100']));
  });

  it('classifies current table-control debt when table tools apply and table score remains low', () => {
    const classified = classifyOriginalControlGateRow(row({
      id: 'structure-4438',
      afterScore: 83,
      afterGrade: 'B',
      categories: {
        heading_structure: 94,
        alt_text: 50,
        pdf_ua_compliance: 57,
        table_markup: 72,
        reading_order: 100,
      },
      appliedTools: [
        { toolName: 'normalize_table_structure', outcome: 'applied', source: 'planner', details: '{}' },
      ],
    }));

    expect(classified.classification).toBe('current_table_control_debt');
    expect(classified.reasons).toEqual(expect.arrayContaining(['table_markup=72', 'table tools applied on original-control row']));
  });

  it('classifies recovered current rows separately from blockers', () => {
    const classified = classifyOriginalControlGateRow(row({
      id: 'long-4683',
      afterScore: 94,
      afterGrade: 'A',
      categories: { alt_text: 100, table_markup: 100, pdf_ua_compliance: 50 },
    }));

    expect(classified.classification).toBe('current_recovered');
  });

  it('classifies historical candidate rows where table-goal cleanup did not fire as unrelated gate blockers', () => {
    const classified = classifyOriginalControlGateRow(row({
      role: 'candidate',
      appliedTools: [
        { toolName: 'set_document_language', outcome: 'applied', source: 'planner', details: '{}' },
      ],
    }));

    expect(classified.classification).toBe('candidate_unrelated_original_gate_blocker');
    expect(classified.reasons).toContain('table-goal cleanup did not fire in historical artifact');
  });

  it('prioritizes non-table route stabilization before returning to table behavior', () => {
    const report = buildOriginalControlGateReport({
      outDir: '/tmp/out',
      now: new Date('2026-05-28T00:00:00.000Z'),
      inputs: [
        {
          role: 'current',
          path: '/tmp/run',
          rows: [
            row(),
            row({
              id: 'structure-4438',
              afterScore: 83,
              afterGrade: 'B',
              categories: { alt_text: 50, table_markup: 72, pdf_ua_compliance: 57, heading_structure: 94 },
              appliedTools: [{ toolName: 'normalize_table_structure', outcome: 'applied', source: 'planner', details: '{}' }],
            }),
            row({ id: 'long-4683', afterScore: 94, afterGrade: 'A', categories: { alt_text: 100, table_markup: 100 } }),
          ] as never,
        },
      ],
    });

    expect(report.decision.status).toBe('park_or_stabilize_non_table_routes_before_table_behavior');
    expect(report.decision.nextLane).toBe('non_table_original_route_stabilization_or_explicit_parking');
    expect(report.summary.currentBlockers).toEqual(['long-4516', 'structure-4438']);
    expect(renderOriginalControlGateMarkdown(report)).toContain('Read-only diagnostic');
  });
});
