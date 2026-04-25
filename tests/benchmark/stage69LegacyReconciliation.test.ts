import { describe, expect, it } from 'vitest';
import {
  buildStage69Report,
  classifyStage69Row,
  summarizeRunMetrics,
  summarizeStage68ToolInvolvement,
  summarizeStage69Row,
  type BenchmarkRow,
} from '../../scripts/stage69-legacy-reconciliation.js';

function row(input: {
  id: string;
  score: number;
  grade?: string;
  wall?: number;
  categories?: Record<string, number>;
  falsePositiveAppliedCount?: number;
  tools?: Array<{ toolName: string; outcome: string; scoreBefore?: number; scoreAfter?: number; note?: string }>;
}): BenchmarkRow {
  return {
    id: input.id,
    file: `${input.id}.pdf`,
    afterScore: input.score,
    afterGrade: input.grade ?? (input.score >= 90 ? 'A' : input.score >= 80 ? 'B' : input.score >= 70 ? 'C' : input.score >= 60 ? 'D' : 'F'),
    wallRemediateMs: input.wall ?? 1000,
    falsePositiveAppliedCount: input.falsePositiveAppliedCount ?? 0,
    afterCategories: Object.entries(input.categories ?? {}).map(([key, score]) => ({ key, score })),
    appliedTools: (input.tools ?? []).map(tool => ({
      toolName: tool.toolName,
      outcome: tool.outcome,
      scoreBefore: tool.scoreBefore ?? input.score,
      scoreAfter: tool.scoreAfter ?? input.score,
      details: tool.note ? JSON.stringify({ note: tool.note }) : undefined,
    })),
  };
}

describe('Stage 69 legacy reconciliation', () => {
  it('classifies known Teams/protected regressions as protected debt before current-fixer attribution', () => {
    const baseline = row({ id: 'fixture-teams-remediated', score: 100 });
    const candidate = row({
      id: 'fixture-teams-remediated',
      score: 94,
      tools: [{ toolName: 'normalize_table_structure', outcome: 'applied', note: 'tableValidityImproved' }],
    });
    const summary = summarizeStage69Row('fixture-teams-remediated', baseline, candidate);
    expect(summary.classification).toBe('known_protected_parity_debt');
    expect(summary.stage68ToolInvolvement[0]).toContain('normalize_table_structure:applied');
  });

  it('classifies non-protected score loss with table or figure tool involvement as a current-fixer regression', () => {
    const baseline = row({ id: 'figure-4754', score: 90 });
    const candidate = row({
      id: 'figure-4754',
      score: 84,
      tools: [{ toolName: 'set_figure_alt_text', outcome: 'applied', note: 'figureAltAttachedToReachableFigure' }],
    });
    const summary = summarizeStage69Row('figure-4754', baseline, candidate);
    expect(summary.classification).toBe('current_fixer_regression');
    expect(summary.reasons).toEqual(['score_regression_with_stage68_table_or_figure_tool_involvement']);
  });

  it('classifies runtime-only slowdowns separately from score regressions', () => {
    const classified = classifyStage69Row({
      id: 'structure-4438',
      baseline: row({ id: 'structure-4438', score: 91, wall: 10_000 }),
      candidate: row({ id: 'structure-4438', score: 91, wall: 35_000 }),
      scoreDelta: 0,
      wallDeltaMs: 25_000,
      stage68ToolInvolvement: [],
    });
    expect(classified.classification).toBe('runtime_tail_debt');
  });

  it('surfaces false-positive applied rows as hard blockers in the decision', () => {
    const report = buildStage69Report({
      stage45RunDir: 'stage45',
      stage69RunDir: 'stage69',
      protectedBaselineRunDir: 'stage42',
      gatePath: 'gate.json',
      gate: { passed: false, falsePositiveAppliedRows: [{ id: 'doc' }], gates: [] },
      stage45Rows: new Map([['doc', row({ id: 'doc', score: 90 })]]),
      stage69Rows: new Map([['doc', row({ id: 'doc', score: 90, falsePositiveAppliedCount: 1 })]]),
      generatedAt: '2026-04-25T00:00:00.000Z',
    });
    expect(report.decision.status).toBe('stage70_regression_isolation_required');
    expect(report.gate.falsePositiveAppliedRows).toEqual(['doc']);
    expect(report.metrics.deltas.falsePositiveAppliedCount).toBe(1);
  });

  it('fails closed when required row artifacts are missing', () => {
    const report = buildStage69Report({
      stage45RunDir: 'stage45',
      stage69RunDir: 'stage69',
      protectedBaselineRunDir: 'stage42',
      gatePath: null,
      gate: null,
      stage45Rows: new Map([['missing', row({ id: 'missing', score: 90 })]]),
      stage69Rows: new Map(),
      generatedAt: '2026-04-25T00:00:00.000Z',
    });
    expect(report.rows[0]?.classification).toBe('inconclusive_missing_artifact');
    expect(report.decision.status).toBe('inconclusive');
  });

  it('computes run metrics and real structural gains deterministically', () => {
    const rows = [
      row({ id: 'a', score: 100, grade: 'A', wall: 1000, tools: [{ toolName: 'set_document_title', outcome: 'applied' }] }),
      row({ id: 'b', score: 60, grade: 'D', wall: 4000, tools: [{ toolName: 'set_document_language', outcome: 'applied' }] }),
      row({ id: 'c', score: 50, grade: 'F', wall: 9000 }),
    ];
    const metrics = summarizeRunMetrics(rows);
    expect(metrics.mean).toBe(70);
    expect(metrics.median).toBe(60);
    expect(metrics.p95WallMs).toBe(9000);
    expect(metrics.attempts).toBe(2);
    expect(metrics.gradeDistribution).toMatchObject({ A: 1, D: 1, F: 1 });

    const summary = summarizeStage69Row('gain', row({ id: 'gain', score: 70 }), row({ id: 'gain', score: 78 }));
    expect(summary.classification).toBe('real_structural_gain');
  });

  it('reports Stage68 table and figure tool involvement without treating unrelated tools as involvement', () => {
    const involvement = summarizeStage68ToolInvolvement(row({
      id: 'doc',
      score: 90,
      tools: [
        { toolName: 'set_document_title', outcome: 'applied' },
        { toolName: 'retag_as_figure', outcome: 'no_effect', note: 'no_safe_rolemap_target' },
        { toolName: 'set_table_header_cells', outcome: 'rejected', note: 'no_header_gain' },
      ],
    }));
    expect(involvement).toEqual([
      'retag_as_figure:no_effect:no_safe_rolemap_target',
      'set_table_header_cells:rejected:no_header_gain',
    ]);
  });
});
