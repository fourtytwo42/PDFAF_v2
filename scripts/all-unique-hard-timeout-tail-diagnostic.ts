#!/usr/bin/env tsx
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_RUN =
  '/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r2';
const DEFAULT_REPORT = `${DEFAULT_RUN}/merged/baseline_report.json`;
const DEFAULT_OUT = `${DEFAULT_RUN}/hard-timeout-tail-diagnostic-r1`;
const DEFAULT_WALL_TIMEOUT_MS = 300_000;
const DEFAULT_REMEDIATION_ANALYSIS_TIMEOUT_MS = 45_000;
const DEFAULT_SOFT_BUFFER_MS = 50_000;
const DEFAULT_OPTIONAL_POST_ALT_MIN_BUDGET_MS =
  DEFAULT_REMEDIATION_ANALYSIS_TIMEOUT_MS + DEFAULT_SOFT_BUFFER_MS;

export type HardTimeoutTailClassification =
  | 'eligible_checkpoint_terminal_bug'
  | 'stage_reanalysis_timeout_after_expensive_conformance'
  | 'optional_post_alt_budget_overrun_candidate'
  | 'late_no_gain_live_reanalysis_churn'
  | 'low_checkpoint_not_returnable'
  | 'missing_timeout_trace'
  | 'not_hard_timeout';

export type HardTimeoutTailDecision =
  | 'fix_checkpoint_terminalization_first'
  | 'plan_optional_post_alt_budget_guard_probe'
  | 'plan_structure_reanalysis_timeout_probe'
  | 'no_safe_timeout_behavior_ready';

interface CountRow {
  key: string;
  count: number;
}

interface RuntimeTraceEvent {
  kind?: string;
  reason?: string;
  score?: number;
  grade?: string | null;
  appliedToolCount?: number;
  eligible?: boolean;
  eligibilityReason?: string;
  returned?: boolean;
  elapsedMs?: number;
  round?: number;
  stageNumber?: number;
  toolName?: string;
  outcome?: string;
  durationMs?: number;
  context?: string;
  targetRef?: string | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  details?: string;
  reanalyzeMs?: number;
}

interface RuntimeTimeoutTrace {
  file?: string;
  rowId?: string;
  error?: string;
  elapsedMs?: number;
  eventCount?: number;
  eventCounts?: CountRow[];
  lastEvent?: RuntimeTraceEvent;
  lastToolName?: string | null;
  lastToolOutcome?: string | null;
  lastToolDurationMs?: number | null;
  lastVerifiedCheckpointScore?: number | null;
  lastVerifiedCheckpointGrade?: string | null;
  lastVerifiedCheckpointReason?: string | null;
  lastVerifiedCheckpointEligible?: boolean | null;
  lastVerifiedCheckpointEligibilityReason?: string | null;
  liveAnalysisSummary?: {
    count?: number;
    totalMs?: number;
    byContext?: CountDurationRow[];
    top?: Array<{
      context?: string;
      toolName?: string | null;
      targetRef?: string | null;
      durationMs?: number;
      scoreBefore?: number | null;
      scoreAfter?: number | null;
      elapsedMs?: number;
    }>;
  };
  verifiedCheckpointHistory?: RuntimeTraceEvent[];
  recentEvents?: RuntimeTraceEvent[];
}

interface CountDurationRow {
  key?: string;
  count?: number;
  totalMs?: number;
}

interface BaselineReportRow {
  file?: string;
  beforeScore?: number | null;
  beforeGrade?: string | null;
  afterScore?: number | null;
  afterGrade?: string | null;
  afterDeterministicScore?: number | null;
  afterDeterministicGrade?: string | null;
  durationMs?: number | null;
  error?: string | null;
  falsePositiveApplied?: number | null;
}

interface BaselineReport {
  rows?: BaselineReportRow[];
}

interface TimeoutCheckpoint {
  reason: string;
  score: number;
  grade: string | null;
  appliedToolCount: number;
  eligible: boolean;
  eligibilityReason: string;
  returned: boolean;
  elapsedMs: number;
}

export interface HardTimeoutTailRow {
  key: string;
  file: string;
  classification: HardTimeoutTailClassification;
  currentScore: number | null;
  currentGrade: string | null;
  beforeScore: number | null;
  wallMs: number | null;
  traceElapsedMs: number | null;
  timeoutError: string | null;
  falsePositiveApplied: number;
  lastEventKind: string | null;
  lastEventElapsedMs: number | null;
  lastToolName: string | null;
  lastToolOutcome: string | null;
  lastToolDurationMs: number | null;
  bestCheckpointScore: number | null;
  bestCheckpointGrade: string | null;
  bestCheckpointReason: string | null;
  bestCheckpointElapsedMs: number | null;
  bestCheckpointEligibilityReason: string | null;
  bestCheckpointEligible: boolean | null;
  checkpointReturnable: boolean;
  postCheckpointUntracedMs: number | null;
  remainingAfterLastCheckpointMs: number | null;
  optionalPostAltMinBudgetMs: number;
  liveAnalysisCount: number;
  liveAnalysisMs: number;
  noGainLiveAnalysisCount: number;
  noGainLiveAnalysisMs: number;
  expensiveStructureConformanceMs: number;
  projectedPointGainIfCompletedAtCheckpoint: number;
  recommendedAction: string;
  evidence: string[];
}

export interface HardTimeoutTailDiagnostic {
  generatedAt: string;
  runDir: string;
  reportPath: string;
  summary: {
    rows: number;
    hardTimeoutRows: number;
    classificationCounts: Array<{ key: HardTimeoutTailClassification; count: number }>;
    decision: {
      status: HardTimeoutTailDecision;
      recommendation: string;
      reasons: string[];
    };
    projectedPointsIfOptionalBudgetGuardCompletesLowStates: number;
    projectedMeanIfOptionalBudgetGuardCompletesLowStates: number | null;
  };
  rows: HardTimeoutTailRow[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/all-unique-hard-timeout-tail-diagnostic.ts [options]',
    '  --run <all-unique-run-dir>',
    '  --report <baseline_report.json>',
    '  --out <dir>',
    '  --wall-timeout-ms <ms>',
  ].join('\n');
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function rowKeyFromFile(file: string): string {
  return file.match(/^\d{4}\b/)?.[0] ?? basename(file).match(/\b(\d{4})\b/)?.[1] ?? basename(file).replace(/\.pdf$/i, '');
}

function rowKey(row: BaselineReportRow): string {
  return rowKeyFromFile(row.file ?? '');
}

function traceKey(trace: RuntimeTimeoutTrace, fallbackPath: string): string {
  const id = trace.rowId ?? trace.file ?? fallbackPath;
  return rowKeyFromFile(id);
}

function scoreFor(row: BaselineReportRow): number | null {
  return numberOrNull(row.afterScore) ?? numberOrNull(row.afterDeterministicScore);
}

function gradeFor(row: BaselineReportRow): string | null {
  return stringOrNull(row.afterGrade) ?? stringOrNull(row.afterDeterministicGrade);
}

function isHardTimeout(row: BaselineReportRow): boolean {
  const score = scoreFor(row);
  return /timeout|aborted|abort/i.test(String(row.error ?? '')) && (score == null || score <= 0);
}

function checkpointFromEvent(event: RuntimeTraceEvent): TimeoutCheckpoint | null {
  if (event.kind && event.kind !== 'verified_checkpoint') return null;
  const reason = stringOrNull(event.reason);
  const score = numberOrNull(event.score);
  if (!reason || score == null) return null;
  return {
    reason,
    score,
    grade: stringOrNull(event.grade),
    appliedToolCount: numberOrNull(event.appliedToolCount) ?? 0,
    eligible: event.eligible === true,
    eligibilityReason: stringOrNull(event.eligibilityReason) ?? 'unknown',
    returned: event.returned === true,
    elapsedMs: numberOrNull(event.elapsedMs) ?? 0,
  };
}

function checkpoints(trace: RuntimeTimeoutTrace | null): TimeoutCheckpoint[] {
  return (trace?.verifiedCheckpointHistory ?? [])
    .map(checkpointFromEvent)
    .filter((event): event is TimeoutCheckpoint => Boolean(event));
}

function bestCheckpoint(trace: RuntimeTimeoutTrace | null): TimeoutCheckpoint | null {
  const items = checkpoints(trace);
  if (items.length === 0) return null;
  return [...items].sort((a, b) =>
    b.score - a.score ||
    a.appliedToolCount - b.appliedToolCount ||
    a.elapsedMs - b.elapsedMs ||
    a.reason.localeCompare(b.reason),
  )[0] ?? null;
}

function liveAnalysisTop(trace: RuntimeTimeoutTrace | null): RuntimeTimeoutTrace['liveAnalysisSummary']['top'] {
  return trace?.liveAnalysisSummary?.top ?? [];
}

function noGainLiveAnalysisStats(trace: RuntimeTimeoutTrace | null): { count: number; totalMs: number } {
  const items = liveAnalysisTop(trace);
  let count = 0;
  let totalMs = 0;
  for (const item of items) {
    const before = numberOrNull(item.scoreBefore);
    const after = numberOrNull(item.scoreAfter);
    const durationMs = numberOrNull(item.durationMs) ?? 0;
    if (before != null && after != null && after <= before) {
      count += 1;
      totalMs += Math.round(durationMs);
    }
  }
  return { count, totalMs };
}

function expensiveStructureConformanceMs(trace: RuntimeTimeoutTrace | null): number {
  const events = trace?.recentEvents ?? [];
  return Math.round(events
    .filter(event =>
      event.kind === 'tool_finish' &&
      event.toolName === 'repair_structure_conformance' &&
      (numberOrNull(event.durationMs) ?? 0) >= 60_000
    )
    .reduce((sum, event) => sum + (numberOrNull(event.durationMs) ?? 0), 0));
}

function classify(input: {
  row: BaselineReportRow;
  trace: RuntimeTimeoutTrace | null;
  wallTimeoutMs: number;
  optionalPostAltMinBudgetMs: number;
}): HardTimeoutTailClassification {
  if (!isHardTimeout(input.row)) return 'not_hard_timeout';
  const trace = input.trace;
  if (!trace) return 'missing_timeout_trace';
  const best = bestCheckpoint(trace);
  if (best?.eligible || best?.returned) return 'eligible_checkpoint_terminal_bug';

  const lastEventKind = stringOrNull(trace.lastEvent?.kind);
  const lastEventElapsedMs = numberOrNull(trace.lastEvent?.elapsedMs);
  const lastCheckpointElapsedMs = checkpoints(trace).at(-1)?.elapsedMs ?? null;
  const untracedAfterLast = lastEventElapsedMs == null || numberOrNull(trace.elapsedMs) == null
    ? null
    : (numberOrNull(trace.elapsedMs) ?? 0) - lastEventElapsedMs;
  const remainingAfterCheckpoint = lastCheckpointElapsedMs == null
    ? null
    : input.wallTimeoutMs - lastCheckpointElapsedMs;
  const noGain = noGainLiveAnalysisStats(trace);

  if (
    lastEventKind === 'stage_reanalysis_start' &&
    expensiveStructureConformanceMs(trace) >= 60_000
  ) {
    return 'stage_reanalysis_timeout_after_expensive_conformance';
  }
  if (
    lastEventKind === 'verified_checkpoint' &&
    untracedAfterLast != null &&
    untracedAfterLast >= 30_000 &&
    remainingAfterCheckpoint != null &&
    remainingAfterCheckpoint < input.optionalPostAltMinBudgetMs &&
    best != null &&
    /checkpoint_below_floor/i.test(best.eligibilityReason)
  ) {
    return 'optional_post_alt_budget_overrun_candidate';
  }
  if (noGain.count >= 3 && noGain.totalMs >= 60_000) {
    return 'late_no_gain_live_reanalysis_churn';
  }
  return 'low_checkpoint_not_returnable';
}

function recommendation(row: HardTimeoutTailRow): string {
  switch (row.classification) {
    case 'eligible_checkpoint_terminal_bug':
      return 'Fix terminal checkpoint handling before changing remediation behavior.';
    case 'stage_reanalysis_timeout_after_expensive_conformance':
      return 'Do not skip the reanalysis or return the low checkpoint; isolate structure-conformance/reanalysis behavior in a focused replay.';
    case 'optional_post_alt_budget_overrun_candidate':
      return 'Plan a bounded optional-post-alt probe: skip or instrument the optional post-alt pass only when the remaining wall budget cannot cover mutation plus reanalysis, then validate quality.';
    case 'late_no_gain_live_reanalysis_churn':
      return 'Investigate no-gain live analysis churn before adding more figure/table repair work.';
    case 'low_checkpoint_not_returnable':
      return 'Keep parked until a real fixer reaches an above-floor verified state.';
    case 'missing_timeout_trace':
      return 'Rerun with timeout traces before making a behavior change.';
    case 'not_hard_timeout':
      return 'Not a hard-timeout row.';
  }
}

function evidenceFor(input: {
  row: BaselineReportRow;
  trace: RuntimeTimeoutTrace | null;
  classification: HardTimeoutTailClassification;
  best: TimeoutCheckpoint | null;
  postCheckpointUntracedMs: number | null;
  remainingAfterLastCheckpointMs: number | null;
  noGain: { count: number; totalMs: number };
  structureConformanceMs: number;
}): string[] {
  const lines: string[] = [];
  if (input.best) {
    lines.push(`best checkpoint ${input.best.score}/${input.best.grade ?? '?'} at ${input.best.elapsedMs}ms (${input.best.eligibilityReason})`);
  }
  if (input.postCheckpointUntracedMs != null) {
    lines.push(`untraced wall time after last event ${input.postCheckpointUntracedMs}ms`);
  }
  if (input.remainingAfterLastCheckpointMs != null) {
    lines.push(`remaining wall budget after last checkpoint ${input.remainingAfterLastCheckpointMs}ms`);
  }
  if (input.noGain.count > 0) {
    lines.push(`no-gain live analyses ${input.noGain.count} / ${input.noGain.totalMs}ms`);
  }
  if (input.structureConformanceMs > 0) {
    lines.push(`expensive structure conformance ${input.structureConformanceMs}ms`);
  }
  if (input.classification === 'optional_post_alt_budget_overrun_candidate') {
    lines.push('last traced remediation event was a low verified checkpoint, so the later timeout is likely outside traced planner work');
  }
  if (input.classification === 'stage_reanalysis_timeout_after_expensive_conformance') {
    lines.push('last traced remediation event was stage_reanalysis_start after expensive structure conformance');
  }
  if (lines.length === 0 && input.row.error) lines.push(String(input.row.error));
  return lines;
}

function makeRow(input: {
  row: BaselineReportRow;
  trace: RuntimeTimeoutTrace | null;
  wallTimeoutMs: number;
  optionalPostAltMinBudgetMs: number;
}): HardTimeoutTailRow {
  const best = bestCheckpoint(input.trace);
  const classification = classify(input);
  const lastEventElapsedMs = numberOrNull(input.trace?.lastEvent?.elapsedMs);
  const traceElapsedMs = numberOrNull(input.trace?.elapsedMs);
  const lastCheckpointElapsedMs = checkpoints(input.trace).at(-1)?.elapsedMs ?? null;
  const postCheckpointUntracedMs = traceElapsedMs == null || lastEventElapsedMs == null
    ? null
    : traceElapsedMs - lastEventElapsedMs;
  const remainingAfterLastCheckpointMs = lastCheckpointElapsedMs == null
    ? null
    : input.wallTimeoutMs - lastCheckpointElapsedMs;
  const noGain = noGainLiveAnalysisStats(input.trace);
  const structureConformanceMs = expensiveStructureConformanceMs(input.trace);
  const currentScore = scoreFor(input.row);
  const row: HardTimeoutTailRow = {
    key: rowKey(input.row) || traceKey(input.trace ?? {}, input.row.file ?? ''),
    file: input.row.file ?? input.trace?.file ?? '',
    classification,
    currentScore,
    currentGrade: gradeFor(input.row),
    beforeScore: numberOrNull(input.row.beforeScore),
    wallMs: numberOrNull(input.row.durationMs),
    traceElapsedMs,
    timeoutError: stringOrNull(input.row.error) ?? stringOrNull(input.trace?.error),
    falsePositiveApplied: numberOrNull(input.row.falsePositiveApplied) ?? 0,
    lastEventKind: stringOrNull(input.trace?.lastEvent?.kind),
    lastEventElapsedMs,
    lastToolName: stringOrNull(input.trace?.lastToolName),
    lastToolOutcome: stringOrNull(input.trace?.lastToolOutcome),
    lastToolDurationMs: numberOrNull(input.trace?.lastToolDurationMs),
    bestCheckpointScore: best?.score ?? null,
    bestCheckpointGrade: best?.grade ?? null,
    bestCheckpointReason: best?.reason ?? null,
    bestCheckpointElapsedMs: best?.elapsedMs ?? null,
    bestCheckpointEligibilityReason: best?.eligibilityReason ?? null,
    bestCheckpointEligible: best?.eligible ?? null,
    checkpointReturnable: Boolean(best?.eligible || best?.returned),
    postCheckpointUntracedMs,
    remainingAfterLastCheckpointMs,
    optionalPostAltMinBudgetMs: input.optionalPostAltMinBudgetMs,
    liveAnalysisCount: numberOrNull(input.trace?.liveAnalysisSummary?.count) ?? 0,
    liveAnalysisMs: numberOrNull(input.trace?.liveAnalysisSummary?.totalMs) ?? 0,
    noGainLiveAnalysisCount: noGain.count,
    noGainLiveAnalysisMs: noGain.totalMs,
    expensiveStructureConformanceMs: structureConformanceMs,
    projectedPointGainIfCompletedAtCheckpoint: best && isHardTimeout(input.row)
      ? Math.max(0, best.score - (currentScore ?? 0))
      : 0,
    recommendedAction: '',
    evidence: [],
  };
  row.recommendedAction = recommendation(row);
  row.evidence = evidenceFor({
    row: input.row,
    trace: input.trace,
    classification,
    best,
    postCheckpointUntracedMs,
    remainingAfterLastCheckpointMs,
    noGain,
    structureConformanceMs,
  });
  return row;
}

function classificationCounts(rows: HardTimeoutTailRow[]): Array<{ key: HardTimeoutTailClassification; count: number }> {
  const counts = new Map<HardTimeoutTailClassification, number>();
  for (const row of rows) counts.set(row.classification, (counts.get(row.classification) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function decisionFor(rows: HardTimeoutTailRow[]): HardTimeoutTailDiagnostic['summary']['decision'] {
  const reasons: string[] = [];
  const terminalBugs = rows.filter(row => row.classification === 'eligible_checkpoint_terminal_bug').length;
  const optionalBudget = rows.filter(row => row.classification === 'optional_post_alt_budget_overrun_candidate').length;
  const structureTimeouts = rows.filter(row => row.classification === 'stage_reanalysis_timeout_after_expensive_conformance').length;

  if (terminalBugs > 0) {
    reasons.push(`${terminalBugs} row(s) have an eligible checkpoint that was not terminally returned.`);
    return {
      status: 'fix_checkpoint_terminalization_first',
      recommendation: 'Fix checkpoint terminalization before adding timeout or repair behavior.',
      reasons,
    };
  }
  if (optionalBudget >= 2) {
    reasons.push(`${optionalBudget} row(s) timed out after a low verified checkpoint with too little wall budget left for optional post-alt mutation plus analysis.`);
    reasons.push('This supports a diagnostic/proof stage for budget-gating optional post-alt cleanup only; it does not justify lowering checkpoint floors.');
    if (structureTimeouts > 0) {
      reasons.push(`${structureTimeouts} row(s) remain separate structure/reanalysis timeout debt.`);
    }
    return {
      status: 'plan_optional_post_alt_budget_guard_probe',
      recommendation: 'Next behavior proof should instrument or budget-gate optional post-alt cleanup and validate targeted rows plus controls.',
      reasons,
    };
  }
  if (structureTimeouts > 0) {
    reasons.push(`${structureTimeouts} row(s) time out inside stage reanalysis after expensive structure conformance.`);
    return {
      status: 'plan_structure_reanalysis_timeout_probe',
      recommendation: 'Design a focused replay for structure conformance/reanalysis; do not return the below-floor checkpoint.',
      reasons,
    };
  }
  return {
    status: 'no_safe_timeout_behavior_ready',
    recommendation: 'No timeout behavior is justified from this artifact; keep rows parked or gather more trace evidence.',
    reasons: ['No eligible checkpoint, optional-post-alt budget, or structure-reanalysis pattern is sufficiently supported.'],
  };
}

export function buildHardTimeoutTailDiagnostic(input: {
  rows: BaselineReportRow[];
  traces: Map<string, RuntimeTimeoutTrace>;
  runDir: string;
  reportPath: string;
  generatedAt?: string;
  wallTimeoutMs?: number;
  optionalPostAltMinBudgetMs?: number;
}): HardTimeoutTailDiagnostic {
  const wallTimeoutMs = input.wallTimeoutMs ?? DEFAULT_WALL_TIMEOUT_MS;
  const optionalPostAltMinBudgetMs = input.optionalPostAltMinBudgetMs ?? DEFAULT_OPTIONAL_POST_ALT_MIN_BUDGET_MS;
  const hardRows = input.rows.filter(isHardTimeout);
  const rows = hardRows.map(row => makeRow({
    row,
    trace: input.traces.get(rowKey(row)) ?? null,
    wallTimeoutMs,
    optionalPostAltMinBudgetMs,
  })).sort((a, b) =>
    a.classification.localeCompare(b.classification) ||
    b.projectedPointGainIfCompletedAtCheckpoint - a.projectedPointGainIfCompletedAtCheckpoint ||
    a.key.localeCompare(b.key),
  );
  const optionalRows = rows.filter(row => row.classification === 'optional_post_alt_budget_overrun_candidate');
  const projectedPoints = optionalRows.reduce((sum, row) => sum + (row.bestCheckpointScore ?? 0), 0);
  const currentAllRowMean = input.rows.length
    ? input.rows.reduce((sum, row) => sum + (scoreFor(row) ?? 0), 0) / input.rows.length
    : null;
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runDir: resolve(input.runDir),
    reportPath: resolve(input.reportPath),
    summary: {
      rows: input.rows.length,
      hardTimeoutRows: hardRows.length,
      classificationCounts: classificationCounts(rows),
      decision: decisionFor(rows),
      projectedPointsIfOptionalBudgetGuardCompletesLowStates: projectedPoints,
      projectedMeanIfOptionalBudgetGuardCompletesLowStates: currentAllRowMean == null
        ? null
        : currentAllRowMean + projectedPoints / input.rows.length,
    },
    rows,
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function loadReport(path: string): Promise<BaselineReport> {
  const raw = await readJson(path);
  const record = asRecord(raw);
  return { rows: Array.isArray(record?.rows) ? record.rows as BaselineReportRow[] : [] };
}

async function loadTimeoutTraces(runDir: string): Promise<Map<string, RuntimeTimeoutTrace>> {
  const traces = new Map<string, RuntimeTimeoutTrace>();
  async function visit(path: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(path);
    } catch {
      return;
    }
    await Promise.all(entries.map(async entry => {
      const child = join(path, entry);
      const childStat = await stat(child);
      if (childStat.isDirectory()) {
        await visit(child);
        return;
      }
      if (!child.endsWith('.json') || !child.includes('/runtime-timeouts/')) return;
      const raw = await readJson(child);
      const record = asRecord(raw);
      if (!record) return;
      const trace = record as RuntimeTimeoutTrace;
      traces.set(traceKey(trace, child), trace);
    }));
  }
  await visit(resolve(runDir));
  return traces;
}

export function renderHardTimeoutTailMarkdown(report: HardTimeoutTailDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Unique Hard Timeout Tail Diagnostic', '');
  lines.push('Read-only diagnostic. This script reads existing benchmark JSON/runtime-timeout traces only; it does not analyze PDFs, remediate PDFs, write PDFs, call PAC/POC/ODL/Java, or change production behavior.', '');
  lines.push(`- Run: \`${report.runDir}\``);
  lines.push(`- Baseline report: \`${report.reportPath}\``);
  lines.push(`- Rows: \`${report.summary.rows}\``);
  lines.push(`- Hard-timeout rows: \`${report.summary.hardTimeoutRows}\``);
  lines.push(`- Decision: \`${report.summary.decision.status}\``);
  lines.push(`- Recommendation: ${report.summary.decision.recommendation}`);
  lines.push(`- Projected mean if optional budget candidates simply completed at their current verified low states: \`${report.summary.projectedMeanIfOptionalBudgetGuardCompletesLowStates?.toFixed(4) ?? 'n/a'}\``);
  lines.push('', '## Decision Reasons', '');
  for (const reason of report.summary.decision.reasons) lines.push(`- ${reason}`);
  lines.push('', '## Classification Counts', '');
  for (const count of report.summary.classificationCounts) {
    lines.push(`- \`${count.key}\`: \`${count.count}\``);
  }
  lines.push('', '## Timeout Rows', '');
  lines.push('| Row | Classification | Best checkpoint | Last event | Live no-gain | Post-checkpoint tail | Action |');
  lines.push('| --- | --- | ---: | --- | ---: | ---: | --- |');
  for (const row of report.rows) {
    lines.push(`| \`${row.key}\` | \`${row.classification}\` | ${row.bestCheckpointScore ?? 'n/a'}/${row.bestCheckpointGrade ?? 'n/a'} | \`${row.lastEventKind ?? 'n/a'}\` @ ${row.lastEventElapsedMs ?? 'n/a'}ms | ${row.noGainLiveAnalysisCount}/${row.noGainLiveAnalysisMs}ms | ${row.postCheckpointUntracedMs ?? 'n/a'}ms | ${row.recommendedAction} |`);
  }
  lines.push('', '## Row Evidence', '');
  for (const row of report.rows) {
    lines.push(`### ${row.key}`, '');
    lines.push(`- File: \`${row.file}\``);
    lines.push(`- Error: \`${row.timeoutError ?? 'n/a'}\``);
    lines.push(`- Wall/trace ms: \`${row.wallMs ?? 'n/a'}\` / \`${row.traceElapsedMs ?? 'n/a'}\``);
    lines.push(`- Best checkpoint: \`${row.bestCheckpointScore ?? 'n/a'}/${row.bestCheckpointGrade ?? 'n/a'}\` (${row.bestCheckpointEligibilityReason ?? 'n/a'})`);
    lines.push(`- Last tool: \`${row.lastToolName ?? 'n/a'}\` / \`${row.lastToolOutcome ?? 'n/a'}\` / \`${row.lastToolDurationMs ?? 'n/a'}ms\``);
    for (const item of row.evidence) lines.push(`- ${item}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function writeHardTimeoutTailDiagnostic(input: {
  runDir: string;
  reportPath: string;
  outDir: string;
  wallTimeoutMs?: number;
  optionalPostAltMinBudgetMs?: number;
}): Promise<HardTimeoutTailDiagnostic> {
  const report = await loadReport(input.reportPath);
  const traces = await loadTimeoutTraces(input.runDir);
  const diagnostic = buildHardTimeoutTailDiagnostic({
    rows: report.rows ?? [],
    traces,
    runDir: input.runDir,
    reportPath: input.reportPath,
    wallTimeoutMs: input.wallTimeoutMs,
    optionalPostAltMinBudgetMs: input.optionalPostAltMinBudgetMs,
  });
  const outDir = resolve(input.outDir);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'hard-timeout-tail-diagnostic.json'), JSON.stringify(diagnostic, null, 2), 'utf8');
  await writeFile(join(outDir, 'hard-timeout-tail-diagnostic.md'), renderHardTimeoutTailMarkdown(diagnostic), 'utf8');
  return diagnostic;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let runDir = DEFAULT_RUN;
  let reportPath = DEFAULT_REPORT;
  let outDir = DEFAULT_OUT;
  let wallTimeoutMs = DEFAULT_WALL_TIMEOUT_MS;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      return;
    }
    if (arg === '--run' && value) {
      runDir = value;
      if (reportPath === DEFAULT_REPORT) reportPath = join(value, 'merged', 'baseline_report.json');
      if (outDir === DEFAULT_OUT) outDir = join(value, 'hard-timeout-tail-diagnostic-r1');
      index += 1;
    } else if (arg === '--report' && value) {
      reportPath = value;
      index += 1;
    } else if (arg === '--out' && value) {
      outDir = value;
      index += 1;
    } else if (arg === '--wall-timeout-ms' && value) {
      const parsed = parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --wall-timeout-ms: ${value}`);
      wallTimeoutMs = parsed;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  const diagnostic = await writeHardTimeoutTailDiagnostic({
    runDir,
    reportPath,
    outDir,
    wallTimeoutMs,
  });
  console.log(`Wrote ${join(resolve(outDir), 'hard-timeout-tail-diagnostic.md')}`);
  console.log(`Decision: ${diagnostic.summary.decision.status}`);
  console.log(`Hard timeouts: ${diagnostic.summary.hardTimeoutRows}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
