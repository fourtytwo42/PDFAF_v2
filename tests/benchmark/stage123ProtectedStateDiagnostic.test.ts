import { describe, expect, it } from 'vitest';
import { classifyStage123Checkpoint } from '../../scripts/stage123-protected-state-diagnostic.js';

const rawStable = [
  { signature: 'raw-a' },
  { signature: 'raw-a' },
];

describe('classifyStage123Checkpoint', () => {
  it('selects external floor-safe checkpoints', () => {
    const result = classifyStage123Checkpoint({
      floorScore: 87,
      inRunScore: 87,
      externalRepeats: [
        { score: 69, protectedUnsafeReason: 'protected_baseline_floor(69<87)' },
        { score: 90, protectedUnsafeReason: null },
      ],
      rawRepeats: rawStable,
    });

    expect(result.classification).toBe('external_floor_safe_checkpoint');
  });

  it('classifies floor-looking in-run states that are externally below floor', () => {
    const result = classifyStage123Checkpoint({
      floorScore: 87,
      inRunScore: 87,
      externalRepeats: [
        { score: 69, protectedUnsafeReason: 'protected_baseline_floor(69<87)' },
        { score: 69, protectedUnsafeReason: 'protected_baseline_floor(69<87)' },
      ],
      rawRepeats: rawStable,
    });

    expect(result.classification).toBe('in_run_only_score_artifact');
  });

  it('classifies raw Python structural signature changes', () => {
    const result = classifyStage123Checkpoint({
      floorScore: 87,
      inRunScore: 70,
      externalRepeats: [
        { score: 69, protectedUnsafeReason: 'protected_baseline_floor(69<87)' },
        { score: 69, protectedUnsafeReason: 'protected_baseline_floor(69<87)' },
      ],
      rawRepeats: [
        { signature: 'raw-a' },
        { signature: 'raw-b' },
      ],
    });

    expect(result.classification).toBe('python_structural_mismatch');
  });

  it('classifies TypeScript scoring variance when raw Python is stable', () => {
    const result = classifyStage123Checkpoint({
      floorScore: 87,
      inRunScore: 70,
      externalRepeats: [
        { score: 69, protectedUnsafeReason: 'protected_baseline_floor(69<87)' },
        { score: 80, protectedUnsafeReason: 'protected_baseline_floor(80<87)' },
      ],
      rawRepeats: rawStable,
    });

    expect(result.classification).toBe('typescript_scoring_mismatch');
  });

  it('classifies stable below-floor checkpoints with no safe state', () => {
    const result = classifyStage123Checkpoint({
      floorScore: 87,
      inRunScore: 69,
      externalRepeats: [
        { score: 69, protectedUnsafeReason: 'protected_baseline_floor(69<87)' },
        { score: 69, protectedUnsafeReason: 'protected_baseline_floor(69<87)' },
      ],
      rawRepeats: rawStable,
    });

    expect(result.classification).toBe('stable_below_floor_no_safe_state');
  });
});
