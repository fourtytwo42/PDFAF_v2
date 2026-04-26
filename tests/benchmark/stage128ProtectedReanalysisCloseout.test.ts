import { describe, expect, it } from 'vitest';
import {
  classifyStage128Row,
  type Stage128ExternalRepeat,
  type Stage128RawRepeat,
} from '../../scripts/stage128-protected-reanalysis-closeout.js';

function external(repeat: number, score: number, safe = score >= 87): Stage128ExternalRepeat {
  return {
    repeat,
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : 'F',
    protectedUnsafeReason: safe ? null : `protected_baseline_floor(${score}<87)`,
    categories: { heading_structure: score },
  };
}

function raw(repeat: number, signature: string): Stage128RawRepeat {
  return {
    repeat,
    signature,
    familySignatures: { headings: signature },
    familyCounts: { headings: 1 },
  };
}

describe('classifyStage128Row', () => {
  it('selects same-buffer floor-safe final repeats first', () => {
    const result = classifyStage128Row({
      floorScore: 87,
      targetAfterScore: 98,
      finalRepeats: [external(1, 61, false), external(2, 91, true)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'b')],
      checkpoints: [],
    });

    expect(result.classification).toBe('same_buffer_floor_safe_repeat_available');
  });

  it('selects safe checkpoints when final repeats are unsafe', () => {
    const result = classifyStage128Row({
      floorScore: 87,
      targetAfterScore: 98,
      finalRepeats: [external(1, 61, false), external(2, 61, false)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'a')],
      checkpoints: [{ externalRepeats: [external(1, 93, true)], rawRepeats: [raw(1, 'c')] }],
    });

    expect(result.classification).toBe('safe_checkpoint_available');
  });

  it('classifies floor-unsafe same-buffer analyzer variance', () => {
    const result = classifyStage128Row({
      floorScore: 87,
      targetAfterScore: 98,
      finalRepeats: [external(1, 61, false), external(2, 69, false)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'b')],
      checkpoints: [],
    });

    expect(result.classification).toBe('same_buffer_analyzer_variance_floor_unsafe');
  });

  it('classifies deterministic route regression when in-run floor-safe final bytes are stably unsafe', () => {
    const result = classifyStage128Row({
      floorScore: 87,
      targetAfterScore: 98,
      finalRepeats: [external(1, 61, false), external(2, 61, false)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'a')],
      checkpoints: [],
    });

    expect(result.classification).toBe('deterministic_route_regression');
  });

  it('classifies stable below-floor rows with no safe state', () => {
    const result = classifyStage128Row({
      floorScore: 87,
      targetAfterScore: 61,
      finalRepeats: [external(1, 61, false), external(2, 61, false)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'a')],
      checkpoints: [],
    });

    expect(result.classification).toBe('stable_below_floor_no_safe_state');
  });
});
