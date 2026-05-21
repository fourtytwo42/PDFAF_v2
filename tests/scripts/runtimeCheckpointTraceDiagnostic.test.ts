import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRuntimeCheckpointTraceDiagnostic,
  renderRuntimeCheckpointTraceMarkdown,
  writeRuntimeCheckpointTraceDiagnostic,
} from '../../scripts/runtime-checkpoint-trace-diagnostic.js';

function checkpoint(input: {
  reason: string;
  score: number;
  appliedToolCount: number;
  elapsedMs: number;
  returned?: boolean;
  eligibilityReason?: string;
}) {
  return {
    kind: 'verified_checkpoint',
    reason: input.reason,
    score: input.score,
    grade: input.score >= 90 ? 'A' : 'F',
    appliedToolCount: input.appliedToolCount,
    eligible: input.returned === true,
    eligibilityReason: input.eligibilityReason ?? (input.returned ? 'low_score_timeout_checkpoint_eligible' : 'checkpoint_below_floor(59<85)'),
    returned: input.returned,
    elapsedMs: input.elapsedMs,
  };
}

function trace(extra = {}) {
  return {
    file: '4683-report.pdf',
    rowId: '4683-report',
    elapsedMs: 230_000,
    verifiedCheckpointHistory: [
      checkpoint({ reason: 'initial_state', score: 48, appliedToolCount: 0, elapsedMs: 0 }),
      checkpoint({ reason: 'stage_1', score: 59, appliedToolCount: 2, elapsedMs: 20_000 }),
      checkpoint({ reason: 'stage_4', score: 59, appliedToolCount: 8, elapsedMs: 70_000 }),
      checkpoint({ reason: 'tagged_cleanup_post_pass', score: 59, appliedToolCount: 18, elapsedMs: 220_000 }),
      checkpoint({
        reason: 'return:before_stage180_post_pass',
        score: 59,
        appliedToolCount: 2,
        elapsedMs: 228_000,
        returned: true,
      }),
    ],
    recentEvents: [
      { kind: 'stage_finish', stageNumber: 2, elapsedMs: 50_000, reanalyzeMs: 20_000 },
      { kind: 'stage_finish', stageNumber: 4, elapsedMs: 70_000, reanalyzeMs: 21_000 },
      { kind: 'stage_finish', stageNumber: 6, elapsedMs: 185_000, reanalyzeMs: 22_000 },
    ],
    ...extra,
  };
}

function report() {
  return {
    rows: [{
      file: '4683-report.pdf',
      afterScore: 59,
      afterGrade: 'F',
      durationMs: 231_000,
      falsePositiveApplied: 0,
    }],
  };
}

function reportWithHiddenLiveReanalysis() {
  return {
    rows: [{
      file: '4683-report.pdf',
      afterScore: 59,
      afterGrade: 'F',
      durationMs: 231_000,
      falsePositiveApplied: 0,
      runtimeSummary: {
        stageTimings: [{
          stageNumber: 6,
          round: 1,
          source: 'planner',
          totalMs: 137_000,
          reanalyzeMs: 21_000,
        }],
        toolTimings: [{
          toolName: 'set_figure_alt_text',
          stage: 6,
          round: 1,
          source: 'planner',
          durationMs: 10_000,
          outcome: 'applied',
        }],
      },
    }],
  };
}

function reportWithMeasuredLiveReanalysis() {
  return {
    rows: [{
      file: '4683-report.pdf',
      afterScore: 59,
      afterGrade: 'F',
      durationMs: 231_000,
      falsePositiveApplied: 0,
      runtimeSummary: {
        stageTimings: [{
          stageNumber: 6,
          round: 1,
          source: 'planner',
          totalMs: 137_000,
          reanalyzeMs: 21_000,
        }],
        toolTimings: [{
          toolName: 'set_figure_alt_text',
          stage: 6,
          round: 1,
          source: 'planner',
          durationMs: 10_000,
          outcome: 'applied',
        }],
        liveAnalysisTimings: [{
          key: 'planner:stage6:figure_alt_target_reanalysis:set_figure_alt_text',
          context: 'figure_alt_target_reanalysis',
          stage: 6,
          round: 1,
          source: 'planner',
          toolName: 'set_figure_alt_text',
          targetRef: '42_0',
          durationMs: 90_000,
          scoreBefore: 59,
          scoreAfter: 59,
        }],
      },
    }],
  };
}

describe('runtime checkpoint trace diagnostic', () => {
  it('classifies same-output runtime waste after an early low-score checkpoint return', () => {
    const diagnostic = buildRuntimeCheckpointTraceDiagnostic({
      generatedAt: '2026-05-21T00:00:00.000Z',
      tracePath: '/trace.json',
      trace: trace(),
      reportPath: '/report.json',
      report: report(),
    });

    expect(diagnostic.decision.status).toBe('plan_guarded_checkpoint_stagnation_probe');
    expect(diagnostic.rows[0]).toMatchObject({
      key: '4683',
      classification: 'same_output_runtime_waste_candidate',
      wastedAfterSelectedMs: 208_000,
      reanalysisAfterSelectedMs: 63_000,
      discardedAppliedToolCount: 16,
    });
  });

  it('parks early return when a later checkpoint has a higher score', () => {
    const diagnostic = buildRuntimeCheckpointTraceDiagnostic({
      tracePath: '/trace.json',
      trace: trace({
        verifiedCheckpointHistory: [
          checkpoint({ reason: 'stage_1', score: 59, appliedToolCount: 2, elapsedMs: 20_000 }),
          checkpoint({ reason: 'stage_4', score: 90, appliedToolCount: 8, elapsedMs: 70_000 }),
          checkpoint({
            reason: 'return:before_stage180_post_pass',
            score: 59,
            appliedToolCount: 2,
            elapsedMs: 228_000,
            returned: true,
          }),
        ],
      }),
      report: report(),
    });

    expect(diagnostic.decision.status).toBe('keep_runtime_checkpoint_behavior_parked');
    expect(diagnostic.rows[0]?.classification).toBe('higher_later_checkpoint_available');
  });

  it('prioritizes live reanalysis diagnostics when unaccounted stage time dominates', () => {
    const diagnostic = buildRuntimeCheckpointTraceDiagnostic({
      tracePath: '/trace.json',
      trace: trace(),
      report: reportWithHiddenLiveReanalysis(),
    });

    expect(diagnostic.decision.status).toBe('plan_live_reanalysis_runtime_probe');
    expect(diagnostic.rows[0]).toMatchObject({
      classification: 'same_output_runtime_waste_candidate',
      topUnaccountedStage: 'planner:stage6',
      topUnaccountedStageMs: 106_000,
    });
  });

  it('prioritizes live reanalysis diagnostics when measured live analysis dominates', () => {
    const diagnostic = buildRuntimeCheckpointTraceDiagnostic({
      tracePath: '/trace.json',
      trace: trace(),
      report: reportWithMeasuredLiveReanalysis(),
    });

    expect(diagnostic.decision.status).toBe('plan_live_reanalysis_runtime_probe');
    expect(diagnostic.rows[0]).toMatchObject({
      classification: 'same_output_runtime_waste_candidate',
      topUnaccountedStage: 'planner:stage6',
      topUnaccountedStageLiveAnalysisMs: 90_000,
      topUnaccountedStageMs: 16_000,
    });
  });

  it('handles traces without a returned checkpoint', () => {
    const diagnostic = buildRuntimeCheckpointTraceDiagnostic({
      tracePath: '/trace.json',
      trace: trace({ verifiedCheckpointHistory: [] }),
      report: report(),
    });

    expect(diagnostic.decision.status).toBe('collect_more_checkpoint_trace_evidence');
    expect(diagnostic.rows[0]?.classification).toBe('no_checkpoint_return');
  });

  it('writes JSON and Markdown reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-runtime-checkpoint-trace-'));
    try {
      const tracePath = join(dir, 'trace.json');
      const reportPath = join(dir, 'baseline_report.json');
      await writeFile(tracePath, JSON.stringify(trace()), 'utf8');
      await writeFile(reportPath, JSON.stringify(report()), 'utf8');
      const outDir = join(dir, 'out');
      const diagnostic = await writeRuntimeCheckpointTraceDiagnostic({
        tracePath,
        reportPath,
        outDir,
      });
      const json = JSON.parse(await readFile(join(outDir, 'runtime-checkpoint-trace-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'runtime-checkpoint-trace-diagnostic.md'), 'utf8');

      expect(diagnostic.decision.status).toBe('plan_guarded_checkpoint_stagnation_probe');
      expect(json).toMatchObject({ decision: { status: 'plan_guarded_checkpoint_stagnation_probe' } });
      expect(md).toContain('Runtime Checkpoint Trace Diagnostic');
      expect(renderRuntimeCheckpointTraceMarkdown(diagnostic)).toContain('Read-only diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
