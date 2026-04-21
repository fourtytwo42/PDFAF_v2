import { describe, expect, it } from 'vitest';
import { analyzeHeadingRetryRows } from '../../src/services/remediation/headingRetryDiagnostics.js';
import type { AppliedRemediationTool } from '../../src/types.js';

function headingTool(details: object, outcome: AppliedRemediationTool['outcome'] = 'no_effect'): AppliedRemediationTool {
  return {
    toolName: 'create_heading_from_candidate',
    stage: 4,
    round: 1,
    scoreBefore: 50,
    scoreAfter: 50,
    delta: 0,
    outcome,
    details: JSON.stringify({ outcome, ...details }),
  };
}

describe('heading retry diagnostics', () => {
  it('classifies repeated same-target unreachable heading failures as suppressible', () => {
    const summary = analyzeHeadingRetryRows([{
      id: 'doc-a',
      afterScore: 58,
      appliedTools: [
        headingTool({ note: 'target_unreachable', invariants: { targetRef: '40_0', targetReachable: false } }),
        headingTool({ note: 'target_unreachable', invariants: { targetRef: '40_0', targetReachable: false } }),
      ],
    }]);

    expect(summary.totalHeadingNoEffect).toBe(2);
    expect(summary.noEffectWithTargetRef).toBe(2);
    expect(summary.repeatedExactBlockedSignatures).toHaveLength(1);
    expect(summary.repeatedExactBlockedSignatures[0]?.wouldSkip).toBe(1);
    expect(summary.filesWhereSuppressionWouldSkip).toEqual(['doc-a']);
  });

  it('does not classify distinct candidate progression as a suppressible exact repeat', () => {
    const summary = analyzeHeadingRetryRows([{
      id: 'doc-b',
      afterScore: 58,
      appliedTools: [
        headingTool({ note: 'target_unreachable', invariants: { targetRef: '40_0', targetReachable: false } }),
        headingTool({ note: 'target_unreachable', invariants: { targetRef: '41_0', targetReachable: false } }),
      ],
    }]);

    expect(summary.repeatedExactBlockedSignatures).toHaveLength(0);
    expect(summary.wouldSkipAttempts).toBe(0);
    expect(summary.distinctCandidateProgressionFiles).toEqual(['doc-b']);
  });

  it('treats structure_depth_not_improved as convergence-sensitive, not suppressible', () => {
    const summary = analyzeHeadingRetryRows([{
      id: 'doc-c',
      afterScore: 58,
      appliedTools: [
        headingTool({ note: 'structure_depth_not_improved', invariants: { targetRef: '40_0' } }),
        headingTool({ note: 'structure_depth_not_improved', invariants: { targetRef: '40_0' } }),
      ],
    }]);

    expect(summary.convergenceSensitiveNoEffectCount).toBe(2);
    expect(summary.repeatedExactBlockedSignatures).toHaveLength(0);
  });

  it('treats multiple_h1_after_mutation as convergence-sensitive, not suppressible', () => {
    const summary = analyzeHeadingRetryRows([{
      id: 'doc-d',
      afterScore: 58,
      appliedTools: [
        headingTool({ note: 'multiple_h1_after_mutation', invariants: { targetRef: '40_0' } }),
        headingTool({ note: 'multiple_h1_after_mutation', invariants: { targetRef: '40_0' } }),
      ],
    }]);

    expect(summary.convergenceSensitiveNoEffectCount).toBe(2);
    expect(summary.repeatedExactBlockedSignatures).toHaveLength(0);
  });

  it('reports missing targetRef as instrumentation debt', () => {
    const summary = analyzeHeadingRetryRows([{
      id: 'doc-e',
      afterScore: 58,
      appliedTools: [
        headingTool({ note: 'target_unreachable', invariants: { targetReachable: false } }),
      ],
    }]);

    expect(summary.missingTargetRefCount).toBe(1);
    expect(summary.needsPythonDetailFixFiles).toEqual(['doc-e']);
    expect(summary.repeatedExactBlockedSignatures).toHaveLength(0);
  });

  it('reports successful score outcomes with heading no_effect attempts as protected cases', () => {
    const summary = analyzeHeadingRetryRows([{
      id: 'doc-f',
      afterScore: 96,
      appliedTools: [
        headingTool({ note: 'target_unreachable', invariants: { targetRef: '40_0', targetReachable: false } }),
      ],
    }]);

    expect(summary.successfulScoreOutcomesMustNotTouch).toEqual([{
      fileId: 'doc-f',
      file: undefined,
      score: 96,
      noEffectCount: 1,
      targetRefs: ['40_0'],
      notes: ['target_unreachable'],
    }]);
  });
});
