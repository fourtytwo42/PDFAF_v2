import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildHardTimeoutTailDiagnostic,
  renderHardTimeoutTailMarkdown,
  writeHardTimeoutTailDiagnostic,
} from '../../scripts/all-unique-hard-timeout-tail-diagnostic.js';

function timeoutRow(file: string, extra: Record<string, unknown> = {}) {
  return {
    file,
    beforeScore: 50,
    afterScore: 0,
    afterGrade: '?',
    durationMs: 300_000,
    error: 'per_pdf_timeout_300000ms',
    falsePositiveApplied: 0,
    ...extra,
  };
}

function checkpoint(input: {
  reason: string;
  score: number;
  elapsedMs: number;
  eligible?: boolean;
  returned?: boolean;
  eligibilityReason?: string;
}) {
  return {
    kind: 'verified_checkpoint',
    reason: input.reason,
    score: input.score,
    grade: input.score >= 90 ? 'A' : 'F',
    appliedToolCount: 5,
    eligible: input.eligible === true,
    returned: input.returned === true,
    eligibilityReason: input.eligibilityReason ?? `checkpoint_below_floor(${input.score}<85)`,
    elapsedMs: input.elapsedMs,
  };
}

function trace(file: string, extra: Record<string, unknown> = {}) {
  return {
    file,
    rowId: file.replace(/\.pdf$/i, ''),
    error: 'per_pdf_timeout_300000ms',
    elapsedMs: 300_000,
    lastEvent: {
      kind: 'verified_checkpoint',
      reason: 'stage_6',
      score: 59,
      grade: 'F',
      elapsedMs: 240_000,
    },
    verifiedCheckpointHistory: [
      checkpoint({ reason: 'initial_state', score: 54, elapsedMs: 1 }),
      checkpoint({ reason: 'stage_6', score: 59, elapsedMs: 240_000 }),
    ],
    liveAnalysisSummary: {
      count: 3,
      totalMs: 75_000,
      top: [
        { context: 'figure_alt_target_reanalysis', toolName: 'set_figure_alt_text', durationMs: 25_000, scoreBefore: 59, scoreAfter: 59 },
        { context: 'figure_alt_target_reanalysis', toolName: 'set_figure_alt_text', durationMs: 25_000, scoreBefore: 59, scoreAfter: 59 },
        { context: 'figure_alt_target_reanalysis', toolName: 'set_figure_alt_text', durationMs: 25_000, scoreBefore: 59, scoreAfter: 59 },
      ],
    },
    ...extra,
  };
}

describe('all-unique hard-timeout tail diagnostic', () => {
  it('classifies late optional post-alt budget overrun candidates', () => {
    const file = '0120-report.pdf';
    const diagnostic = buildHardTimeoutTailDiagnostic({
      rows: [timeoutRow(file)],
      traces: new Map([['0120', trace(file)]]),
      runDir: '/run',
      reportPath: '/run/merged/baseline_report.json',
      generatedAt: '2026-05-22T00:00:00.000Z',
    });

    expect(diagnostic.summary.decision.status).toBe('no_safe_timeout_behavior_ready');
    expect(diagnostic.rows[0]?.classification).toBe('optional_post_alt_budget_overrun_candidate');
    expect(diagnostic.rows[0]?.remainingAfterLastCheckpointMs).toBe(60_000);
  });

  it('promotes a proof plan when multiple optional post-alt budget candidates exist', () => {
    const diagnostic = buildHardTimeoutTailDiagnostic({
      rows: [timeoutRow('0120-report.pdf'), timeoutRow('0135-report.pdf')],
      traces: new Map([
        ['0120', trace('0120-report.pdf')],
        ['0135', trace('0135-report.pdf', {
          lastEvent: {
            kind: 'verified_checkpoint',
            reason: 'ensure_accessibility_tagging',
            score: 59,
            grade: 'F',
            elapsedMs: 249_000,
          },
          verifiedCheckpointHistory: [
            checkpoint({ reason: 'initial_state', score: 55, elapsedMs: 1 }),
            checkpoint({ reason: 'ensure_accessibility_tagging', score: 59, elapsedMs: 249_000 }),
          ],
        })],
      ]),
      runDir: '/run',
      reportPath: '/run/merged/baseline_report.json',
    });

    expect(diagnostic.summary.decision.status).toBe('plan_optional_post_alt_budget_guard_probe');
    expect(diagnostic.summary.projectedPointsIfOptionalBudgetGuardCompletesLowStates).toBe(118);
  });

  it('classifies structure reanalysis timeout after expensive conformance separately', () => {
    const file = '0031-structure-4438.pdf';
    const diagnostic = buildHardTimeoutTailDiagnostic({
      rows: [timeoutRow(file)],
      traces: new Map([['0031', trace(file, {
        lastEvent: { kind: 'stage_reanalysis_start', elapsedMs: 210_000 },
        lastToolName: 'synthesize_basic_structure_from_layout',
        lastToolOutcome: 'no_effect',
        verifiedCheckpointHistory: [
          checkpoint({ reason: 'initial_state', score: 25, elapsedMs: 1, eligibilityReason: 'checkpoint_below_floor(25<90)' }),
          checkpoint({ reason: 'stage_1', score: 36, elapsedMs: 90_000, eligibilityReason: 'checkpoint_below_floor(36<90)' }),
        ],
        recentEvents: [
          {
            kind: 'tool_finish',
            toolName: 'repair_structure_conformance',
            outcome: 'applied',
            durationMs: 115_000,
            elapsedMs: 206_000,
          },
          { kind: 'stage_reanalysis_start', elapsedMs: 210_000 },
        ],
      })]]),
      runDir: '/run',
      reportPath: '/run/merged/baseline_report.json',
    });

    expect(diagnostic.rows[0]?.classification).toBe('stage_reanalysis_timeout_after_expensive_conformance');
    expect(diagnostic.summary.decision.status).toBe('plan_structure_reanalysis_timeout_probe');
  });

  it('classifies named post-pass timeouts after low checkpoints as a phase probe', () => {
    const file = '0135-long-report.pdf';
    const diagnostic = buildHardTimeoutTailDiagnostic({
      rows: [timeoutRow(file)],
      traces: new Map([['0135', trace(file, {
        lastEvent: {
          kind: 'post_pass_start',
          phase: 'document_finalization',
          round: 2,
          scoreBefore: 59,
          gradeBefore: 'F',
          elapsedMs: 266_000,
        },
        verifiedCheckpointHistory: [
          checkpoint({ reason: 'initial_state', score: 55, elapsedMs: 1 }),
          checkpoint({ reason: 'stage181_hidden_alt_post_pass', score: 59, elapsedMs: 266_000 }),
        ],
      })]]),
      runDir: '/run',
      reportPath: '/run/merged/baseline_report.json',
    });

    expect(diagnostic.rows[0]?.classification).toBe('post_pass_timeout_after_low_checkpoint');
    expect(diagnostic.rows[0]?.lastPostPassPhase).toBe('document_finalization');
    expect(diagnostic.summary.decision.status).toBe('plan_post_pass_phase_timeout_probe');
  });

  it('classifies benchmark post-remediation alt timeouts separately', () => {
    const file = '0135-report.pdf';
    const diagnostic = buildHardTimeoutTailDiagnostic({
      rows: [timeoutRow(file)],
      traces: new Map([['0135', trace(file, {
        lastEvent: {
          kind: 'benchmark_phase_start',
          phase: 'post_remediation_alt_after_first_pass',
          scoreBefore: 59,
          gradeBefore: 'F',
          elapsedMs: 265_000,
        },
        verifiedCheckpointHistory: [
          checkpoint({ reason: 'initial_state', score: 55, elapsedMs: 1 }),
          checkpoint({ reason: 'document_finalization', score: 59, elapsedMs: 264_900 }),
        ],
      })]]),
      runDir: '/run',
      reportPath: '/run/merged/baseline_report.json',
    });

    expect(diagnostic.rows[0]?.classification).toBe('post_remediation_alt_timeout_after_low_checkpoint');
    expect(diagnostic.rows[0]?.lastPostPassPhase).toBe('post_remediation_alt_after_first_pass');
    expect(diagnostic.summary.decision.status).toBe('plan_post_remediation_alt_timeout_probe');
  });

  it('detects eligible checkpoint terminalization bugs first', () => {
    const file = '0019-long-4516.pdf';
    const diagnostic = buildHardTimeoutTailDiagnostic({
      rows: [timeoutRow(file)],
      traces: new Map([['0019', trace(file, {
        verifiedCheckpointHistory: [
          checkpoint({
            reason: 'return:before_post_pass',
            score: 86,
            elapsedMs: 250_000,
            eligible: true,
            returned: true,
            eligibilityReason: 'low_score_timeout_checkpoint_eligible',
          }),
        ],
      })]]),
      runDir: '/run',
      reportPath: '/run/merged/baseline_report.json',
    });

    expect(diagnostic.rows[0]?.classification).toBe('eligible_checkpoint_terminal_bug');
    expect(diagnostic.summary.decision.status).toBe('fix_checkpoint_terminalization_first');
  });

  it('writes JSON and Markdown reports from a run directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-hard-timeout-tail-'));
    try {
      const reportPath = join(dir, 'merged', 'baseline_report.json');
      const traceDir = join(dir, 'shard-01', 'rows', '0120', 'runtime-timeouts');
      await mkdir(join(dir, 'merged'), { recursive: true });
      await mkdir(traceDir, { recursive: true });
      await writeFile(reportPath, JSON.stringify({ rows: [timeoutRow('0120-report.pdf')] }), 'utf8');
      await writeFile(join(traceDir, '0120-report.json'), JSON.stringify(trace('0120-report.pdf')), 'utf8');

      const outDir = join(dir, 'out');
      const diagnostic = await writeHardTimeoutTailDiagnostic({
        runDir: dir,
        reportPath,
        outDir,
      });
      const json = JSON.parse(await readFile(join(outDir, 'hard-timeout-tail-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'hard-timeout-tail-diagnostic.md'), 'utf8');

      expect(diagnostic.rows[0]?.classification).toBe('optional_post_alt_budget_overrun_candidate');
      expect(json).toMatchObject({ summary: { hardTimeoutRows: 1 } });
      expect(md).toContain('All-Unique Hard Timeout Tail Diagnostic');
      expect(renderHardTimeoutTailMarkdown(diagnostic)).toContain('Read-only diagnostic');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
