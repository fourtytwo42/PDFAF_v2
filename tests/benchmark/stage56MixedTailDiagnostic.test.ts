import { describe, expect, it } from 'vitest';
import {
  buildStage56Report,
  classifyStage56Pair,
  type Stage56TimelineEntry,
} from '../../scripts/stage56-mixed-tail-diagnostic.js';

function entry(input: Partial<Stage56TimelineEntry> = {}): Stage56TimelineEntry {
  const hasBefore = Object.prototype.hasOwnProperty.call(input, 'stateSignatureBefore');
  return {
    index: input.index ?? 0,
    toolName: input.toolName ?? 'set_document_language',
    outcome: input.outcome ?? 'rejected',
    stage: input.stage ?? 1,
    round: input.round ?? 1,
    source: input.source ?? 'planner',
    note: input.note ?? null,
    stateSignatureBefore: hasBefore ? input.stateSignatureBefore! : 'state-a',
    stateSignatureAfter: input.stateSignatureAfter ?? 'state-b',
    categoryScoresBefore: input.categoryScoresBefore ?? { alt_text: 0, table_markup: 100 },
    categoryScoresAfter: input.categoryScoresAfter ?? { alt_text: 0, table_markup: 100 },
    detectionSignalsBefore: input.detectionSignalsBefore ?? { checkerVisibleFigureCount: 2 },
    detectionSignalsAfter: input.detectionSignalsAfter ?? { checkerVisibleFigureCount: 2 },
  };
}

function tool(input: {
  toolName?: string;
  outcome?: string;
  state?: string | null;
  categories?: Record<string, number>;
  signals?: Record<string, unknown>;
}) {
  const replayState = input.state === null
    ? {}
    : {
        stateSignatureBefore: input.state ?? 'state-a',
        stateSignatureAfter: `${input.state ?? 'state-a'}-after`,
        categoryScoresBefore: input.categories ?? { alt_text: 0, table_markup: 100 },
        categoryScoresAfter: input.categories ?? { alt_text: 0, table_markup: 100 },
        detectionSignalsBefore: input.signals ?? { checkerVisibleFigureCount: 2 },
        detectionSignalsAfter: input.signals ?? { checkerVisibleFigureCount: 2 },
      };
  return {
    toolName: input.toolName ?? 'set_document_language',
    outcome: input.outcome ?? 'rejected',
    stage: 1,
    round: 1,
    source: 'planner',
    details: JSON.stringify({ debug: { replayState } }),
  };
}

function row(input: {
  id: string;
  score: number;
  grade?: string;
  categories?: Record<string, number>;
  signals?: Record<string, unknown>;
  tools?: ReturnType<typeof tool>[];
  parity?: Record<string, unknown>;
}) {
  return {
    id: input.id,
    file: `${input.id}.pdf`,
    afterScore: input.score,
    afterGrade: input.grade ?? 'F',
    afterCategories: Object.entries(input.categories ?? { alt_text: 0, table_markup: 100 }).map(([key, score]) => ({
      key,
      score,
      applicable: true,
    })),
    afterDetectionProfile: {
      figureSignals: {
        extractedFigureCount: input.signals?.extractedFigureCount ?? input.signals?.checkerVisibleFigureCount ?? 2,
        treeFigureCount: input.signals?.treeFigureCount ?? 2,
      },
      tableSignals: {
        directCellUnderTableCount: input.signals?.directCellUnderTableCount ?? 0,
        malformedTableCount: input.signals?.malformedTableCount ?? 0,
      },
    },
    appliedTools: input.tools ?? [],
    finalAdjustments: input.parity ? [{ kind: 'final_hidden_heading_parity', ...input.parity }] : undefined,
  };
}

function run(label: string, rows: Array<ReturnType<typeof row>>) {
  return {
    label,
    runDir: label,
    rows: new Map(rows.map(item => [item.id, item])),
  };
}

describe('Stage 56 mixed-tail diagnostic', () => {
  it('classifies initial analysis variance when the first tool starts from different states', () => {
    const result = classifyStage56Pair({
      firstDivergentIndex: 0,
      baselineEntry: entry({ stateSignatureBefore: 'state-a' }),
      candidateEntry: entry({ stateSignatureBefore: 'state-b' }),
      structuralFamily: 'mixed_figure_table_alt_or_metadata',
    });
    expect(result).toEqual({
      classification: 'initial_analysis_variance',
      reason: 'first_tool_starts_from_different_replay_state',
    });
  });

  it('classifies same-state next-tool drift as ordering debt', () => {
    const result = classifyStage56Pair({
      firstDivergentIndex: 3,
      baselineEntry: entry({ toolName: 'retag_as_figure', stateSignatureBefore: 'same' }),
      candidateEntry: entry({ toolName: 'set_figure_alt_text', stateSignatureBefore: 'same' }),
    });
    expect(result.classification).toBe('deterministic_candidate_ordering_drift');
  });

  it('fails closed when replay state is missing', () => {
    const result = classifyStage56Pair({
      firstDivergentIndex: 1,
      baselineEntry: entry({ stateSignatureBefore: null }),
      candidateEntry: entry({ stateSignatureBefore: 'state-b' }),
    });
    expect(result.classification).toBe('inconclusive_missing_replay_state');
  });

  it('reports mixed figure/table/alt residuals without treating rejected tools as success', () => {
    const report = buildStage56Report({
      runs: [
        run('r1', [row({
          id: 'v1-4683',
          score: 59,
          categories: { alt_text: 0, table_markup: 35, heading_structure: 78 },
          signals: { checkerVisibleFigureCount: 2, directCellUnderTableCount: 4 },
          tools: [tool({
            toolName: 'set_document_language',
            outcome: 'rejected',
            state: 'state-a',
            categories: { alt_text: 0, table_markup: 35 },
            signals: { checkerVisibleFigureCount: 2, directCellUnderTableCount: 4 },
          })],
        })]),
        run('r2', [row({
          id: 'v1-4683',
          score: 92,
          grade: 'A',
          categories: { alt_text: 100, table_markup: 100, heading_structure: 78 },
          signals: { checkerVisibleFigureCount: 2 },
          tools: [tool({
            toolName: 'set_document_language',
            outcome: 'rejected',
            state: 'state-b',
            categories: { alt_text: 100, table_markup: 100 },
            signals: { checkerVisibleFigureCount: 2 },
          })],
        })]),
      ],
      focusIds: ['v1-4683'],
      controlIds: [],
      generatedAt: '2026-04-24T00:00:00.000Z',
    });

    const rowSummary = report.rows[0]!;
    expect(rowSummary.finalResidualFamiliesByRun.r1).toContain('mixed_tail');
    expect(rowSummary.pairSummaries[0]!.classification).toBe('initial_analysis_variance');
    expect(rowSummary.pairSummaries[0]!.baselineEntry?.outcome).toBe('rejected');
    expect(report.decision.status).toBe('analysis_determinism_candidate');
  });

  it('separates final hidden-heading parity from mutator divergence', () => {
    const report = buildStage56Report({
      runs: [
        run('r1', [row({ id: 'v1-4215', score: 59 })]),
        run('r2', [row({ id: 'v1-4215', score: 94, grade: 'A', parity: { status: 'applied' } })]),
      ],
      focusIds: ['v1-4215'],
      controlIds: [],
      generatedAt: '2026-04-24T00:00:00.000Z',
    });

    expect(report.rows[0]!.pairSummaries[0]!.classification).toBe('final_parity_only');
  });
});
