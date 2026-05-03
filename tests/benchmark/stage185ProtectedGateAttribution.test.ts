import { describe, expect, it } from 'vitest';
import {
  classifyStage185ProtectedAttribution,
  type Stage185AttributionInput,
} from '../../scripts/stage185-protected-gate-attribution.js';

function input(overrides: Partial<Stage185AttributionInput> = {}): Stage185AttributionInput {
  return {
    id: 'short-4176',
    stage182Classification: 'stable_below_floor_no_safe_state',
    knownVolatility: true,
    targetAcceptedStage184HeadingNormalization: false,
    targetRejectedOrNoEffectStage184HeadingNormalization: true,
    targetAfterScore: 79,
    targetReanalyzedScore: 79,
    stage183EffectiveScore: 91,
    stage184EffectiveScore: 79,
    protectedFloorScore: 89,
    acceptedCleanupHarmCount: 0,
    ...overrides,
  };
}

describe('Stage 185 protected gate attribution classifier', () => {
  it('preserves actionable safe checkpoint classifications from repeat evidence', () => {
    expect(classifyStage185ProtectedAttribution(input({
      stage182Classification: 'safe_checkpoint_available',
    }))).toMatchObject({
      classification: 'safe_checkpoint_available',
    });
  });

  it('preserves actionable same-buffer floor-safe repeat classifications', () => {
    expect(classifyStage185ProtectedAttribution(input({
      stage182Classification: 'same_buffer_floor_safe_repeat_available',
    }))).toMatchObject({
      classification: 'same_buffer_floor_safe_repeat_available',
    });
  });

  it('parks known volatile rows when Stage184 heading normalization was not accepted', () => {
    expect(classifyStage185ProtectedAttribution(input())).toMatchObject({
      classification: 'stage184_unrelated_known_volatility',
    });
  });

  it('does not call a row unrelated when Stage184 heading normalization was accepted', () => {
    expect(classifyStage185ProtectedAttribution(input({
      targetAcceptedStage184HeadingNormalization: true,
      targetRejectedOrNoEffectStage184HeadingNormalization: false,
    }))).toMatchObject({
      classification: 'stable_below_floor_no_safe_state',
    });
  });

  it('preserves accepted cleanup harm as behavior evidence', () => {
    expect(classifyStage185ProtectedAttribution(input({
      stage182Classification: 'accepted_cleanup_harm',
      acceptedCleanupHarmCount: 1,
    }))).toMatchObject({
      classification: 'accepted_cleanup_harm',
    });
  });
});
