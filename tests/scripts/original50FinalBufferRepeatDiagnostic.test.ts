import { describe, expect, it } from 'vitest';
import { classifyFinalBufferRow } from '../../scripts/original50-final-buffer-repeat-diagnostic.js';

function repeat(index: number, score: number | null, ok = true) {
  return {
    index,
    ok,
    error: ok ? null : 'analysis failed',
    score,
    grade: typeof score === 'number' && score >= 90 ? 'A' : 'F',
    wallMs: 100,
    analysisDurationMs: 100,
    categories: {},
    detectionSignals: {},
    snapshotSignals: {},
  };
}

describe('original50 final buffer repeat diagnostic classifier', () => {
  it('classifies preserved target after-states', () => {
    const result = classifyFinalBufferRow({
      targetScore: 93,
      beforeScore: 43,
      afterScore: 94,
      finalRepeats: [repeat(1, 94), repeat(2, 94), repeat(3, 94)],
    });

    expect(result.classification).toBe('after_state_preserved_by_final_buffer');
  });

  it('classifies target after-states that final buffer cannot reproduce', () => {
    const result = classifyFinalBufferRow({
      targetScore: 93,
      beforeScore: 43,
      afterScore: 94,
      finalRepeats: [repeat(1, 89), repeat(2, 89), repeat(3, 89)],
    });

    expect(result.classification).toBe('after_state_not_reproducible_from_final_buffer');
  });

  it('classifies repeated final-buffer score volatility first', () => {
    const result = classifyFinalBufferRow({
      targetScore: 93,
      beforeScore: 43,
      afterScore: 89,
      finalRepeats: [repeat(1, 89), repeat(2, 89), repeat(3, 62)],
    });

    expect(result.classification).toBe('final_buffer_reanalysis_volatile');
  });

  it('classifies stable low after and final states', () => {
    const result = classifyFinalBufferRow({
      targetScore: 93,
      beforeScore: 59,
      afterScore: 59,
      finalRepeats: [repeat(1, 59), repeat(2, 59), repeat(3, 59)],
    });

    expect(result.classification).toBe('stable_low_after_and_final');
  });

  it('classifies final-buffer route recovery', () => {
    const result = classifyFinalBufferRow({
      targetScore: 93,
      beforeScore: 59,
      afterScore: 59,
      finalRepeats: [repeat(1, 94), repeat(2, 94), repeat(3, 94)],
    });

    expect(result.classification).toBe('final_reanalysis_recovers_route');
  });

  it('classifies analysis failures', () => {
    const result = classifyFinalBufferRow({
      targetScore: 93,
      beforeScore: 59,
      afterScore: 59,
      finalRepeats: [repeat(1, null, false)],
    });

    expect(result.classification).toBe('runtime_or_analysis_error');
  });
});
