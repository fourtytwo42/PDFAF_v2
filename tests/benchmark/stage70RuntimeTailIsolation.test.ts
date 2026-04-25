import { describe, expect, it } from 'vitest';
import {
  buildRowReport,
  buildStage70Report,
  repeatedNoGainPatterns,
  type BenchmarkRow,
} from '../../scripts/stage70-runtime-tail-isolation.js';

function row(input: {
  id: string;
  score: number;
  wall?: number;
  categories?: Record<string, number>;
  tools?: Array<{
    toolName: string;
    outcome: string;
    durationMs?: number;
    scoreBefore?: number;
    scoreAfter?: number;
    note?: string;
    targetRef?: string;
    state?: string;
  }>;
}): BenchmarkRow {
  return {
    id: input.id,
    file: `${input.id}.pdf`,
    afterScore: input.score,
    afterGrade: input.score >= 90 ? 'A' : input.score >= 80 ? 'B' : input.score >= 70 ? 'C' : input.score >= 60 ? 'D' : 'F',
    wallRemediateMs: input.wall ?? 1000,
    afterCategories: Object.entries(input.categories ?? {}).map(([key, score]) => ({ key, score })),
    appliedTools: (input.tools ?? []).map(tool => ({
      toolName: tool.toolName,
      outcome: tool.outcome,
      durationMs: tool.durationMs,
      scoreBefore: tool.scoreBefore ?? input.score,
      scoreAfter: tool.scoreAfter ?? input.score,
      details: JSON.stringify({
        note: tool.note,
        invariants: { targetRef: tool.targetRef },
        debug: { replayState: { stateSignatureBefore: tool.state, targetRef: tool.targetRef } },
      }),
    })),
  };
}

describe('Stage 70 runtime tail isolation', () => {
  it('detects repeated no-gain same-state tool tails', () => {
    const report = buildRowReport(
      'long-4516',
      row({ id: 'long-4516', score: 89, wall: 10_000 }),
      row({
        id: 'long-4516',
        score: 87,
        wall: 40_000,
        tools: [
          { toolName: 'set_figure_alt_text', outcome: 'rejected', durationMs: 3000, note: 'figure_stage_regressed_without_alt_improvement(58)', state: 'same' },
          { toolName: 'set_figure_alt_text', outcome: 'rejected', durationMs: 3500, note: 'figure_stage_regressed_without_alt_improvement(58)', state: 'same' },
        ],
      }),
    );
    expect(report.class).toBe('no_gain_repeated_tool_tail');
    expect(report.repeatedNoGainPatterns[0]).toMatchObject({
      count: 2,
      totalDurationMs: 6500,
      tools: ['set_figure_alt_text'],
      stateSignatureBefore: 'same',
    });
  });

  it('separates quality-gain runtime tradeoffs from no-gain suppression candidates', () => {
    const report = buildRowReport(
      'long-4683',
      row({ id: 'long-4683', score: 86, wall: 10_000 }),
      row({
        id: 'long-4683',
        score: 94,
        wall: 30_000,
        tools: [
          { toolName: 'set_figure_alt_text', outcome: 'applied', durationMs: 8000, note: 'figure_alt_set', targetRef: '10_0', state: 'a', scoreBefore: 86, scoreAfter: 94 },
        ],
      }),
    );
    expect(report.class).toBe('quality_gain_runtime_tradeoff');
  });

  it('classifies protected Teams runtime rows separately', () => {
    const report = buildRowReport(
      'fixture-teams-targeted-wave1',
      row({ id: 'fixture-teams-targeted-wave1', score: 100, wall: 10_000 }),
      row({
        id: 'fixture-teams-targeted-wave1',
        score: 96,
        wall: 70_000,
        tools: [
          { toolName: 'set_figure_alt_text', outcome: 'applied', durationMs: 5000, note: 'figure_alt_set', targetRef: '10_0', state: 'a' },
        ],
      }),
    );
    expect(report.class).toBe('known_protected_runtime_tail');
  });

  it('fails closed when duration details are missing', () => {
    const report = buildRowReport(
      'figure-4702',
      row({ id: 'figure-4702', score: 87, wall: 10_000 }),
      row({
        id: 'figure-4702',
        score: 87,
        wall: 30_000,
        tools: [
          { toolName: 'canonicalize_figure_alt_ownership', outcome: 'no_effect', note: 'no_structural_change', state: 'a' },
        ],
      }),
    );
    expect(report.class).toBe('inconclusive_missing_duration_detail');
  });

  it('selects a narrow runtime guard only when a repeated no-gain row exists', () => {
    const stage45 = new Map([
      ['long-4516', row({ id: 'long-4516', score: 89, wall: 10_000 })],
      ['long-4683', row({ id: 'long-4683', score: 86, wall: 10_000 })],
    ]);
    const stage69 = new Map([
      ['long-4516', row({
        id: 'long-4516',
        score: 87,
        wall: 40_000,
        tools: [
          { toolName: 'set_figure_alt_text', outcome: 'rejected', durationMs: 3000, note: 'same_failure', state: 'same' },
          { toolName: 'set_figure_alt_text', outcome: 'rejected', durationMs: 3000, note: 'same_failure', state: 'same' },
        ],
      })],
      ['long-4683', row({
        id: 'long-4683',
        score: 94,
        wall: 30_000,
        tools: [
          { toolName: 'set_figure_alt_text', outcome: 'applied', durationMs: 8000, note: 'figure_alt_set', state: 'gain', scoreBefore: 86, scoreAfter: 94 },
        ],
      })],
    ]);
    const report = buildStage70Report({
      stage45RunDir: 'stage45',
      stage69RunDir: 'stage69',
      stage45Rows: stage45,
      stage69Rows: stage69,
      ids: ['long-4516', 'long-4683'],
      generatedAt: '2026-04-25T00:00:00.000Z',
    });
    expect(report.decision.status).toBe('implement_narrow_runtime_guard');
    expect(report.classificationDistribution.no_gain_repeated_tool_tail).toBe(1);
  });

  it('groups repeated no-gain patterns by state, tool, outcome, note, and target', () => {
    const patterns = repeatedNoGainPatterns([
      {
        index: 1,
        toolName: 'set_figure_alt_text',
        outcome: 'rejected',
        stage: 6,
        round: 1,
        source: 'planner',
        durationMs: 2000,
        scoreBefore: 80,
        scoreAfter: 80,
        targetRef: '10_0',
        stateSignatureBefore: 'a',
        note: 'same',
        noGain: true,
      },
      {
        index: 2,
        toolName: 'set_figure_alt_text',
        outcome: 'rejected',
        stage: 6,
        round: 1,
        source: 'planner',
        durationMs: 2500,
        scoreBefore: 80,
        scoreAfter: 80,
        targetRef: '11_0',
        stateSignatureBefore: 'a',
        note: 'same',
        noGain: true,
      },
    ]);
    expect(patterns).toHaveLength(0);
  });
});
