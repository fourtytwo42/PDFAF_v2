import { describe, expect, it } from 'vitest';
import { buildStage53Report } from '../../scripts/stage53-edge-mix-volatility.js';

function tool(input: {
  toolName: string;
  outcome: string;
  note?: string;
  stage?: number;
  round?: number;
  scoreBefore?: number;
  scoreAfter?: number;
}) {
  return {
    toolName: input.toolName,
    outcome: input.outcome,
    stage: input.stage ?? 1,
    round: input.round ?? 1,
    scoreBefore: input.scoreBefore ?? 80,
    scoreAfter: input.scoreAfter ?? 80,
    details: input.note ? JSON.stringify({ note: input.note, invariants: { targetRef: '12_0' } }) : undefined,
  };
}

function row(input: {
  id: string;
  score: number;
  grade?: string;
  categories?: Record<string, number>;
  tools?: ReturnType<typeof tool>[];
  parity?: Record<string, unknown>;
}) {
  return {
    id: input.id,
    file: `${input.id}.pdf`,
    afterScore: input.score,
    afterGrade: input.grade ?? 'B',
    afterCategories: Object.entries(input.categories ?? { heading_structure: 100, alt_text: 100 })
      .map(([key, score]) => ({ key, score })),
    appliedTools: input.tools ?? [],
    finalAdjustments: input.parity
      ? [{ kind: 'final_hidden_heading_parity', ...input.parity }]
      : undefined,
    falsePositiveAppliedCount: 0,
    wallRemediateMs: 1000,
  };
}

function run(label: string, rows: Array<ReturnType<typeof row>>) {
  return {
    label,
    runDir: label,
    rows: new Map(rows.map(item => [item.id, item])),
  };
}

describe('Stage 53 edge-mix volatility diagnostic', () => {
  it('detects first accepted-tool divergence before final parity', () => {
    const report = buildStage53Report({
      runs: [
        run('base', [
          row({ id: 'v1-4683', score: 86, tools: [tool({ toolName: 'set_document_title', outcome: 'applied' })] }),
          row({ id: 'v1-4139', score: 59, tools: [tool({ toolName: 'set_document_title', outcome: 'applied' })] }),
        ]),
        run('candidate', [
          row({ id: 'v1-4683', score: 79, tools: [
            tool({ toolName: 'set_document_title', outcome: 'applied' }),
            tool({ toolName: 'set_figure_alt_text', outcome: 'applied', note: 'attached_alt' }),
          ] }),
          row({ id: 'v1-4139', score: 54, tools: [
            tool({ toolName: 'set_document_title', outcome: 'applied' }),
            tool({ toolName: 'set_figure_alt_text', outcome: 'applied', note: 'attached_alt' }),
          ] }),
        ]),
      ],
      focusIds: ['v1-4683', 'v1-4139'],
      controlIds: [],
      generatedAt: '2026-04-24T00:00:00.000Z',
    });
    const comparison = report.rows[0]!.pairComparisons[0]!;
    expect(comparison.divergencePhase).toBe('remediation_tool_sequence');
    expect(comparison.firstDivergentAcceptedTool?.candidate?.toolName).toBe('set_figure_alt_text');
    expect(report.decision.status).toBe('deterministic_fix_candidate');
  });

  it('detects first rejected/no-effect divergence', () => {
    const report = buildStage53Report({
      runs: [
        run('base', [row({ id: 'v1-4139', score: 59, tools: [tool({ toolName: 'normalize_heading_hierarchy', outcome: 'no_effect', note: 'no_structural_change' })] })]),
        run('candidate', [row({ id: 'v1-4139', score: 54, tools: [tool({ toolName: 'normalize_heading_hierarchy', outcome: 'no_effect', note: 'multiple_h1_after_mutation' })] })]),
      ],
      focusIds: ['v1-4139'],
      controlIds: [],
    });
    const comparison = report.rows[0]!.pairComparisons[0]!;
    expect(comparison.divergencePhase).toBe('remediation_tool_sequence');
    expect(comparison.firstDivergentRejectedTool?.candidate?.note).toBe('multiple_h1_after_mutation');
  });

  it('classifies final-only parity differences separately from mutator divergence', () => {
    const report = buildStage53Report({
      runs: [
        run('base', [row({ id: 'v1-4215', score: 59 })]),
        run('candidate', [row({
          id: 'v1-4215',
          score: 91,
          parity: {
            status: 'applied',
            reason: 'structured_root_reachable_heading_evidence_final_only',
            evidenceCount: 105,
            sourceTool: 'normalize_heading_hierarchy',
            scoreBefore: 59,
            scoreAfter: 91,
          },
        })]),
      ],
      focusIds: ['v1-4215'],
      controlIds: [],
    });
    expect(report.rows[0]!.pairComparisons[0]!.divergencePhase).toBe('final_hidden_heading_parity');
    expect(report.rows[0]!.likelyCause).toBe('final_parity_only_difference');
  });

  it('handles missing rows deterministically', () => {
    const report = buildStage53Report({
      runs: [
        run('base', [row({ id: 'v1-4567', score: 59 })]),
        run('candidate', []),
      ],
      focusIds: ['v1-4567'],
      controlIds: [],
    });
    expect(report.rows[0]!.pairComparisons[0]!.divergencePhase).toBe('missing_row');
  });

  it('reports stable controls as unchanged', () => {
    const report = buildStage53Report({
      runs: [
        run('base', [row({ id: 'v1-4751', score: 97, grade: 'A' })]),
        run('candidate', [row({ id: 'v1-4751', score: 97, grade: 'A' })]),
      ],
      focusIds: [],
      controlIds: ['v1-4751'],
    });
    expect(report.rows[0]!.role).toBe('control');
    expect(report.rows[0]!.likelyCause).toBe('stable');
    expect(report.rows[0]!.pairComparisons[0]!.divergencePhase).toBe('none');
  });
});
