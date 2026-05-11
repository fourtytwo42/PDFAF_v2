import { describe, expect, it } from 'vitest';
import {
  buildRouteVolatilityAggregateReport,
  summarizeRouteVolatilityDiagnostic,
  type RouteDiagnosticInput,
} from '../../scripts/all-input-route-volatility-aggregate.js';

function diagnostic(overrides: Partial<RouteDiagnosticInput> = {}): RouteDiagnosticInput {
  return {
    focus: 'sample',
    comparison: {
      classification: 'upstream_route_volatility',
      firstDivergenceIndex: 0,
      firstDivergenceReason: 'good tool state a vs bad tool state b.',
      goodOnlyScoreMovingTools: ['create_heading_from_candidate@a:59->91'],
      badOnlyScoreMovingTools: [],
      sharedRejectedScoreMovingStates: [],
      recommendation: 'Do not patch.',
    },
    runs: [
      { label: 'good', score: 91, grade: 'A', durationMs: 1000, tools: [] },
      { label: 'bad', score: 59, grade: 'F', durationMs: 2000, tools: [] },
    ],
    ...overrides,
  };
}

describe('all-input route volatility aggregate helpers', () => {
  it('classifies same-state route guard probes separately from upstream volatility', () => {
    const row = summarizeRouteVolatilityDiagnostic(diagnostic({
      comparison: {
        classification: 'same_state_route_guard_candidate',
        firstDivergenceIndex: 3,
        firstDivergenceReason: 'same state rejected later.',
        goodOnlyScoreMovingTools: ['normalize_annotation_tab_order@abc:59->79'],
        badOnlyScoreMovingTools: [],
        sharedRejectedScoreMovingStates: ['normalize_annotation_tab_order@abc'],
      },
    }));

    expect(row.aggregateClassification).toBe('same_state_guard_probe_needed');
    expect(row.sharedRejectedScoreMovingStates).toEqual(['normalize_annotation_tab_order@abc']);
    expect(row.recommendation).toContain('focused probe');
  });

  it('keeps initial-state divergence as analyzer/route volatility', () => {
    const row = summarizeRouteVolatilityDiagnostic(diagnostic());

    expect(row.aggregateClassification).toBe('upstream_route_volatility');
    expect(row.scoreSpread).toBe(32);
    expect(row.recommendation).toContain('initial analyzer');
  });

  it('tracks missing score-moving tools as planner/admission diagnostics', () => {
    const row = summarizeRouteVolatilityDiagnostic(diagnostic({
      comparison: {
        classification: 'missing_score_moving_tool',
        firstDivergenceIndex: 4,
        firstDivergenceReason: 'bad route ended before good route.',
        goodOnlyScoreMovingTools: ['repair_native_link_structure@def:79->94'],
        badOnlyScoreMovingTools: [],
        sharedRejectedScoreMovingStates: [],
      },
    }));

    expect(row.aggregateClassification).toBe('missing_score_moving_tool');
    expect(row.recommendation).toContain('planner/admission');
  });

  it('sorts same-state probes before other volatility rows', async () => {
    const sameState = diagnostic({
      focus: 'same',
      comparison: {
        classification: 'same_state_route_guard_candidate',
        firstDivergenceIndex: 5,
        firstDivergenceReason: 'shared state.',
        goodOnlyScoreMovingTools: ['a@x:59->94'],
        badOnlyScoreMovingTools: [],
        sharedRejectedScoreMovingStates: ['a@x'],
      },
    });
    const upstream = diagnostic({ focus: 'upstream' });
    const paths = ['same.json', 'upstream.json'];
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'route-volatility-'));
    try {
      const samePath = join(dir, paths[0]!);
      const upstreamPath = join(dir, paths[1]!);
      await writeFile(samePath, JSON.stringify(sameState));
      await writeFile(upstreamPath, JSON.stringify(upstream));
      const report = await buildRouteVolatilityAggregateReport({
        sourceRoot: dir,
        diagnosticPaths: [upstreamPath, samePath],
        generatedAt: '2026-05-11T00:00:00.000Z',
      });
      expect(report.rows.map(row => row.focus)).toEqual(['same', 'upstream']);
      expect(report.summary.sameStateGuardProbeNeededCount).toBe(1);
      expect(report.summary.upstreamRouteVolatilityCount).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
