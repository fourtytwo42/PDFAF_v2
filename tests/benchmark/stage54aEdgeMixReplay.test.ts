import { describe, expect, it } from 'vitest';
import { buildStage54aReport, classifyReplayDivergence, type Stage54aTimelineEntry } from '../../scripts/stage54a-edge-mix-replay.js';

function entry(input: Partial<Stage54aTimelineEntry> = {}): Stage54aTimelineEntry {
  const hasState = Object.prototype.hasOwnProperty.call(input, 'stateSignatureBefore');
  return {
    index: input.index ?? 0,
    toolName: input.toolName ?? 'set_document_language',
    stage: input.stage ?? 1,
    round: input.round ?? 1,
    source: input.source ?? 'planner',
    outcome: input.outcome ?? 'applied',
    scoreBefore: input.scoreBefore ?? 80,
    scoreAfter: input.scoreAfter ?? 80,
    categoryBefore: input.categoryBefore ?? {},
    categoryAfter: input.categoryAfter ?? {},
    note: input.note ?? null,
    invariants: input.invariants ?? {},
    structuralBenefits: input.structuralBenefits ?? {},
    targetRef: input.targetRef ?? null,
    stateSignatureBefore: hasState ? input.stateSignatureBefore! : 'state-a',
  };
}

function tool(input: {
  toolName: string;
  outcome: string;
  note?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  state?: string;
}) {
  return {
    toolName: input.toolName,
    outcome: input.outcome,
    stage: 1,
    round: 1,
    source: 'planner',
    scoreBefore: input.scoreBefore ?? 80,
    scoreAfter: input.scoreAfter ?? 80,
    details: JSON.stringify({
      note: input.note,
      debug: input.state ? { runtimeTailStateSignature: input.state } : {},
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
    afterGrade: input.score >= 90 ? 'A' : input.score >= 80 ? 'B' : 'F',
    afterCategories: [{ key: 'heading_structure', score: input.score }],
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

describe('Stage 54A edge-mix mutator replay', () => {
  it('classifies same-state different accept/reject decision', () => {
    const result = classifyReplayDivergence({
      baseline: entry({ outcome: 'rejected', stateSignatureBefore: 'same-state' }),
      candidate: entry({ outcome: 'applied', stateSignatureBefore: 'same-state' }),
    });
    expect(result).toEqual({
      divergenceClass: 'same_state_different_decision',
      reason: 'same_state_same_tool_different_outcome',
    });
  });

  it('classifies same tool reached from a different pre-tool state', () => {
    const result = classifyReplayDivergence({
      baseline: entry({ toolName: 'remap_orphan_mcids_as_artifacts', stateSignatureBefore: 'a' }),
      candidate: entry({ toolName: 'remap_orphan_mcids_as_artifacts', stateSignatureBefore: 'b' }),
    });
    expect(result.divergenceClass).toBe('different_state_same_tool');
  });

  it('separates final hidden-heading parity from mutator divergence', () => {
    const result = classifyReplayDivergence({
      baseline: null,
      candidate: null,
      baselineFinalParity: 'missing',
      candidateFinalParity: 'applied',
    });
    expect(result.divergenceClass).toBe('final_parity_only');
  });

  it('fails closed when state signatures are missing', () => {
    const result = classifyReplayDivergence({
      baseline: entry({ stateSignatureBefore: null }),
      candidate: entry({ stateSignatureBefore: 'b' }),
    });
    expect(result.divergenceClass).toBe('inconclusive_missing_state');
  });

  it('does not recommend suppression for different upstream paths', () => {
    const report = buildStage54aReport({
      runs: [
        run('base', [row({
          id: 'v1-4683',
          score: 86,
          tools: [tool({ toolName: 'remap_orphan_mcids_as_artifacts', outcome: 'rejected', state: 'before-a' })],
        })]),
        run('candidate', [row({
          id: 'v1-4683',
          score: 79,
          tools: [tool({ toolName: 'remap_orphan_mcids_as_artifacts', outcome: 'applied', state: 'before-b' })],
        })]),
      ],
      focusIds: ['v1-4683'],
      controlIds: [],
      generatedAt: '2026-04-24T00:00:00.000Z',
    });
    expect(report.rows[0]!.pairReplays[0]!.divergenceClass).toBe('different_state_same_tool');
    expect(report.decision.status).toBe('diagnostic_only');
  });

  it('uses Stage 54B replayState signatures from tool details', () => {
    const report = buildStage54aReport({
      runs: [
        run('base', [row({
          id: 'v1-4683',
          score: 86,
          tools: [{
            toolName: 'set_document_language',
            outcome: 'rejected',
            stage: 1,
            round: 1,
            source: 'planner',
            scoreBefore: 80,
            scoreAfter: 80,
            details: JSON.stringify({
              debug: {
                replayState: {
                  stateSignatureBefore: 'replay-before-a',
                  categoryScoresBefore: { alt_text: 20 },
                },
              },
            }),
          }],
        })]),
        run('candidate', [row({
          id: 'v1-4683',
          score: 79,
          tools: [{
            toolName: 'set_document_language',
            outcome: 'applied',
            stage: 1,
            round: 1,
            source: 'planner',
            scoreBefore: 80,
            scoreAfter: 81,
            details: JSON.stringify({
              debug: {
                replayState: {
                  stateSignatureBefore: 'replay-before-a',
                  categoryScoresBefore: { alt_text: 20 },
                },
              },
            }),
          }],
        })]),
      ],
      focusIds: ['v1-4683'],
      controlIds: [],
      generatedAt: '2026-04-24T00:00:00.000Z',
    });

    expect(report.rows[0]!.pairReplays[0]!.baselineEntry?.stateSignatureBefore).toBe('replay-before-a');
    expect(report.rows[0]!.pairReplays[0]!.divergenceClass).toBe('same_state_different_decision');
  });
});
