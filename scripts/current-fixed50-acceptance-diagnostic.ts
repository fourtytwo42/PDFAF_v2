#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RemediateBenchmarkRow, BenchmarkRunSummary } from '../src/services/benchmark/experimentCorpus.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import { loadBenchmarkSummaryFromRunDir } from '../src/services/benchmark/compareRuns.js';

const DEFAULT_RUN = 'Output/experiment-corpus-baseline/run-goal-current-fixed50-2026-05-09-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/current-fixed50-acceptance-diagnostic-2026-05-09-r1';

const PARKED_ROUTE_ROWS = new Set([
  'fixture-inaccessible',
  'figure-4754',
  'structure-3775',
]);

const PARKED_RUNTIME_ROWS = new Set([
  'structure-4438',
]);

const PARKED_ANALYZER_ROWS = new Set([
  'structure-4076',
]);

export type CurrentFixed50Classification =
  | 'accepted_quality_row'
  | 'parked_runtime_debt'
  | 'parked_route_volatility'
  | 'parked_analyzer_or_table_debt'
  | 'runtime_timeout_blocker'
  | 'residual_score_blocker'
  | 'runtime_tail_observation';

export interface CurrentFixed50DiagnosticRow {
  id: string;
  classification: CurrentFixed50Classification;
  score: number | null;
  grade: string | null;
  wallMs: number | null;
  attemptCount: number;
  hardTimeout: boolean;
  falsePositiveApplied: boolean;
  reason: string;
}

export interface CurrentFixed50AcceptanceDiagnostic {
  generatedAt: string;
  runDir: string;
  stage42BaselineAvailable: boolean;
  summary: {
    selectedCount: number;
    remediatedCount: number;
    remediatedErrors: number;
    mean: number | null;
    median: number | null;
    p95WallMs: number | null;
    attemptCount: number;
    falsePositiveAppliedCount: number;
    hardTimeoutRows: string[];
    nonParkedTimeoutRows: string[];
    nonParkedLowScoreRows: string[];
    decision:
      | 'acceptance_ready_with_parked_debt'
      | 'blocked_by_missing_stage42_baseline'
      | 'blocked_by_non_parked_runtime_or_score_debt'
      | 'blocked_by_false_positive';
    nextAction: string;
  };
  rows: CurrentFixed50DiagnosticRow[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/current-fixed50-acceptance-diagnostic.ts [options]',
    '  --run <run-dir>',
    '  --out <dir>',
    '  --stage42-present <true|false>',
  ].join('\n');
}

function scoreFor(row: RemediateBenchmarkRow): number | null {
  return row.reanalyzedScore ?? row.afterScore ?? null;
}

function gradeFor(row: RemediateBenchmarkRow): string | null {
  return row.reanalyzedGrade ?? row.afterGrade ?? null;
}

function wallFor(row: RemediateBenchmarkRow): number | null {
  return typeof row.wallRemediateMs === 'number' && Number.isFinite(row.wallRemediateMs) ? row.wallRemediateMs : null;
}

function isHardTimeout(row: RemediateBenchmarkRow): boolean {
  return /aborted due to timeout|timeout/i.test(row.error ?? '') && scoreFor(row) == null;
}

function falsePositiveApplied(row: RemediateBenchmarkRow): boolean {
  const record = row as RemediateBenchmarkRow & { falsePositiveApplied?: boolean; falsePositiveAppliedCount?: number };
  if (record.falsePositiveApplied === true || Number(record.falsePositiveAppliedCount ?? 0) > 0) return true;
  return JSON.stringify(row.remediationOutcomeSummary ?? {}).includes('false_positive_applied') ||
    JSON.stringify(row.appliedTools ?? []).includes('false_positive_applied');
}

function classifyRow(row: RemediateBenchmarkRow): CurrentFixed50DiagnosticRow {
  const score = scoreFor(row);
  const grade = gradeFor(row);
  const hardTimeout = isHardTimeout(row);
  const fp = falsePositiveApplied(row);
  let classification: CurrentFixed50Classification = 'accepted_quality_row';
  let reason = 'completed at or above A/B acceptance quality';

  if (hardTimeout && PARKED_RUNTIME_ROWS.has(row.id)) {
    classification = 'parked_runtime_debt';
    reason = 'documented parked hard-timeout/checkpoint debt';
  } else if (hardTimeout && PARKED_ANALYZER_ROWS.has(row.id)) {
    classification = 'parked_analyzer_or_table_debt';
    reason = 'documented analyzer/table-applicability debt, but current run still timed out';
  } else if (hardTimeout) {
    classification = 'runtime_timeout_blocker';
    reason = 'hard timeout is not in the parked runtime set';
  } else if (PARKED_ROUTE_ROWS.has(row.id) && (score ?? 0) < 90) {
    classification = 'parked_route_volatility';
    reason = 'known route-volatility row below A in this repeat';
  } else if (PARKED_ANALYZER_ROWS.has(row.id) && (score ?? 0) < 90) {
    classification = 'parked_analyzer_or_table_debt';
    reason = 'known analyzer/table-applicability debt below A in this repeat';
  } else if ((score ?? 0) < 80) {
    classification = 'residual_score_blocker';
    reason = 'non-parked row remains below B quality';
  } else if ((wallFor(row) ?? 0) >= 100000) {
    classification = 'runtime_tail_observation';
    reason = 'completed with acceptable quality but remains in runtime tail';
  }

  return {
    id: row.id,
    classification,
    score,
    grade,
    wallMs: wallFor(row),
    attemptCount: row.appliedTools?.length ?? 0,
    hardTimeout,
    falsePositiveApplied: fp,
    reason,
  };
}

function sumAttempts(rows: RemediateBenchmarkRow[]): number {
  return rows.reduce((sum, row) => sum + (row.appliedTools?.length ?? 0), 0);
}

export function buildCurrentFixed50AcceptanceDiagnostic(input: {
  runDir: string;
  summary: BenchmarkRunSummary;
  rows: RemediateBenchmarkRow[];
  stage42BaselineAvailable: boolean;
  generatedAt?: string;
}): CurrentFixed50AcceptanceDiagnostic {
  const diagnosticRows = input.rows.map(classifyRow).sort((a, b) => a.id.localeCompare(b.id));
  const falsePositiveAppliedCount = diagnosticRows.filter(row => row.falsePositiveApplied).length;
  const hardTimeoutRows = diagnosticRows.filter(row => row.hardTimeout).map(row => row.id).sort();
  const nonParkedTimeoutRows = diagnosticRows
    .filter(row => row.classification === 'runtime_timeout_blocker')
    .map(row => row.id)
    .sort();
  const nonParkedLowScoreRows = diagnosticRows
    .filter(row => row.classification === 'residual_score_blocker')
    .map(row => row.id)
    .sort();

  let decision: CurrentFixed50AcceptanceDiagnostic['summary']['decision'] = 'acceptance_ready_with_parked_debt';
  let nextAction = 'Run Stage 41 with the Stage 42 protected baseline available, or document remaining parked debt if the gate failure is only parked rows.';
  if (falsePositiveAppliedCount > 0) {
    decision = 'blocked_by_false_positive';
    nextAction = 'Stop and inspect false-positive-applied rows before any acceptance decision.';
  } else if (nonParkedTimeoutRows.length > 0 || nonParkedLowScoreRows.length > 0) {
    decision = 'blocked_by_non_parked_runtime_or_score_debt';
    nextAction = 'Run focused diagnostics for non-parked timeout or low-score rows before behavior changes.';
  } else if (!input.stage42BaselineAvailable) {
    decision = 'blocked_by_missing_stage42_baseline';
    nextAction = 'Restore or regenerate the Stage 42 protected baseline artifact before a literal Stage 41 gate.';
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runDir: input.runDir,
    stage42BaselineAvailable: input.stage42BaselineAvailable,
    summary: {
      selectedCount: input.summary.counts.selectedEntries,
      remediatedCount: input.summary.counts.remediateSuccess,
      remediatedErrors: input.summary.counts.remediateErrors,
      mean: input.summary.remediate?.reanalyzedScore.mean ?? null,
      median: input.summary.remediate?.reanalyzedScore.median ?? null,
      p95WallMs: input.summary.remediate?.wallRemediateMs.p95 ?? null,
      attemptCount: sumAttempts(input.rows),
      falsePositiveAppliedCount,
      hardTimeoutRows,
      nonParkedTimeoutRows,
      nonParkedLowScoreRows,
      decision,
      nextAction,
    },
    rows: diagnosticRows,
  };
}

function markdown(report: CurrentFixed50AcceptanceDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Current Fixed-50 Acceptance Diagnostic', '');
  lines.push(`- Run: \`${report.runDir}\``);
  lines.push(`- Stage 42 baseline available: \`${report.stage42BaselineAvailable}\``);
  lines.push(`- Decision: \`${report.summary.decision}\``);
  lines.push(`- Mean / median: \`${report.summary.mean}\` / \`${report.summary.median}\``);
  lines.push(`- Remediation success: \`${report.summary.remediatedCount}/${report.summary.selectedCount}\``);
  lines.push(`- p95 wall: \`${report.summary.p95WallMs}ms\``);
  lines.push(`- Attempts: \`${report.summary.attemptCount}\``);
  lines.push(`- False-positive applied: \`${report.summary.falsePositiveAppliedCount}\``);
  lines.push(`- Hard timeout rows: ${report.summary.hardTimeoutRows.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push(`- Non-parked timeout rows: ${report.summary.nonParkedTimeoutRows.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push(`- Non-parked low-score rows: ${report.summary.nonParkedLowScoreRows.map(id => `\`${id}\``).join(', ') || 'none'}`, '');
  lines.push(`Next action: ${report.summary.nextAction}`, '');
  lines.push('| Row | Class | Score | Grade | Wall ms | Attempts | Reason |');
  lines.push('| --- | --- | ---: | --- | ---: | ---: | --- |');
  for (const row of report.rows.filter(item => item.classification !== 'accepted_quality_row' && item.classification !== 'runtime_tail_observation')) {
    lines.push(`| \`${row.id}\` | \`${row.classification}\` | ${row.score ?? 'n/a'} | ${row.grade ?? 'n/a'} | ${row.wallMs ?? 'n/a'} | ${row.attemptCount} | ${row.reason} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let runDir = DEFAULT_RUN;
  let outDir = DEFAULT_OUT;
  let stage42BaselineAvailable = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--run' && value) {
      runDir = value;
      index += 1;
    } else if (arg === '--out' && value) {
      outDir = value;
      index += 1;
    } else if (arg === '--stage42-present' && value) {
      stage42BaselineAvailable = value === 'true';
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${usage()}`);
    }
  }

  const [summary, rows] = await Promise.all([
    loadBenchmarkSummaryFromRunDir(runDir),
    loadBenchmarkRowsFromRunDir(runDir),
  ]);
  const report = buildCurrentFixed50AcceptanceDiagnostic({
    runDir,
    summary,
    rows: rows.remediateResults,
    stage42BaselineAvailable,
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'current-fixed50-acceptance-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'current-fixed50-acceptance-diagnostic.md'), markdown(report));

  console.log(`Wrote current fixed-50 acceptance diagnostic to ${outDir}`);
  console.log(`Decision: ${report.summary.decision}`);
  console.log(`Mean: ${report.summary.mean}, false-positive applied: ${report.summary.falsePositiveAppliedCount}`);
  if (report.summary.decision !== 'acceptance_ready_with_parked_debt') process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
