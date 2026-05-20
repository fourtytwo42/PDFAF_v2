import { describe, expect, it } from 'vitest';
import {
  buildReportLayoutHeadingMutationReport,
  classifyReportLayoutHeadingMutationAttempt,
} from '../../scripts/report-layout-heading-mutation-diagnostic.js';

function tool(details: Record<string, unknown>, outcome = 'no_effect') {
  return {
    toolName: 'create_heading_from_candidate',
    outcome,
    scoreBefore: 69,
    scoreAfter: outcome === 'rejected' ? 69 : 76,
    delta: outcome === 'rejected' ? 0 : 7,
    stage: 4,
    round: 1,
    details: JSON.stringify(details),
  };
}

describe('report-layout heading mutation diagnostic', () => {
  it('classifies planned-vs-actual target fallback mismatch', () => {
    const attempt = classifyReportLayoutHeadingMutationAttempt({
      file: '03_va-04.pdf',
      appliedTools: [],
    }, tool({
      outcome: 'no_effect',
      note: 'role_invalid_after_mutation',
      invariants: { targetRef: '193_0', targetResolved: true, resolvedRole: 'LBody' },
      debug: {
        before: {
          topLevelNonEmptyCount: 46,
          rootReachableFigureCount: 238,
          candidate: { structRef: '409_0', tag: 'P', rootReachable: true, pageParentTreeHits: 1 },
        },
        after: {
          topLevelNonEmptyCount: 1,
          rootReachableFigureCount: 0,
          candidate: { structRef: '409_0', tag: 'H2', rootReachable: true, pageParentTreeHits: 1 },
        },
      },
    }), 0);

    expect(attempt?.classification).toBe('target_ref_fallback_mismatch');
    expect(attempt?.targetMismatch).toBe(true);
    expect(attempt?.reasons).toContain('planned_target_differs_from_mutated_candidate:193_0->409_0');
  });

  it('classifies figure-alt PAC side effects without target mismatch', () => {
    const attempt = classifyReportLayoutHeadingMutationAttempt({
      file: '01_va-02.pdf',
      appliedTools: [],
    }, tool({
      outcome: 'rejected',
      note: 'pac_rule_regressed(pdfua.figure.alt_present)',
      pacRuleRegression: { ruleId: 'pdfua.figure.alt_present' },
      debug: {
        replayState: {
          detectionSignalsBefore: { extractedFigureCount: 147, checkerVisibleFigureCount: 23 },
          detectionSignalsAfter: { extractedFigureCount: 153, checkerVisibleFigureCount: 23 },
        },
      },
    }, 'rejected'), 0);

    expect(attempt?.classification).toBe('pac_figure_alt_side_effect');
    expect(attempt?.pacRegressionRuleIds).toEqual(['pdfua.figure.alt_present']);
  });

  it('classifies root rewrite collapse when target does not change', () => {
    const attempt = classifyReportLayoutHeadingMutationAttempt({
      file: 'collapse.pdf',
      appliedTools: [],
    }, tool({
      outcome: 'no_effect',
      note: 'structure_depth_not_improved',
      invariants: { targetRef: '409_0', targetResolved: true, resolvedRole: 'H2' },
      debug: {
        before: {
          topLevelNonEmptyCount: 46,
          rootReachableFigureCount: 238,
          candidate: { structRef: '409_0', tag: 'P', rootReachable: true, pageParentTreeHits: 1 },
        },
        after: {
          topLevelNonEmptyCount: 1,
          rootReachableFigureCount: 0,
          candidate: { structRef: '409_0', tag: 'H2', rootReachable: true, pageParentTreeHits: 1 },
        },
      },
    }), 0);

    expect(attempt?.classification).toBe('root_rewrite_collapse');
    expect(attempt?.reasons).toContain('root_or_figure_structure_collapsed_after_mutation');
  });

  it('classifies strict-target refusal as a would-skip result', () => {
    const attempt = classifyReportLayoutHeadingMutationAttempt({
      file: '03_va-04.pdf',
      appliedTools: [],
    }, tool({
      outcome: 'no_effect',
      note: 'strict_target_not_paragraph_like',
      invariants: { targetRef: '193_0', targetResolved: true, resolvedRole: 'LBody' },
      debug: {
        before: { candidate: { structRef: '193_0', tag: 'LBody', rootReachable: true } },
        after: { candidate: { structRef: '193_0', tag: 'LBody', rootReachable: true } },
      },
    }), 0);

    expect(attempt?.classification).toBe('strict_target_would_skip');
    expect(attempt?.reasons).toContain('strict_target_not_paragraph_like');
  });

  it('recommends strict-target behavior when va-04 or va-07 has mismatch evidence', () => {
    const report = buildReportLayoutHeadingMutationReport({
      runPath: 'baseline_report.json',
      outDir: '/tmp/out',
      now: new Date('2026-05-20T00:00:00.000Z'),
      rows: [{
        file: '03_va-04.pdf',
        appliedTools: [tool({
          outcome: 'no_effect',
          note: 'role_invalid_after_mutation',
          invariants: { targetRef: '193_0', targetResolved: true, resolvedRole: 'LBody' },
          debug: {
            before: { topLevelNonEmptyCount: 46, candidate: { structRef: '409_0', tag: 'P', rootReachable: true } },
            after: { topLevelNonEmptyCount: 1, candidate: { structRef: '409_0', tag: 'H2', rootReachable: true } },
          },
        })],
      }],
    });

    expect(report.decision.status).toBe('strict_target_behavior_supported');
    expect(report.classificationDistribution.target_ref_fallback_mismatch).toBe(1);
  });
});
