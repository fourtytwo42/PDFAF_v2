import { describe, expect, it } from 'vitest';
import { classifyStage130Row } from '../../scripts/stage130-protected-regression-closeout.js';
import type { Stage128ExternalRepeat, Stage128RawRepeat } from '../../scripts/stage128-protected-reanalysis-closeout.js';

function external(repeat: number, score: number, safe = score >= 89): Stage128ExternalRepeat {
  return {
    repeat,
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : 'F',
    protectedUnsafeReason: safe ? null : `protected_baseline_floor(${score}<89)`,
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

describe('classifyStage130Row', () => {
  it('keeps floor-safe final repeats as the first actionable outcome', () => {
    const result = classifyStage130Row({
      floorScore: 89,
      targetAfterScore: 80,
      finalRepeats: [external(1, 80, false), external(2, 91, true)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'b')],
      checkpoints: [],
    });

    expect(result.classification).toBe('same_buffer_floor_safe_repeat_available');
  });

  it('finds externally safe checkpoints when final bytes stay unsafe', () => {
    const result = classifyStage130Row({
      floorScore: 89,
      targetAfterScore: 80,
      finalRepeats: [external(1, 80, false), external(2, 80, false)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'a')],
      checkpoints: [{ externalRepeats: [external(1, 92, true)], rawRepeats: [raw(1, 'c')] }],
    });

    expect(result.classification).toBe('safe_checkpoint_available');
  });

  it('classifies stable unsafe in-run floor states as deterministic route regressions', () => {
    const result = classifyStage130Row({
      floorScore: 89,
      targetAfterScore: 91,
      finalRepeats: [external(1, 80, false), external(2, 80, false)],
      finalRawRepeats: [raw(1, 'a'), raw(2, 'a')],
      checkpoints: [],
    });

    expect(result.classification).toBe('deterministic_route_regression');
  });
});
