import { describe, expect, it } from 'vitest';
import {
  buildStage74Report,
  renderStage74Markdown,
  type Stage74Report,
} from '../../scripts/stage74-end-gate-revisit.js';

function summary(overrides: Record<string, unknown> = {}) {
  return {
    mean: 91.48,
    median: 96,
    fCount: 2,
    abCount: 44,
    count: 50,
    abPercent: 88,
    falsePositiveAppliedCount: 0,
    ...overrides,
  };
}

function row(input: {
  id: string;
  score: number;
  grade: string;
  alt?: number;
  falsePositiveAppliedCount?: number;
}) {
  return {
    id: input.id,
    publicationId: input.id.replace(/^v1-/, ''),
    afterScore: input.score,
    afterGrade: input.grade,
    afterCategories: input.alt == null ? [] : [{ key: 'alt_text', score: input.alt }],
    falsePositiveAppliedCount: input.falsePositiveAppliedCount ?? 0,
  };
}

function baseReport(overrides: Partial<Parameters<typeof buildStage74Report>[0]> = {}): Stage74Report {
  return buildStage74Report({
    stage71ReportPath: 'stage71.json',
    stage72ReportPath: 'stage72.json',
    stage73ReportPath: 'stage73.json',
    stage73TargetRunDir: 'stage73-target',
    stage73ControlRunDir: 'stage73-control',
    stage71Report: {
      summaries: {
        legacy: summary(),
        edgeMixCombined: summary({ abCount: 21, count: 28, abPercent: 75, falsePositiveAppliedCount: 0 }),
      },
      gates: {
        stage69: {
          failedGateKeys: ['runtime_p95_wall'],
          protectedRegressionCount: 0,
        },
      },
    },
    stage72Report: {
      abMath: {
        currentAbCount: 21,
        totalRows: 28,
        targetAbCount: 23,
        stableCandidateCount: 1,
        projectedAbCountWithStableCandidates: 22,
        reachableWithoutParkedOrManualRows: false,
      },
      rows: [
        { id: 'v1-4145', corpus: 'edge_mix_1', score: 78, grade: 'C', debtBucket: 'stable_structural_residual' },
        { id: 'v1-4139', corpus: 'edge_mix_1', score: 69, grade: 'D', debtBucket: 'parked_analyzer_volatility' },
        { id: 'v1-3479', corpus: 'edge_mix_2', score: 52, grade: 'F', debtBucket: 'manual_scanned_policy_debt' },
      ],
    },
    stage73Report: {
      decision: {
        recommendedDirection: 'diagnostic_only_no_safe_path',
      },
    },
    stage73TargetRows: [row({ id: 'v1-4145', score: 78, grade: 'C', alt: 20 })],
    stage73ControlRows: [
      row({ id: 'v1-3921', score: 91, grade: 'A' }),
      row({ id: 'v1-4758', score: 90, grade: 'A' }),
    ],
    generatedAt: '2026-04-25T00:00:00.000Z',
    ...overrides,
  });
}

describe('Stage 74 end-gate revisit', () => {
  it('recommends acceptance with documented waivers when only known blockers remain', () => {
    const report = baseReport();

    expect(report.decision.status).toBe('accept_engine_v2_general_checkpoint_with_documented_waivers');
    expect(report.hardBlockers).toEqual([]);
    expect(report.waivers.map(waiver => waiver.key)).toEqual([
      'runtime_p95_wall',
      'edge_mix_ab_shortfall',
      'parked_analyzer_volatility',
      'manual_scanned_policy_debt',
    ]);
  });

  it('treats false-positive applied as a hard blocker', () => {
    const report = baseReport({
      stage73TargetRows: [row({ id: 'v1-4145', score: 78, grade: 'C', alt: 20, falsePositiveAppliedCount: 1 })],
    });

    expect(report.decision.status).toBe('hard_blocker_requires_investigation');
    expect(report.hardBlockers.some(blocker => blocker.startsWith('false_positive_applied_nonzero'))).toBe(true);
  });

  it('confirms Stage 73 did not lift v1-4145 into A/B', () => {
    const report = baseReport();

    expect(report.stage73.v1_4145Score).toBe(78);
    expect(report.stage73.v1_4145Grade).toBe('C');
    expect(report.stage73.v1_4145AltText).toBe(20);
    expect(report.stage73.reachedAb).toBe(false);
    expect(report.stage73.stableAbLiftRemaining).toBe(false);
  });

  it('computes edge-mix A/B target shortfall deterministically', () => {
    const report = baseReport();

    expect(report.edgeMix.abCount).toBe(21);
    expect(report.edgeMix.totalRows).toBe(28);
    expect(report.edgeMix.targetAbCount).toBe(23);
    expect(report.edgeMix.projectedAbCountWithStableCandidates).toBe(22);
    expect(report.edgeMix.reachableWithoutParkedOrManualRows).toBe(false);
  });

  it('fails closed on missing Stage 72 A/B math or missing Stage 73 target row', () => {
    const report = baseReport({
      stage72Report: { rows: [] },
      stage73TargetRows: [],
    });

    expect(report.decision.status).toBe('hard_blocker_requires_investigation');
    expect(report.hardBlockers).toContain('stage73_v1_4145_target_row_missing');
    expect(report.hardBlockers).toContain('stage72_ab_math_missing');
  });

  it('renders a markdown decision with waiver details', () => {
    const markdown = renderStage74Markdown(baseReport());

    expect(markdown).toContain('accept_engine_v2_general_checkpoint_with_documented_waivers');
    expect(markdown).toContain('runtime_p95_wall');
    expect(markdown).toContain('v1-4145');
  });
});
