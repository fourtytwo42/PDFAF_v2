import { describe, expect, it } from 'vitest';
import {
  buildStage54cReport,
  classifyStage54cDivergence,
  type Stage54cTimelineEntry,
} from '../../scripts/stage54c-instrumented-replay-summary.js';

function entry(input: Partial<Stage54cTimelineEntry> = {}): Stage54cTimelineEntry {
  const hasBefore = Object.prototype.hasOwnProperty.call(input, 'stateSignatureBefore');
  return {
    index: input.index ?? 0,
    toolName: input.toolName ?? 'set_document_language',
    outcome: input.outcome ?? 'applied',
    stage: input.stage ?? 1,
    round: input.round ?? 1,
    source: input.source ?? 'planner',
    note: input.note ?? null,
    targetRef: input.targetRef ?? null,
    stateSignatureBefore: hasBefore ? input.stateSignatureBefore! : 'state-a',
    stateSignatureAfter: input.stateSignatureAfter ?? 'state-b',
    scoreBefore: input.scoreBefore ?? 80,
    scoreAfter: input.scoreAfter ?? 82,
    categoryScoresBefore: input.categoryScoresBefore ?? { reading_order: 90 },
    categoryScoresAfter: input.categoryScoresAfter ?? { reading_order: 90 },
    detectionSignalsBefore: input.detectionSignalsBefore ?? { orphanMcidCount: 0 },
    detectionSignalsAfter: input.detectionSignalsAfter ?? { orphanMcidCount: 0 },
  };
}

function tool(input: {
  toolName?: string;
  outcome?: string;
  note?: string;
  state?: string | null;
  categories?: Record<string, number>;
  signals?: Record<string, unknown>;
}) {
  const replayState = input.state === null
    ? {}
    : {
        stateSignatureBefore: input.state ?? 'state-a',
        stateSignatureAfter: `${input.state ?? 'state-a'}-after`,
        categoryScoresBefore: input.categories ?? { reading_order: 90 },
        detectionSignalsBefore: input.signals ?? { orphanMcidCount: 0 },
      };
  return {
    toolName: input.toolName ?? 'set_document_language',
    outcome: input.outcome ?? 'applied',
    stage: 1,
    round: 1,
    source: 'planner',
    scoreBefore: 80,
    scoreAfter: 82,
    details: JSON.stringify({
      note: input.note,
      debug: { replayState },
    }),
  };
}

function row(input: {
  id: string;
  score: number;
  tools?: ReturnType<typeof tool>[];
  parity?: Record<string, unknown>;
}) {
  return {
    id: input.id,
    file: `${input.id}.pdf`,
    afterScore: input.score,
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

describe('Stage 54C instrumented replay summary', () => {
  it('classifies same-state different decisions', () => {
    const result = classifyStage54cDivergence({
      baseline: entry({ outcome: 'rejected', stateSignatureBefore: 'same-state' }),
      candidate: entry({ outcome: 'applied', stateSignatureBefore: 'same-state' }),
    });
    expect(result).toEqual({
      divergenceClass: 'same_state_different_decision',
      reason: 'same_state_same_tool_different_outcome',
    });
  });

  it('classifies same-state different next tools as a tie-break candidate', () => {
    const result = classifyStage54cDivergence({
      baseline: entry({ toolName: 'set_document_language', stateSignatureBefore: 'same-state' }),
      candidate: entry({ toolName: 'create_heading_from_candidate', stateSignatureBefore: 'same-state' }),
    });
    expect(result).toEqual({
      divergenceClass: 'same_state_different_next_tool',
      reason: 'same_state_different_next_tool',
    });
  });

  it('reports first upstream state divergence with category and signal deltas', () => {
    const report = buildStage54cReport({
      runs: [
        run('r1', [row({
          id: 'v1-4683',
          score: 69,
          tools: [tool({
            toolName: 'normalize_heading_hierarchy',
            outcome: 'applied',
            state: 'before-a',
            categories: { reading_order: 100 },
            signals: { orphanMcidCount: 2 },
          })],
        })]),
        run('r2', [row({
          id: 'v1-4683',
          score: 69,
          tools: [tool({
            toolName: 'normalize_heading_hierarchy',
            outcome: 'rejected',
            state: 'before-b',
            categories: { reading_order: 96 },
            signals: { orphanMcidCount: 0 },
          })],
        })]),
      ],
      focusIds: ['v1-4683'],
      controlIds: [],
      generatedAt: '2026-04-24T00:00:00.000Z',
    });

    const pair = report.rows[0]!.pairSummaries[0]!;
    expect(pair.divergenceClass).toBe('different_upstream_state');
    expect(pair.divergenceFamily).toBe('heading');
    expect(pair.categoryBeforeDelta.reading_order).toEqual({ baseline: 100, candidate: 96, delta: -4 });
    expect(pair.detectionBeforeDelta.orphanMcidCount).toEqual({ baseline: 2, candidate: 0 });
    expect(report.decision.status).toBe('move_to_real_fixer');
  });

  it('treats final hidden-heading parity as post-remediation', () => {
    const report = buildStage54cReport({
      runs: [
        run('r1', [row({ id: 'v1-4215', score: 59 })]),
        run('r2', [row({ id: 'v1-4215', score: 91, parity: { status: 'applied' } })]),
      ],
      focusIds: ['v1-4215'],
      controlIds: [],
      generatedAt: '2026-04-24T00:00:00.000Z',
    });
    expect(report.rows[0]!.pairSummaries[0]!.divergenceClass).toBe('final_parity_only');
  });

  it('fails closed when replay state is missing', () => {
    const result = classifyStage54cDivergence({
      baseline: entry({ stateSignatureBefore: null }),
      candidate: entry({ stateSignatureBefore: 'state-b' }),
    });
    expect(result).toEqual({
      divergenceClass: 'inconclusive_missing_replay_state',
      reason: 'replay_state_signature_missing',
    });
  });
});
