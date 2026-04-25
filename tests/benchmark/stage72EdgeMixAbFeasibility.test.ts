import { describe, expect, it } from 'vitest';
import {
  buildStage72Report,
  classifyStage72Row,
  selectStage73Direction,
  type BenchmarkRow,
} from '../../scripts/stage72-edge-mix-ab-feasibility.js';

function row(input: {
  id: string;
  score: number;
  grade?: string;
  categories?: Record<string, number>;
  tools?: Array<{ toolName: string; outcome: string; note?: string }>;
}): BenchmarkRow {
  return {
    id: input.id,
    file: `${input.id}.pdf`,
    afterScore: input.score,
    afterGrade: input.grade ?? (input.score >= 90 ? 'A' : input.score >= 80 ? 'B' : input.score >= 70 ? 'C' : input.score >= 60 ? 'D' : 'F'),
    afterCategories: Object.entries(input.categories ?? {}).map(([key, score]) => ({ key, score })),
    appliedTools: (input.tools ?? []).map(tool => ({
      toolName: tool.toolName,
      outcome: tool.outcome,
      details: tool.note ? JSON.stringify({ note: tool.note }) : undefined,
    })),
  };
}

function stage65(id: string, klass: string, family = 'figure_alt'): Record<string, unknown> {
  return { id, class: klass, residualFamily: family };
}

function stage66(id: string, decision: string, rootCause = 'python_structural_drop_or_count_variance'): Record<string, unknown> {
  return { id, decision, rootCause };
}

describe('Stage 72 edge-mix A/B feasibility', () => {
  it('separates stable candidates from analyzer-volatility and manual/scanned rows', () => {
    const stable = classifyStage72Row({
      corpus: 'edge_mix_1',
      row: row({
        id: 'v1-4145',
        score: 78,
        grade: 'C',
        categories: { alt_text: 20 },
        tools: [{ toolName: 'set_figure_alt_text', outcome: 'no_effect', note: 'no_more_targets' }],
      }),
      stage65Row: stage65('v1-4145', 'stable_structural_residual', 'figure_alt'),
    });
    expect(stable.debtBucket).toBe('stable_structural_residual');
    expect(stable.fixerPathExists).toBe(true);
    expect(stable.expectedAbContribution).toBe(1);

    const volatile = classifyStage72Row({
      corpus: 'edge_mix_1',
      row: row({ id: 'v1-4139', score: 69, grade: 'D', categories: { reading_order: 35 } }),
      stage65Row: stage65('v1-4139', 'parked_analyzer_volatility', 'mixed'),
      stage66Row: stage66('v1-4139', 'non_canonicalizable_analyzer_debt'),
    });
    expect(volatile.debtBucket).toBe('parked_analyzer_volatility');
    expect(volatile.fixerPathExists).toBe(false);

    const manual = classifyStage72Row({
      corpus: 'edge_mix_2',
      row: row({ id: 'v1-3507', score: 52, grade: 'F', categories: { heading_structure: 0 } }),
      stage65Row: stage65('v1-3507', 'manual_scanned_debt', 'manual_scanned'),
      stage66Row: stage66('v1-3507', 'policy_debt', 'manual_scanned_or_policy_debt'),
    });
    expect(manual.debtBucket).toBe('manual_scanned_policy_debt');
    expect(manual.expectedAbContribution).toBe(0);
  });

  it('computes A/B feasibility and does not count parked rows toward the target', () => {
    const rows = [
      classifyStage72Row({
        corpus: 'edge_mix_1',
        row: row({
          id: 'v1-4145',
          score: 78,
          grade: 'C',
          categories: { alt_text: 20 },
          tools: [{ toolName: 'set_figure_alt_text', outcome: 'no_effect' }],
        }),
        stage65Row: stage65('v1-4145', 'stable_structural_residual'),
      }),
      classifyStage72Row({
        corpus: 'edge_mix_1',
        row: row({
          id: 'v1-4683',
          score: 59,
          grade: 'F',
          categories: { alt_text: 0 },
          tools: [{ toolName: 'set_figure_alt_text', outcome: 'rejected' }],
        }),
        stage65Row: stage65('v1-4683', 'parked_analyzer_volatility'),
        stage66Row: stage66('v1-4683', 'non_canonicalizable_analyzer_debt'),
      }),
    ];
    const decision = selectStage73Direction({ currentAbCount: 21, totalRows: 28, rows });
    expect(decision.abMath.targetAbCount).toBe(23);
    expect(decision.abMath.stableCandidateCount).toBe(1);
    expect(decision.abMath.projectedAbCountWithStableCandidates).toBe(22);
    expect(decision.abMath.reachableWithoutParkedOrManualRows).toBe(false);
    expect(decision.selectedStage73Direction).toBe('Stage 73: Single-Row Stable Cleanup plus End-Gate Target Revisit');
  });

  it('selects stable A/B cleanup only when enough stable non-parked rows exist', () => {
    const candidateA = {
      ...classifyStage72Row({
        corpus: 'edge_mix_1',
        row: row({ id: 'v1-a', score: 78, grade: 'C', categories: { alt_text: 20 }, tools: [{ toolName: 'set_figure_alt_text', outcome: 'no_effect' }] }),
        stage65Row: stage65('v1-a', 'stable_structural_residual'),
      }),
      id: 'v1-a',
    };
    const candidateB = {
      ...classifyStage72Row({
        corpus: 'edge_mix_2',
        row: row({ id: 'v1-b', score: 79, grade: 'C', categories: { table_markup: 44 }, tools: [{ toolName: 'normalize_table_structure', outcome: 'no_effect' }] }),
        stage65Row: stage65('v1-b', 'stable_structural_residual', 'table'),
      }),
      id: 'v1-b',
    };
    const decision = selectStage73Direction({ currentAbCount: 21, totalRows: 28, rows: [candidateA, candidateB] });
    expect(decision.selectedStage73Direction).toBe('Stage 73: Stable Edge-Mix A/B Cleanup');
    expect(decision.abMath.reachableWithoutParkedOrManualRows).toBe(true);
  });

  it('fails closed when repeatability evidence is missing', () => {
    const missing = classifyStage72Row({
      corpus: 'edge_mix_1',
      row: row({ id: 'v1-missing', score: 78, grade: 'C', categories: { alt_text: 20 }, tools: [{ toolName: 'set_figure_alt_text', outcome: 'no_effect' }] }),
    });
    const decision = selectStage73Direction({ currentAbCount: 21, totalRows: 28, rows: [missing] });
    expect(missing.debtBucket).toBe('inconclusive_missing_artifact');
    expect(decision.selectedStage73Direction).toBe('Stage 73: Resolve Evidence Gap');
  });

  it('builds a complete report and selects exactly one Stage 73 direction', () => {
    const report = buildStage72Report({
      edgeMix1RunDir: 'edge1',
      edgeMix2RunDir: 'edge2',
      stage65ReportPath: 'stage65.json',
      stage66ReportPath: 'stage66.json',
      stage71ReportPath: 'stage71.json',
      edgeMix1Rows: [
        row({ id: 'v1-high', score: 95, grade: 'A' }),
        row({
          id: 'v1-4145',
          score: 78,
          grade: 'C',
          categories: { alt_text: 20 },
          tools: [{ toolName: 'set_figure_alt_text', outcome: 'no_effect' }],
        }),
      ],
      edgeMix2Rows: [
        row({ id: 'v1-high2', score: 91, grade: 'A' }),
        row({ id: 'v1-3479', score: 52, grade: 'F', categories: { heading_structure: 0 } }),
      ],
      stage65Report: {
        rows: [
          stage65('v1-4145', 'stable_structural_residual', 'figure_alt'),
          stage65('v1-3479', 'manual_scanned_debt', 'manual_scanned'),
        ],
      },
      stage66Report: { rows: [stage66('v1-3479', 'policy_debt', 'manual_scanned_or_policy_debt')] },
      generatedAt: '2026-04-25T00:00:00.000Z',
    });
    expect(report.rows).toHaveLength(2);
    expect(report.selectedStage73Direction).toBe('Stage 73: Single-Row Stable Cleanup plus End-Gate Target Revisit');
    expect(Object.values(report.classDistribution).reduce((sum, count) => sum + count, 0)).toBe(2);
  });
});
