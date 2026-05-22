import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRuntimeTailGateDiagnostic,
  renderRuntimeTailGateDiagnosticMarkdown,
  writeRuntimeTailGateDiagnostic,
} from '../../scripts/runtime-tail-gate-diagnostic.js';

function tool(durationMs: number) {
  return { durationMs };
}

function row(file: string, score: number | null, durationMs: number, extra: Record<string, unknown> = {}) {
  return {
    file,
    afterScore: score,
    afterGrade: score === null ? '?' : score >= 90 ? 'A' : 'F',
    durationMs,
    falsePositiveApplied: 0,
    ...(score === null ? { error: 'timeout' } : {}),
    ...extra,
  };
}

function report(rows: ReturnType<typeof row>[]) {
  return { rows };
}

describe('runtime tail gate diagnostic', () => {
  it('blocks on new timeout rows and p95 runtime regression', () => {
    const reference = report([
      row('4438-known-timeout.pdf', null, 300000),
      row('4683-long-report.pdf', 61, 229000, { appliedTools: [tool(1000)] }),
      row('4516-long-report.pdf', 85, 120000),
      row('fast.pdf', 95, 1000),
    ]);
    const current = report([
      row('4438-known-timeout.pdf', null, 300000),
      row('4683-long-report.pdf', null, 300000),
      row('4516-long-report.pdf', 55, 360000),
      row('fast.pdf', 95, 1000),
    ]);

    const diagnostic = buildRuntimeTailGateDiagnostic({
      generatedAt: '2026-05-21T00:00:00.000Z',
      referencePath: '/reference.json',
      currentPath: '/current.json',
      historyPaths: [],
      reference,
      current,
      history: [],
    });

    expect(diagnostic.decision.status).toBe('runtime_gate_blocked');
    expect(diagnostic.gates.noNewTimeouts).toBe(false);
    expect(diagnostic.gates.runtimeWithinBound).toBe(false);
    expect(diagnostic.rows.find(row => row.key === '4683')?.classification)
      .toBe('new_timeout_gate_blocker');
    expect(diagnostic.rows.find(row => row.key === '4438')?.classification)
      .toBe('repeated_timeout_known_debt');
  });

  it('detects analyzer-dominated completed tail rows', () => {
    const reference = report([
      row('4683-long-report.pdf', 61, 229000, { appliedTools: [tool(10_000)] }),
      row('fast.pdf', 95, 1000),
    ]);
    const current = report([
      row('4683-long-report.pdf', 59, 240000, { appliedTools: [tool(2000), tool(1000)] }),
      row('fast.pdf', 95, 1000),
    ]);

    const diagnostic = buildRuntimeTailGateDiagnostic({
      referencePath: '/reference.json',
      currentPath: '/current.json',
      historyPaths: [],
      reference,
      current,
      history: [],
    });

    const row4683 = diagnostic.rows.find(row => row.key === '4683');
    expect(row4683?.classification).toBe('p95_runtime_driver');
    expect(row4683?.toolDurationRatio).toBeLessThan(0.02);
    expect(row4683?.unaccountedDurationMs).toBeGreaterThan(200000);
  });

  it('summarizes runtime telemetry hotspots when runtimeSummary is present', () => {
    const reference = report([
      row('4516-long-report.pdf', 85, 120000),
      row('fast.pdf', 95, 1000),
    ]);
    const current = report([
      row('4516-long-report.pdf', 59, 260000, {
        appliedTools: [tool(1000)],
        runtimeSummary: {
          analysisBefore: { totalMs: 29000 },
          analysisAfter: { totalMs: 25000 },
          deterministicTotalMs: 220000,
          stageTimings: [
            { key: 'planner:stage2', stageNumber: 2, round: 1, source: 'planner', toolCount: 3, totalMs: 46000, reanalyzeMs: 24000 },
            { key: 'planner:stage6', stageNumber: 6, round: 1, source: 'planner', toolCount: 3, totalMs: 78000, reanalyzeMs: 0 },
          ],
          toolTimings: [
            { toolName: 'repair_structure_conformance', stage: 2, source: 'planner', durationMs: 21000, outcome: 'no_effect' },
          ],
          liveAnalysisTimings: [
            { context: 'figure_alt_target_reanalysis', toolName: 'set_figure_alt_text', targetRef: '248_0', durationMs: 25000, scoreBefore: 59, scoreAfter: 59 },
          ],
          boundedWork: {
            deterministicEarlyExitReasons: [
              { key: 'verified_low_score_checkpoint_slow_no_gain_figure_alt_return', count: 1 },
            ],
          },
        },
      }),
      row('fast.pdf', 95, 1000),
    ]);

    const diagnostic = buildRuntimeTailGateDiagnostic({
      referencePath: '/reference.json',
      currentPath: '/current.json',
      historyPaths: [],
      reference,
      current,
      history: [],
      stricterScoreKeys: ['4516'],
    });

    const row4516 = diagnostic.rows.find(row => row.key === '4516');
    expect(row4516?.runtimeBreakdown?.stageReanalysisMs).toBe(24000);
    expect(row4516?.runtimeBreakdown?.liveAnalysisMs).toBe(25000);
    expect(row4516?.runtimeBreakdown?.earlyExitReasons[0]).toEqual({
      key: 'verified_low_score_checkpoint_slow_no_gain_figure_alt_return',
      count: 1,
    });
    expect(row4516?.runtimeBreakdown?.topHotspots[0]?.label).toContain('planner:stage6');
    expect(renderRuntimeTailGateDiagnosticMarkdown(diagnostic)).toContain('Runtime Hotspots');
  });

  it('writes JSON and Markdown reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-runtime-tail-'));
    try {
      const referencePath = join(dir, 'reference.json');
      const currentPath = join(dir, 'current.json');
      await writeFile(referencePath, JSON.stringify(report([
        row('4683-long-report.pdf', 61, 229000),
        row('fast.pdf', 95, 1000),
      ])), 'utf8');
      await writeFile(currentPath, JSON.stringify(report([
        row('4683-long-report.pdf', null, 300000),
        row('fast.pdf', 95, 1000),
      ])), 'utf8');
      const outDir = join(dir, 'out');
      const diagnostic = await writeRuntimeTailGateDiagnostic({
        referencePath,
        currentPath,
        historyPaths: [],
        outDir,
      });
      const json = JSON.parse(await readFile(join(outDir, 'runtime-tail-gate-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'runtime-tail-gate-diagnostic.md'), 'utf8');

      expect(diagnostic.decision.status).toBe('runtime_gate_blocked');
      expect(json).toMatchObject({ decision: { status: 'runtime_gate_blocked' } });
      expect(md).toContain('Runtime Tail Gate Diagnostic');
      expect(renderRuntimeTailGateDiagnosticMarkdown(diagnostic)).toContain('Read-only diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
