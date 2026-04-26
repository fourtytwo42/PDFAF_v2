import { describe, expect, it } from 'vitest';
import { buildStage79AcceptanceDecision } from '../../scripts/stage79-acceptance-decision.js';

function gate(failed: string[]) {
  const keys = ['protected_file_regressions', 'runtime_p95_wall', 'false_positive_applied'];
  return {
    gates: keys.map(key => ({
      key,
      severity: 'hard',
      passed: !failed.includes(key),
      candidateValue: key === 'protected_file_regressions' ? (failed.includes(key) ? 2 : 0) : 0,
    })),
  };
}

describe('buildStage79AcceptanceDecision', () => {
  it('recommends Stage 78 when Stage 78B worsens hard gates', () => {
    const result = buildStage79AcceptanceDecision({
      stage78Gate: gate(['protected_file_regressions']),
      stage78bGate: gate(['protected_file_regressions', 'runtime_p95_wall']),
      diagnostic: {
        rows: [{
          id: 'structure-4076',
          classification: 'stable_below_floor',
          reason: 'all repeats below floor',
          changedFields: [],
        }],
      },
    });

    expect(result.status).toBe('recommend_stage78_checkpoint');
    expect(result.reasons.join(' ')).toContain('Stage78B guard work worsened');
  });

  it('keeps analyzer determinism open when Stage 78 is not the clear best checkpoint', () => {
    const result = buildStage79AcceptanceDecision({
      stage78Gate: gate(['protected_file_regressions', 'runtime_p95_wall']),
      stage78bGate: gate(['protected_file_regressions']),
    });

    expect(result.status).toBe('continue_analyzer_determinism');
  });
});
