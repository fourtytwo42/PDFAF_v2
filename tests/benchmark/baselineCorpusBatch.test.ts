import { describe, expect, it } from 'vitest';
import { shouldRunSecondDeterministicPass } from '../../scripts/baseline-corpus-batch.js';

describe('baseline corpus deterministic pass admission', () => {
  it('does not start a second pass for already A-grade rows below the global 95 target', () => {
    expect(shouldRunSecondDeterministicPass({
      verifiedCheckpointReturned: false,
      score: 93,
      hasBudget: true,
    })).toBe(false);
    expect(shouldRunSecondDeterministicPass({
      verifiedCheckpointReturned: false,
      score: 93,
      remediationTargetScore: 95,
      secondPassMinScore: 93,
      hasBudget: true,
    })).toBe(false);
  });

  it('still runs a second pass for below-A rows when budget remains', () => {
    expect(shouldRunSecondDeterministicPass({
      verifiedCheckpointReturned: false,
      score: 92,
      remediationTargetScore: 95,
      secondPassMinScore: 93,
      hasBudget: true,
    })).toBe(true);
  });

  it('does not run after checkpoint return, target reached, or budget exhaustion', () => {
    expect(shouldRunSecondDeterministicPass({
      verifiedCheckpointReturned: true,
      score: 91,
      remediationTargetScore: 95,
      secondPassMinScore: 93,
      hasBudget: true,
    })).toBe(false);
    expect(shouldRunSecondDeterministicPass({
      verifiedCheckpointReturned: false,
      score: 95,
      remediationTargetScore: 95,
      secondPassMinScore: 93,
      hasBudget: true,
    })).toBe(false);
    expect(shouldRunSecondDeterministicPass({
      verifiedCheckpointReturned: false,
      score: 80,
      remediationTargetScore: 95,
      secondPassMinScore: 93,
      hasBudget: false,
    })).toBe(false);
  });
});
