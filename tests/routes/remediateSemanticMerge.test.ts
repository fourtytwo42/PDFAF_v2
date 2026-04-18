import { describe, expect, it } from 'vitest';
import { mergeSequentialSemanticSummaries } from '../../src/routes/remediate.js';
import type { SemanticRemediationSummary } from '../../src/types.js';

function summary(
  lane: SemanticRemediationSummary['lane'],
  overrides: Partial<SemanticRemediationSummary>,
): SemanticRemediationSummary {
  return {
    lane,
    skippedReason: 'completed',
    durationMs: 100,
    proposalsAccepted: 1,
    proposalsRejected: 0,
    scoreBefore: 80,
    scoreAfter: 84,
    batches: [],
    gate: {
      passed: true,
      reason: 'gate_passed',
      details: ['category:80->84', 'candidates:4->2'],
      candidateCountBefore: 4,
      candidateCountAfter: 2,
      targetCategoryKey: lane === 'figures' ? 'alt_text' : 'heading_structure',
      targetCategoryScoreBefore: lane === 'figures' ? 70 : 80,
      targetCategoryScoreAfter: lane === 'figures' ? 84 : 90,
    },
    changeStatus: 'applied',
    ...overrides,
  };
}

describe('mergeSequentialSemanticSummaries', () => {
  it('preserves applied status when a later pass hits sufficiency', () => {
    const merged = mergeSequentialSemanticSummaries(80, [
      summary('promote_headings', {}),
      summary('promote_headings', {
        skippedReason: 'heading_structure_sufficient',
        proposalsAccepted: 0,
        scoreBefore: 84,
        scoreAfter: 84,
        gate: {
          passed: false,
          reason: 'heading_structure_sufficient',
          details: ['heading_structure category already meets deterministic threshold'],
          candidateCountBefore: 2,
          candidateCountAfter: 0,
          targetCategoryKey: 'heading_structure',
          targetCategoryScoreBefore: 90,
          targetCategoryScoreAfter: 97,
        },
        changeStatus: 'skipped',
      }),
    ]);

    expect(merged.changeStatus).toBe('applied');
    expect(merged.skippedReason).toBe('completed');
    expect(merged.proposalsAccepted).toBe(1);
    expect(merged.gate.reason).toBe('gate_passed');
  });

  it('preserves earlier applied work when a later pass reverts', () => {
    const merged = mergeSequentialSemanticSummaries(80, [
      summary('figures', {}),
      summary('figures', {
        skippedReason: 'regression_reverted',
        proposalsAccepted: 0,
        proposalsRejected: 2,
        scoreBefore: 84,
        scoreAfter: 84,
        gate: {
          passed: true,
          reason: 'semantic_structural_confidence_reverted',
          details: ['stage_regressed_structural_confidence(high->medium)'],
          candidateCountBefore: 2,
          candidateCountAfter: 2,
          targetCategoryKey: 'alt_text',
          targetCategoryScoreBefore: 84,
          targetCategoryScoreAfter: 90,
        },
        changeStatus: 'reverted',
        errorMessage: 'stage_regressed_structural_confidence(high->medium)',
      }),
    ]);

    expect(merged.changeStatus).toBe('applied');
    expect(merged.skippedReason).toBe('completed');
    expect(merged.errorMessage).toBeUndefined();
  });

  it('keeps reverted status when no pass ever applies', () => {
    const merged = mergeSequentialSemanticSummaries(80, [
      summary('promote_headings', {
        skippedReason: 'regression_reverted',
        proposalsAccepted: 0,
        proposalsRejected: 1,
        scoreAfter: 80,
        gate: {
          passed: true,
          reason: 'semantic_structural_confidence_reverted',
          details: ['stage_regressed_structural_confidence(high->medium)'],
          candidateCountBefore: 4,
          candidateCountAfter: 4,
          targetCategoryKey: 'heading_structure',
          targetCategoryScoreBefore: 80,
          targetCategoryScoreAfter: 84,
        },
        changeStatus: 'reverted',
        errorMessage: 'stage_regressed_structural_confidence(high->medium)',
      }),
    ]);

    expect(merged.changeStatus).toBe('reverted');
    expect(merged.skippedReason).toBe('regression_reverted');
    expect(merged.errorMessage).toContain('structural_confidence');
  });
});
