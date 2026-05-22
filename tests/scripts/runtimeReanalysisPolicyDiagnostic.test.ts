import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildReanalysisPolicyDiagnostic,
  renderReanalysisPolicyMarkdown,
  writeReanalysisPolicyDiagnostic,
} from '../../scripts/runtime-reanalysis-policy-diagnostic.js';

function runtimeSummary(input: {
  stageReanalysisMs?: number;
  stageTotalMs?: number;
  toolMs?: number;
  liveMs?: number;
  liveScoreBefore?: number;
  liveScoreAfter?: number;
  earlyExitKey?: string;
} = {}) {
  return {
    analysisBefore: { totalMs: 22_000 },
    analysisAfter: { totalMs: 23_000 },
    deterministicTotalMs: 210_000,
    stageTimings: [
      {
        stageNumber: 2,
        totalMs: input.stageTotalMs ?? 75_000,
        reanalyzeMs: input.stageReanalysisMs ?? 65_000,
      },
    ],
    toolTimings: [
      {
        toolName: 'set_figure_alt_text',
        durationMs: input.toolMs ?? 12_000,
        outcome: 'accepted',
      },
    ],
    liveAnalysisTimings: [
      {
        context: 'figure_alt_target_reanalysis',
        toolName: 'set_figure_alt_text',
        targetRef: '248_0',
        durationMs: input.liveMs ?? 65_000,
        scoreBefore: input.liveScoreBefore ?? 59,
        scoreAfter: input.liveScoreAfter ?? 59,
      },
    ],
    boundedWork: {
      deterministicEarlyExitReasons: [
        {
          key: input.earlyExitKey ?? 'verified_low_score_checkpoint_timeout_return',
          count: 2,
        },
      ],
    },
  };
}

function row(file: string, beforeScore: number | null, afterScore: number | null, durationMs: number, extra: Record<string, unknown> = {}) {
  return {
    file,
    beforeScore,
    afterScore,
    afterGrade: afterScore === null ? '?' : afterScore >= 90 ? 'A' : 'F',
    durationMs,
    falsePositiveApplied: 0,
    ...(afterScore === null ? { error: 'timeout' } : {}),
    ...extra,
  };
}

function report(rows: Array<ReturnType<typeof row>>) {
  return { rows };
}

describe('runtime reanalysis policy diagnostic', () => {
  it('classifies reanalysis-dominated low-score rows from runtime telemetry', () => {
    const diagnostic = buildReanalysisPolicyDiagnostic({
      generatedAt: '2026-05-21T00:00:00.000Z',
      reports: [
        {
          path: '/telemetry.json',
          report: report([
            row('long-4683.pdf', 48, 59, 231_000, {
              runtimeSummary: runtimeSummary(),
            }),
          ]),
        },
      ],
      focusKeys: ['4683'],
    });

    expect(diagnostic.decision.status).toBe('plan_reanalysis_admission_probe');
    expect(diagnostic.rows[0]?.classification).toBe('reanalysis_dominated_low_score_candidate');
    expect(diagnostic.rows[0]?.stageReanalysisMs).toBe(65_000);
    expect(diagnostic.rows[0]?.liveNoGainAnalysisMs).toBe(65_000);
    expect(diagnostic.rows[0]?.toolTimingRatio).toBeLessThanOrEqual(0.15);
  });

  it('separates high-score live-analysis routes as controls', () => {
    const diagnostic = buildReanalysisPolicyDiagnostic({
      reports: [
        {
          path: '/telemetry.json',
          report: report([
            row('long-4683.pdf', 48, 98, 225_000, {
              runtimeSummary: runtimeSummary({
                liveMs: 105_000,
                liveScoreBefore: 59,
                liveScoreAfter: 59,
              }),
            }),
          ]),
        },
      ],
      focusKeys: ['4683'],
    });

    expect(diagnostic.decision.status).toBe('keep_runtime_policy_parked');
    expect(diagnostic.rows[0]?.classification).toBe('live_reanalysis_positive_route_control');
    expect(diagnostic.rows[0]?.liveAnalysisMs).toBe(105_000);
  });

  it('parks low-score rows when live analysis shows route volatility', () => {
    const diagnostic = buildReanalysisPolicyDiagnostic({
      reports: [
        {
          path: '/telemetry.json',
          report: report([
            row('long-4680.pdf', 59, 59, 233_000, {
              runtimeSummary: runtimeSummary({
                liveMs: 82_000,
                liveScoreBefore: 59,
                liveScoreAfter: 97,
              }),
            }),
          ]),
        },
      ],
      focusKeys: ['4680'],
    });

    expect(diagnostic.decision.status).toBe('keep_runtime_policy_parked');
    expect(diagnostic.rows[0]?.classification).toBe('live_reanalysis_route_volatility_blocker');
    expect(diagnostic.rows[0]?.liveGainAnalysisMs).toBe(82_000);
  });

  it('classifies repeated timeout rows from repeated observations or explicit known-timeout keys', () => {
    const repeated = buildReanalysisPolicyDiagnostic({
      reports: [
        { path: '/r1.json', report: report([row('structure-4438.pdf', null, null, 300_000)]) },
        { path: '/r2.json', report: report([row('structure-4438.pdf', null, null, 300_000)]) },
      ],
      focusKeys: ['4438'],
    });

    expect(repeated.rows[0]?.classification).toBe('repeated_timeout_known_debt');
    expect(repeated.rows[0]?.timeoutObservationCount).toBe(2);

    const known = buildReanalysisPolicyDiagnostic({
      reports: [
        { path: '/current.json', report: report([row('structure-4438.pdf', null, null, 300_000)]) },
      ],
      focusKeys: ['4438'],
      knownTimeoutKeys: ['4438'],
    });

    expect(known.rows[0]?.classification).toBe('repeated_timeout_known_debt');
  });

  it('requires explicit score-adjudication keys instead of hardcoding row ids', () => {
    const reports = [
      {
        path: '/current.json',
        report: report([
          row('long-4516.pdf', 85, 55, 283_000),
        ]),
      },
    ];

    const withoutKey = buildReanalysisPolicyDiagnostic({
      reports,
      focusKeys: ['4516'],
    });
    const withKey = buildReanalysisPolicyDiagnostic({
      reports,
      focusKeys: ['4516'],
      scoreAdjudicationKeys: ['4516'],
    });

    expect(withoutKey.rows[0]?.classification).toBe('p95_driver_needs_runtime_summary');
    expect(withKey.rows[0]?.classification).toBe('score_adjudication_not_runtime_policy');
  });

  it('asks for telemetry before policy when a tail row lacks runtime summary', () => {
    const diagnostic = buildReanalysisPolicyDiagnostic({
      reports: [
        {
          path: '/current.json',
          report: report([
            row('structure-4076.pdf', 91, 86, 214_000),
          ]),
        },
      ],
      focusKeys: ['4076'],
    });

    expect(diagnostic.decision.status).toBe('collect_runtime_telemetry_first');
    expect(diagnostic.rows[0]?.classification).toBe('p95_driver_needs_runtime_summary');
  });

  it('writes JSON and Markdown reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-runtime-reanalysis-'));
    try {
      const reportPath = join(dir, 'baseline_report.json');
      await writeFile(reportPath, JSON.stringify(report([
        row('long-4683.pdf', 48, 59, 231_000, {
          runtimeSummary: runtimeSummary(),
        }),
      ])), 'utf8');
      const outDir = join(dir, 'out');
      const diagnostic = await writeReanalysisPolicyDiagnostic({
        reportPaths: [reportPath],
        focusKeys: ['4683'],
        outDir,
      });
      const json = JSON.parse(await readFile(join(outDir, 'runtime-reanalysis-policy-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'runtime-reanalysis-policy-diagnostic.md'), 'utf8');

      expect(diagnostic.decision.status).toBe('plan_reanalysis_admission_probe');
      expect(json).toMatchObject({ decision: { status: 'plan_reanalysis_admission_probe' } });
      expect(md).toContain('Runtime Reanalysis Policy Diagnostic');
      expect(renderReanalysisPolicyMarkdown(diagnostic)).toContain('Read-only diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
