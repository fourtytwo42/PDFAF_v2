import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildLong4516RouteRepeatabilityDiagnostic,
  renderLong4516RouteRepeatabilityMarkdown,
  writeLong4516RouteRepeatabilityDiagnostic,
  type Long4516RouteRunSummary,
} from '../../scripts/long4516-route-repeatability-diagnostic.js';

function categories(values: Record<string, number>) {
  return Object.entries(values).map(([key, score]) => ({ key, score, applicable: true }));
}

function row(input: {
  file?: string;
  beforeScore?: number;
  afterScore?: number;
  afterGrade?: string;
  error?: string;
  beforeCategories?: Record<string, number>;
  afterCategories?: Record<string, number>;
  tools?: Array<Record<string, unknown>>;
}) {
  return {
    file: input.file ?? '4516-report.pdf',
    beforeScore: input.beforeScore ?? 43,
    beforeGrade: 'F',
    afterScore: input.afterScore ?? 59,
    afterGrade: input.afterGrade ?? 'F',
    afterDeterministicScore: input.afterScore ?? 59,
    afterDeterministicGrade: input.afterGrade ?? 'F',
    durationMs: input.error ? 300_000 : 200_000,
    error: input.error,
    falsePositiveApplied: 0,
    categoriesBefore: categories(input.beforeCategories ?? {
      title_language: 0,
      heading_structure: 44,
      alt_text: 0,
      pdf_ua_compliance: 38,
      table_markup: 0,
      reading_order: 79,
    }),
    categoryGap: {
      after: categories(input.afterCategories ?? {
        title_language: 100,
        heading_structure: 78,
        alt_text: 0,
        pdf_ua_compliance: 57,
        table_markup: 100,
        reading_order: 79,
      }),
    },
    appliedTools: input.tools ?? [
      { toolName: 'set_document_language', outcome: 'applied', stage: 1, scoreBefore: 43, scoreAfter: 59 },
      { toolName: 'set_document_title', outcome: 'applied', stage: 1, scoreBefore: 43, scoreAfter: 59 },
    ],
    runtimeSummary: {
      boundedWork: {
        deterministicEarlyExitReasons: input.afterScore === 59
          ? [{ key: 'verified_low_score_checkpoint_timeout_return', count: 1 }]
          : [],
      },
    },
  };
}

function taggedCleanupTimeoutTrace() {
  return {
    file: '4516-report.pdf',
    rowId: '4516-report',
    error: 'per_pdf_timeout_300000ms',
    elapsedMs: 300_000,
    lastEvent: {
      kind: 'post_pass_start',
      phase: 'tagged_cleanup_post_pass',
      scoreBefore: 83,
      gradeBefore: 'B',
      elapsedMs: 223_000,
    },
    lastVerifiedCheckpointScore: 83,
    lastVerifiedCheckpointGrade: 'B',
    lastVerifiedCheckpointReason: 'alt_cleanup_post_pass',
    lastVerifiedCheckpointEligible: false,
    lastVerifiedCheckpointEligibilityReason: 'checkpoint_below_floor(83<85)',
    verifiedCheckpointHistory: [
      {
        reason: 'alt_cleanup_post_pass',
        score: 83,
        grade: 'B',
        eligible: false,
        eligibilityReason: 'checkpoint_below_floor(83<85)',
        returned: false,
        elapsedMs: 223_000,
      },
    ],
    recentEvents: [
      { kind: 'post_pass_start', phase: 'tagged_cleanup_post_pass', elapsedMs: 223_000 },
    ],
  };
}

function checkpointReturnTrace() {
  return {
    file: '4516-report.pdf',
    rowId: '4516-report',
    error: '',
    elapsedMs: 230_000,
    lastEvent: {
      kind: 'verified_checkpoint',
      reason: 'return:before_post_pass',
      score: 59,
      grade: 'F',
      eligible: true,
      eligibilityReason: 'low_score_timeout_checkpoint_eligible',
      returned: true,
      elapsedMs: 230_000,
    },
    lastVerifiedCheckpointScore: 59,
    lastVerifiedCheckpointGrade: 'F',
    lastVerifiedCheckpointReason: 'return:before_post_pass',
    lastVerifiedCheckpointEligible: true,
    lastVerifiedCheckpointEligibilityReason: 'low_score_timeout_checkpoint_eligible',
    verifiedCheckpointHistory: [
      {
        reason: 'return:before_post_pass',
        score: 59,
        grade: 'F',
        eligible: true,
        eligibilityReason: 'low_score_timeout_checkpoint_eligible',
        returned: true,
        elapsedMs: 230_000,
      },
    ],
  };
}

function runSummary(input: Partial<Long4516RouteRunSummary>): Long4516RouteRunSummary {
  return {
    label: input.label ?? 'run',
    runDir: '/run',
    reportPath: '/run/baseline_report.json',
    tracePath: input.tracePath ?? null,
    traceKind: input.traceKind ?? null,
    present: input.present ?? true,
    file: '4516-report.pdf',
    classification: input.classification ?? 'completed_low_route_without_trace',
    beforeScore: input.beforeScore ?? 43,
    beforeGrade: 'F',
    score: input.score ?? 59,
    grade: input.grade ?? 'F',
    deterministicScore: input.score ?? 59,
    deterministicGrade: input.grade ?? 'F',
    durationMs: input.durationMs ?? 200_000,
    error: input.error ?? null,
    hardTimeout: input.hardTimeout ?? false,
    falsePositiveApplied: 0,
    beforeCategories: input.beforeCategories ?? {
      title_language: 0,
      heading_structure: 44,
      alt_text: 0,
      pdf_ua_compliance: 38,
      table_markup: 0,
      reading_order: 79,
    },
    afterCategories: input.afterCategories ?? {
      title_language: 100,
      heading_structure: 78,
      alt_text: 0,
      pdf_ua_compliance: 57,
      table_markup: 100,
      reading_order: 79,
    },
    appliedToolCount: 2,
    appliedOutcomeCounts: [{ key: 'applied', count: 2 }],
    scoreMovingToolCount: 2,
    firstTools: [],
    lastTools: [],
    deterministicEarlyExitReasons: input.deterministicEarlyExitReasons ?? [],
    traceElapsedMs: input.traceElapsedMs ?? null,
    traceEventCount: input.traceEventCount ?? null,
    lastEventKind: input.lastEventKind ?? null,
    lastEventReason: input.lastEventReason ?? null,
    lastPostPassPhase: input.lastPostPassPhase ?? null,
    bestCheckpointScore: input.bestCheckpointScore ?? null,
    bestCheckpointGrade: input.bestCheckpointGrade ?? null,
    bestCheckpointReason: input.bestCheckpointReason ?? null,
    bestCheckpointEligible: input.bestCheckpointEligible ?? null,
    bestCheckpointEligibilityReason: input.bestCheckpointEligibilityReason ?? null,
    lastReturnedCheckpointReason: input.lastReturnedCheckpointReason ?? null,
    returnedCheckpointScore: input.returnedCheckpointScore ?? null,
    evidence: input.evidence ?? [],
  };
}

describe('long4516 route repeatability diagnostic', () => {
  it('parks mixed timeout, high-complete, and low-checkpoint outcomes as volatile', () => {
    const diagnostic = buildLong4516RouteRepeatabilityDiagnostic({
      generatedAt: '2026-05-22T00:00:00.000Z',
      runs: [
        runSummary({
          label: 'timeout',
          classification: 'tagged_cleanup_timeout_after_below_floor_checkpoint',
          beforeScore: 76,
          score: 0,
          grade: '?',
          hardTimeout: true,
          error: 'per_pdf_timeout_300000ms',
          lastPostPassPhase: 'tagged_cleanup_post_pass',
          bestCheckpointScore: 83,
          bestCheckpointGrade: 'B',
          bestCheckpointEligible: false,
          beforeCategories: { heading_structure: 78, alt_text: 80, table_markup: 100 },
        }),
        runSummary({
          label: 'high',
          classification: 'completed_high_route_without_trace',
          beforeScore: 58,
          score: 85,
          grade: 'B',
          beforeCategories: { heading_structure: 78, alt_text: 0, table_markup: 100 },
        }),
        runSummary({
          label: 'low-return',
          classification: 'verified_low_checkpoint_return_before_post_pass',
          beforeScore: 43,
          score: 59,
          lastReturnedCheckpointReason: 'return:before_post_pass',
          returnedCheckpointScore: 59,
          deterministicEarlyExitReasons: [{ key: 'verified_low_score_checkpoint_timeout_return', count: 2 }],
        }),
      ],
    });

    expect(diagnostic.summary.decision.status).toBe('route_runtime_volatile_no_behavior_ready');
    expect(diagnostic.summary.beforeScoreRange).toBe(33);
    expect(diagnostic.summary.initialCategoryVarianceKeys).toContain('alt_text');
    expect(renderLong4516RouteRepeatabilityMarkdown(diagnostic)).toContain('route_runtime_volatile_no_behavior_ready');
  });

  it('plans a tagged-cleanup probe only when that shape repeats cleanly', () => {
    const diagnostic = buildLong4516RouteRepeatabilityDiagnostic({
      runs: [
        runSummary({
          classification: 'tagged_cleanup_timeout_after_below_floor_checkpoint',
          hardTimeout: true,
          score: 0,
          beforeScore: 76,
          beforeCategories: { heading_structure: 78, alt_text: 80, table_markup: 100 },
        }),
        runSummary({
          classification: 'tagged_cleanup_timeout_after_below_floor_checkpoint',
          hardTimeout: true,
          score: 0,
          beforeScore: 76,
          beforeCategories: { heading_structure: 78, alt_text: 80, table_markup: 100 },
        }),
      ],
    });

    expect(diagnostic.summary.decision.status).toBe('plan_repeatable_tagged_cleanup_probe');
  });

  it('writes JSON and Markdown from benchmark report and trace files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-long4516-repeat-'));
    try {
      const timeoutRun = join(dir, 'timeout-run');
      const highRun = join(dir, 'high-run');
      const lowRun = join(dir, 'low-run');
      await mkdir(join(timeoutRun, 'runtime-timeouts'), { recursive: true });
      await mkdir(join(lowRun, 'runtime-traces'), { recursive: true });
      await mkdir(highRun, { recursive: true });
      await writeFile(join(timeoutRun, 'baseline_report.json'), JSON.stringify({
        rows: [row({
          beforeScore: 76,
          afterScore: 0,
          afterGrade: '?',
          error: 'per_pdf_timeout_300000ms',
          beforeCategories: { heading_structure: 78, alt_text: 80, table_markup: 100 },
          tools: [],
        })],
      }), 'utf8');
      await writeFile(
        join(timeoutRun, 'runtime-timeouts', '4516-report.json'),
        JSON.stringify(taggedCleanupTimeoutTrace()),
        'utf8',
      );
      await writeFile(join(highRun, 'baseline_report.json'), JSON.stringify({
        rows: [row({
          beforeScore: 58,
          afterScore: 85,
          afterGrade: 'B',
          beforeCategories: { heading_structure: 78, alt_text: 0, table_markup: 100 },
          afterCategories: { heading_structure: 78, alt_text: 80, table_markup: 100, reading_order: 79, title_language: 100, pdf_ua_compliance: 57 },
        })],
      }), 'utf8');
      await writeFile(join(lowRun, 'baseline_report.json'), JSON.stringify({
        rows: [row({ beforeScore: 43, afterScore: 59, afterGrade: 'F' })],
      }), 'utf8');
      await writeFile(
        join(lowRun, 'runtime-traces', '4516-report.json'),
        JSON.stringify(checkpointReturnTrace()),
        'utf8',
      );

      const outDir = join(dir, 'out');
      const diagnostic = await writeLong4516RouteRepeatabilityDiagnostic({
        runs: [
          { label: 'timeout', path: timeoutRun },
          { label: 'high', path: join(highRun, 'baseline_report.json') },
          { label: 'low', path: lowRun },
        ],
        outDir,
      });
      const json = JSON.parse(await readFile(join(outDir, 'long4516-route-repeatability-diagnostic.json'), 'utf8')) as Record<string, unknown>;
      const md = await readFile(join(outDir, 'long4516-route-repeatability-diagnostic.md'), 'utf8');

      expect(diagnostic.summary.decision.status).toBe('route_runtime_volatile_no_behavior_ready');
      expect(json).toMatchObject({ summary: { hardTimeoutRuns: 1, highCompletedRuns: 1 } });
      expect(md).toContain('Long-4516 Route Repeatability Diagnostic');
      expect(md).toContain('verified_low_checkpoint_return_before_post_pass');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
