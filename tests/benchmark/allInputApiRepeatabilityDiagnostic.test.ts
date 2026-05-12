import { describe, expect, it } from 'vitest';
import {
  classifyApiRepeatRow,
  type ApiRepeatRowRun,
} from '../../scripts/all-input-api-repeatability-diagnostic.js';

function run(input: {
  label: string;
  sourceScore?: number | null;
  gain?: number;
  tools?: Partial<ApiRepeatRowRun['tools'][number]>[];
}): ApiRepeatRowRun {
  return {
    label: input.label,
    jsonPath: `${input.label}.json`,
    sourceSummaryPath: `${input.label}/summary.json`,
    apiScore: input.sourceScore ?? null,
    apiGrade: null,
    sourceScore: input.sourceScore ?? null,
    sourceGrade: null,
    gain: input.gain ?? 0,
    tools: (input.tools ?? []).map((tool, index) => ({
      index,
      toolName: tool.toolName ?? 'repair_structure_conformance',
      outcome: tool.outcome ?? 'applied',
      scoreBefore: tool.scoreBefore ?? 59,
      scoreAfter: tool.scoreAfter ?? 91,
      stage: tool.stage ?? 2,
      replayStateBefore: tool.replayStateBefore ?? 'state',
      replayStateAfter: tool.replayStateAfter ?? 'after',
      reason: tool.reason ?? null,
    })),
  };
}

describe('all-input API repeatability diagnostic helpers', () => {
  it('counts repeat-supported recovery only when multiple runs improve', () => {
    const result = classifyApiRepeatRow({
      id: '0076',
      currentScore: 69,
      currentGrade: 'D',
      runs: [
        run({ label: 'first', sourceScore: 94, gain: 25 }),
        run({ label: 'repeat', sourceScore: 94, gain: 25 }),
      ],
    });

    expect(result.classification).toBe('repeat_supported_recovery');
    expect(result.repeatSupportedGain).toBe(25);
    expect(result.bestSourceGain).toBe(25);
  });

  it('classifies high-low source swings as upstream route volatility by default', () => {
    const result = classifyApiRepeatRow({
      id: '0075',
      currentScore: 59,
      currentGrade: 'F',
      runs: [
        run({ label: 'high', sourceScore: 93, gain: 34, tools: [
          { toolName: 'create_heading_from_candidate', outcome: 'applied', scoreBefore: 59, scoreAfter: 97, replayStateBefore: 'good' },
        ] }),
        run({ label: 'low', sourceScore: 59, gain: 0, tools: [
          { toolName: 'repair_alt_text_structure', outcome: 'applied', scoreBefore: 54, scoreAfter: 59, replayStateBefore: 'bad' },
        ] }),
      ],
    });

    expect(result.classification).toBe('upstream_route_volatility');
    expect(result.bestSourceGain).toBe(34);
    expect(result.repeatSupportedGain).toBe(0);
  });

  it('identifies same-state guard candidates when a high score-moving tool is rejected in a low run', () => {
    const result = classifyApiRepeatRow({
      id: '0108',
      currentScore: 79,
      currentGrade: 'C',
      runs: [
        run({ label: 'high', sourceScore: 91, gain: 12, tools: [
          { toolName: 'repair_native_link_structure', outcome: 'applied', scoreBefore: 69, scoreAfter: 93, replayStateBefore: 'shared' },
        ] }),
        run({ label: 'low', sourceScore: 59, gain: 0, tools: [
          { toolName: 'repair_native_link_structure', outcome: 'rejected', scoreBefore: 69, scoreAfter: 69, replayStateBefore: 'shared' },
        ] }),
      ],
    });

    expect(result.classification).toBe('same_state_guard_candidate');
    expect(result.sharedRejectedScoreMovingStates).toEqual(['repair_native_link_structure@shared']);
  });

  it('does not count API headline-only gains when source reanalysis is not improved', () => {
    const result = classifyApiRepeatRow({
      id: '0092',
      currentScore: 89,
      currentGrade: 'B',
      runs: [
        {
          ...run({ label: 'headline', sourceScore: 89, gain: 0 }),
          apiScore: 93,
        },
      ],
    });

    expect(result.classification).toBe('headline_only_not_source_counted');
    expect(result.repeatSupportedGain).toBe(0);
  });
});
