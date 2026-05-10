#!/usr/bin/env tsx
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DEFAULT_RUN =
  'Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-10-r1';
const DEFAULT_OVERLAY_ROWS =
  'Output/goal-all-input-mean-2026-05-09-r1/fresh-overlay-runtime-route-reading-shell-2026-05-10-r1/all-input-rows.merged.json';
const DEFAULT_OUT =
  'Output/goal-all-input-mean-2026-05-09-r1/low-checkpoint-timeout-diagnostic-2026-05-10-r1';

export type LowCheckpointTimeoutClassification =
  | 'eligible_checkpoint_terminal_bug'
  | 'below_floor_needs_safety_replay'
  | 'low_checkpoint_too_poor'
  | 'checkpoint_unsafe_non_floor'
  | 'no_checkpoint_progress'
  | 'missing_timeout_trace'
  | 'not_hard_timeout';

export interface AllInputBaselineRow {
  file: string;
  beforeScore?: number | null;
  beforeGrade?: string | null;
  afterScore?: number | null;
  afterGrade?: string | null;
  afterDeterministicScore?: number | null;
  afterDeterministicGrade?: string | null;
  durationMs?: number | null;
  falsePositiveApplied?: number | null;
  error?: string | null;
}

export interface RuntimeTimeoutCheckpoint {
  reason: string;
  score: number;
  grade: string | null;
  appliedToolCount: number;
  eligible: boolean;
  eligibilityReason: string;
  returned: boolean;
  elapsedMs: number;
}

export interface RuntimeTimeoutTrace {
  file: string;
  rowId: string;
  error: string | null;
  elapsedMs: number | null;
  lastPhase: string | null;
  lastToolName: string | null;
  lastToolOutcome: string | null;
  lastVerifiedCheckpointScore: number | null;
  lastVerifiedCheckpointGrade: string | null;
  lastVerifiedCheckpointEligible: boolean | null;
  lastVerifiedCheckpointEligibilityReason: string | null;
  verifiedCheckpointHistory: RuntimeTimeoutCheckpoint[];
}

export interface LowCheckpointTimeoutRow {
  id: string;
  file: string;
  classification: LowCheckpointTimeoutClassification;
  beforeScore: number | null;
  currentScore: number | null;
  currentGrade: string | null;
  wallMs: number | null;
  traceElapsedMs: number | null;
  falsePositiveApplied: number;
  bestCheckpointScore: number | null;
  bestCheckpointGrade: string | null;
  bestCheckpointReason: string | null;
  bestCheckpointAppliedToolCount: number | null;
  bestCheckpointElapsedMs: number | null;
  bestCheckpointEligible: boolean | null;
  bestCheckpointEligibilityReason: string | null;
  projectedPointGainVsTimeout: number;
  projectedPointGainVsCurrent: number;
  recommendedAction: string;
}

export interface LowCheckpointTimeoutReport {
  generatedAt: string;
  runDir: string;
  overlayRowsPath: string | null;
  summary: {
    rowCount: number;
    hardTimeoutRows: number;
    classificationCounts: Array<{ key: LowCheckpointTimeoutClassification; count: number }>;
    projectedRecoverablePointsIfSafe: number;
    projectedRecoverableMeanIfSafe: number | null;
    recommendedNextAction: string;
  };
  rows: LowCheckpointTimeoutRow[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/all-input-low-checkpoint-timeout-diagnostic.ts [options]',
    '  --run <run-dir-or-baseline-report-json>',
    '  --overlay-rows <all-input-rows.merged.json>',
    '  --out <dir>',
  ].join('\n');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function fileId(file: string): string {
  return file.replace(/\.pdf$/i, '');
}

function scoreFor(row: AllInputBaselineRow): number | null {
  return row.afterScore ?? row.afterDeterministicScore ?? null;
}

function gradeFor(row: AllInputBaselineRow): string | null {
  return row.afterGrade ?? row.afterDeterministicGrade ?? null;
}

function isHardTimeout(row: AllInputBaselineRow): boolean {
  return /timeout|aborted|abort/i.test(String(row.error ?? '')) && (scoreFor(row) ?? 0) <= 0;
}

function checkpointFromRaw(value: unknown): RuntimeTimeoutCheckpoint | null {
  const record = asRecord(value);
  if (!record) return null;
  const reason = stringOrNull(record.reason);
  const score = numberOrNull(record.score);
  if (!reason || score == null) return null;
  return {
    reason,
    score,
    grade: stringOrNull(record.grade),
    appliedToolCount: numberOrNull(record.appliedToolCount) ?? 0,
    eligible: record.eligible === true,
    eligibilityReason: stringOrNull(record.eligibilityReason) ?? 'unknown',
    returned: record.returned === true,
    elapsedMs: numberOrNull(record.elapsedMs) ?? 0,
  };
}

export function parseRuntimeTimeoutTrace(value: unknown): RuntimeTimeoutTrace | null {
  const record = asRecord(value);
  if (!record) return null;
  const file = stringOrNull(record.file);
  const rowId = stringOrNull(record.rowId);
  if (!file || !rowId) return null;
  const history = Array.isArray(record.verifiedCheckpointHistory)
    ? record.verifiedCheckpointHistory.map(checkpointFromRaw).filter((item): item is RuntimeTimeoutCheckpoint => Boolean(item))
    : [];
  return {
    file,
    rowId,
    error: stringOrNull(record.error),
    elapsedMs: numberOrNull(record.elapsedMs),
    lastPhase: stringOrNull(record.lastPhase),
    lastToolName: stringOrNull(record.lastToolName),
    lastToolOutcome: stringOrNull(record.lastToolOutcome),
    lastVerifiedCheckpointScore: numberOrNull(record.lastVerifiedCheckpointScore),
    lastVerifiedCheckpointGrade: stringOrNull(record.lastVerifiedCheckpointGrade),
    lastVerifiedCheckpointEligible: typeof record.lastVerifiedCheckpointEligible === 'boolean'
      ? record.lastVerifiedCheckpointEligible
      : null,
    lastVerifiedCheckpointEligibilityReason: stringOrNull(record.lastVerifiedCheckpointEligibilityReason),
    verifiedCheckpointHistory: history,
  };
}

function bestCheckpoint(trace: RuntimeTimeoutTrace | null): RuntimeTimeoutCheckpoint | null {
  if (!trace || trace.verifiedCheckpointHistory.length === 0) return null;
  return [...trace.verifiedCheckpointHistory].sort((a, b) =>
    b.score - a.score ||
    a.appliedToolCount - b.appliedToolCount ||
    a.elapsedMs - b.elapsedMs ||
    a.reason.localeCompare(b.reason),
  )[0] ?? null;
}

function classifyTimeoutRow(input: {
  row: AllInputBaselineRow;
  trace: RuntimeTimeoutTrace | null;
  best: RuntimeTimeoutCheckpoint | null;
}): LowCheckpointTimeoutClassification {
  if (!isHardTimeout(input.row)) return 'not_hard_timeout';
  if (!input.trace) return 'missing_timeout_trace';
  const best = input.best;
  if (!best) return 'no_checkpoint_progress';
  if (best.eligible) return 'eligible_checkpoint_terminal_bug';
  const reason = best.eligibilityReason;
  if (/checkpoint_below_floor/i.test(reason)) {
    const beforeScore = input.row.beforeScore ?? 0;
    const gain = best.score - beforeScore;
    if (best.score >= 50 && gain >= 20) return 'below_floor_needs_safety_replay';
    return 'low_checkpoint_too_poor';
  }
  if (/no_score_improvement/i.test(reason)) return 'no_checkpoint_progress';
  return 'checkpoint_unsafe_non_floor';
}

function recommendedAction(row: LowCheckpointTimeoutRow): string {
  switch (row.classification) {
    case 'eligible_checkpoint_terminal_bug':
      return 'Inspect why an eligible checkpoint was not terminally returned before the hard timeout.';
    case 'below_floor_needs_safety_replay':
      return 'Replay checkpoint safety without the score floor before considering an honest low-score timeout return.';
    case 'low_checkpoint_too_poor':
      return 'Keep parked; checkpoint is too low to help the 93 mean enough without a real fixer.';
    case 'checkpoint_unsafe_non_floor':
      return 'Do not return checkpoint; fix or park the underlying safety regression first.';
    case 'no_checkpoint_progress':
      return 'No useful verified checkpoint was reached; prioritize upstream route/fixer work.';
    case 'missing_timeout_trace':
      return 'Rerun with runtime timeout traces enabled before changing behavior.';
    case 'not_hard_timeout':
      return 'Not a hard-timeout row.';
  }
}

function makeRow(row: AllInputBaselineRow, trace: RuntimeTimeoutTrace | null): LowCheckpointTimeoutRow {
  const best = bestCheckpoint(trace);
  const classification = classifyTimeoutRow({ row, trace, best });
  const beforeScore = row.beforeScore ?? null;
  const currentScore = scoreFor(row);
  const pointGainVsTimeout = best && isHardTimeout(row) ? Math.max(0, best.score - (currentScore ?? 0)) : 0;
  const pointGainVsCurrent = best ? Math.max(0, best.score - (currentScore ?? 0)) : 0;
  const out: LowCheckpointTimeoutRow = {
    id: fileId(row.file),
    file: row.file,
    classification,
    beforeScore,
    currentScore,
    currentGrade: gradeFor(row),
    wallMs: row.durationMs ?? null,
    traceElapsedMs: trace?.elapsedMs ?? null,
    falsePositiveApplied: row.falsePositiveApplied ?? 0,
    bestCheckpointScore: best?.score ?? null,
    bestCheckpointGrade: best?.grade ?? null,
    bestCheckpointReason: best?.reason ?? null,
    bestCheckpointAppliedToolCount: best?.appliedToolCount ?? null,
    bestCheckpointElapsedMs: best?.elapsedMs ?? null,
    bestCheckpointEligible: best?.eligible ?? null,
    bestCheckpointEligibilityReason: best?.eligibilityReason ?? trace?.lastVerifiedCheckpointEligibilityReason ?? null,
    projectedPointGainVsTimeout: pointGainVsTimeout,
    projectedPointGainVsCurrent: pointGainVsCurrent,
    recommendedAction: '',
  };
  out.recommendedAction = recommendedAction(out);
  return out;
}

function classificationCounts(rows: LowCheckpointTimeoutRow[]): Array<{ key: LowCheckpointTimeoutClassification; count: number }> {
  const counts = new Map<LowCheckpointTimeoutClassification, number>();
  for (const row of rows) counts.set(row.classification, (counts.get(row.classification) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function buildLowCheckpointTimeoutReport(input: {
  rows: AllInputBaselineRow[];
  traces: Map<string, RuntimeTimeoutTrace>;
  runDir: string;
  overlayRowsPath?: string | null;
  generatedAt?: string;
}): LowCheckpointTimeoutReport {
  const timeoutRows = input.rows.filter(isHardTimeout);
  const rows = timeoutRows.map(row => makeRow(row, input.traces.get(fileId(row.file)) ?? null))
    .sort((a, b) =>
      b.projectedPointGainVsTimeout - a.projectedPointGainVsTimeout ||
      (b.bestCheckpointScore ?? -1) - (a.bestCheckpointScore ?? -1) ||
      a.id.localeCompare(b.id),
    );
  const projectedRecoverablePointsIfSafe = rows
    .filter(row => row.classification === 'below_floor_needs_safety_replay' || row.classification === 'eligible_checkpoint_terminal_bug')
    .reduce((sum, row) => sum + row.projectedPointGainVsTimeout, 0);
  const projectedRecoverableMeanIfSafe = input.rows.length > 0
    ? input.rows.reduce((sum, row) => sum + (scoreFor(row) ?? 0), 0) / input.rows.length +
      projectedRecoverablePointsIfSafe / input.rows.length
    : null;
  const needsSafetyReplay = rows.filter(row => row.classification === 'below_floor_needs_safety_replay').length;
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runDir: resolve(input.runDir),
    overlayRowsPath: input.overlayRowsPath ? resolve(input.overlayRowsPath) : null,
    summary: {
      rowCount: input.rows.length,
      hardTimeoutRows: timeoutRows.length,
      classificationCounts: classificationCounts(rows),
      projectedRecoverablePointsIfSafe,
      projectedRecoverableMeanIfSafe,
      recommendedNextAction: needsSafetyReplay > 0
        ? 'Run a focused checkpoint-safety replay for below-floor candidates before changing checkpoint return policy.'
        : 'No low-checkpoint timeout return candidate is ready for behavior; continue route/fixer diagnostics.',
    },
    rows,
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function loadRows(pathOrDir: string): Promise<AllInputBaselineRow[]> {
  const resolved = resolve(pathOrDir);
  const info = await stat(resolved);
  if (info.isDirectory()) {
    const direct = join(resolved, 'baseline_report.json');
    try {
      const raw = await readJson(direct);
      const rows = asRecord(raw)?.rows;
      if (Array.isArray(rows)) return rows as AllInputBaselineRow[];
    } catch {
      // Fall through to shard loading.
    }
    const names = await readdir(resolved);
    const nested = await Promise.all(names.map(async name => {
      const child = join(resolved, name);
      try {
        const childStat = await stat(child);
        if (!childStat.isDirectory()) return [];
        return await loadRows(child);
      } catch {
        return [];
      }
    }));
    return nested.flat();
  }
  const raw = await readJson(resolved);
  if (Array.isArray(raw)) return raw as AllInputBaselineRow[];
  const rows = asRecord(raw)?.rows;
  return Array.isArray(rows) ? rows as AllInputBaselineRow[] : [];
}

async function loadTimeoutTraces(dir: string): Promise<Map<string, RuntimeTimeoutTrace>> {
  const base = resolve(dir);
  const traces = new Map<string, RuntimeTimeoutTrace>();
  async function visit(path: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(path);
    } catch {
      return;
    }
    await Promise.all(entries.map(async name => {
      const child = join(path, name);
      const childStat = await stat(child);
      if (childStat.isDirectory()) {
        await visit(child);
        return;
      }
      if (!child.endsWith('.json') || !child.includes('/runtime-timeouts/')) return;
      const parsed = parseRuntimeTimeoutTrace(await readJson(child));
      if (parsed) traces.set(parsed.rowId, parsed);
    }));
  }
  await visit(base);
  return traces;
}

function renderMarkdown(report: LowCheckpointTimeoutReport): string {
  const lines: string[] = [];
  lines.push('# All-Input Low Checkpoint Timeout Diagnostic', '');
  lines.push(`- Run: \`${report.runDir}\``);
  if (report.overlayRowsPath) lines.push(`- Overlay rows: \`${report.overlayRowsPath}\``);
  lines.push(`- Rows: \`${report.summary.rowCount}\``);
  lines.push(`- Hard-timeout rows: \`${report.summary.hardTimeoutRows}\``);
  lines.push(`- Projected recoverable points if safety replay passes: \`${report.summary.projectedRecoverablePointsIfSafe}\``);
  lines.push(`- Projected mean if safe candidates were returned: \`${report.summary.projectedRecoverableMeanIfSafe?.toFixed(4) ?? 'n/a'}\``);
  lines.push(`- Next action: ${report.summary.recommendedNextAction}`, '');
  lines.push('## Classification Counts', '');
  for (const count of report.summary.classificationCounts) {
    lines.push(`- \`${count.key}\`: \`${count.count}\``);
  }
  lines.push('', '## Timeout Rows', '');
  lines.push('| Row | Current | Best checkpoint | Classification | Eligibility | Projected points | Action |');
  lines.push('| --- | ---: | ---: | --- | --- | ---: | --- |');
  for (const row of report.rows) {
    lines.push(`| \`${row.id}\` | ${row.currentScore ?? 'n/a'}/${row.currentGrade ?? 'n/a'} | ${row.bestCheckpointScore ?? 'n/a'}/${row.bestCheckpointGrade ?? 'n/a'} | \`${row.classification}\` | \`${row.bestCheckpointEligibilityReason ?? 'n/a'}\` | ${row.projectedPointGainVsTimeout} | ${row.recommendedAction} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let run = DEFAULT_RUN;
  let overlayRows: string | null = DEFAULT_OVERLAY_ROWS;
  let out = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      return;
    }
    if (arg === '--run' && value) {
      run = value;
      index += 1;
    } else if (arg === '--overlay-rows' && value) {
      overlayRows = value === 'none' ? null : value;
      index += 1;
    } else if (arg === '--out' && value) {
      out = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  const rows = overlayRows ? await loadRows(overlayRows) : await loadRows(run);
  const traces = await loadTimeoutTraces(run);
  const report = buildLowCheckpointTimeoutReport({ rows, traces, runDir: run, overlayRowsPath: overlayRows });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'low-checkpoint-timeout-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'low-checkpoint-timeout-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${join(outDir, 'low-checkpoint-timeout-diagnostic.md')}`);
  console.log(`Hard timeouts: ${report.summary.hardTimeoutRows}`);
  console.log(`Projected recoverable points if safe: ${report.summary.projectedRecoverablePointsIfSafe}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
