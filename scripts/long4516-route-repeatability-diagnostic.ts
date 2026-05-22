#!/usr/bin/env tsx
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_RUNS = [
  {
    label: 'local_font_guard_proof',
    path: '/mnt/pdf-review/pdfaf-validation/local-font-budget-guard-proof-2026-05-22-r1/run-r1',
  },
  {
    label: 'tagged_cleanup_trace_r1',
    path: '/mnt/pdf-review/pdfaf-validation/tagged-cleanup-trace-4516-2026-05-22-r1/run-r1',
  },
  {
    label: 'tagged_cleanup_trace_r2',
    path: '/mnt/pdf-review/pdfaf-validation/tagged-cleanup-trace-4516-2026-05-22-r2/run-r1',
  },
];
const DEFAULT_OUT =
  '/mnt/pdf-review/pdfaf-validation/long4516-route-repeatability-diagnostic-2026-05-22-r1';
const DEFAULT_ROW_MATCH = '4516';

export type Long4516RouteClassification =
  | 'tagged_cleanup_timeout_after_below_floor_checkpoint'
  | 'verified_low_checkpoint_return_before_post_pass'
  | 'completed_high_route_with_trace'
  | 'completed_high_route_without_trace'
  | 'completed_low_route_with_trace'
  | 'completed_low_route_without_trace'
  | 'hard_timeout_without_trace'
  | 'row_missing'
  | 'other_runtime_shape';

export type Long4516RouteDecisionStatus =
  | 'route_runtime_volatile_no_behavior_ready'
  | 'plan_repeatable_tagged_cleanup_probe'
  | 'plan_checkpoint_policy_probe'
  | 'collect_more_trace_evidence'
  | 'no_safe_behavior_needed';

interface RunSpec {
  label: string;
  path: string;
}

interface CategoryScore {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface AppliedTool {
  toolName?: string;
  outcome?: string;
  stage?: number | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  durationMs?: number | null;
}

interface BaselineReportRow {
  id?: string;
  file?: string;
  filename?: string;
  beforeScore?: number | null;
  beforeGrade?: string | null;
  afterScore?: number | null;
  afterGrade?: string | null;
  afterDeterministicScore?: number | null;
  afterDeterministicGrade?: string | null;
  reanalyzedScore?: number | null;
  reanalyzedGrade?: string | null;
  durationMs?: number | null;
  wallRemediateMs?: number | null;
  error?: string | null;
  falsePositiveApplied?: number | null;
  categoriesBefore?: CategoryScore[];
  categoriesAfter?: CategoryScore[];
  afterCategoryScores?: CategoryScore[];
  reanalyzedCategoryScores?: CategoryScore[];
  categoryGap?: {
    before?: CategoryScore[];
    after?: CategoryScore[];
  };
  appliedTools?: AppliedTool[];
  runtimeSummary?: {
    deterministicTotalMs?: number;
    boundedWork?: {
      deterministicEarlyExitReasons?: Array<{ key?: string; count?: number }>;
    };
  };
}

interface BaselineReport {
  rows?: BaselineReportRow[];
  remediateResults?: BaselineReportRow[];
}

interface RuntimeTraceEvent {
  kind?: string;
  reason?: string;
  phase?: string;
  score?: number | null;
  grade?: string | null;
  appliedToolCount?: number | null;
  eligible?: boolean | null;
  eligibilityReason?: string | null;
  returned?: boolean | null;
  elapsedMs?: number | null;
  durationMs?: number | null;
  scoreBefore?: number | null;
  gradeBefore?: string | null;
  appliedToolCountBefore?: number | null;
  toolName?: string | null;
  outcome?: string | null;
  targetRef?: string | null;
}

interface RuntimeTraceArtifact {
  file?: string;
  rowId?: string;
  error?: string | null;
  elapsedMs?: number | null;
  eventCount?: number | null;
  eventCounts?: Array<{ key?: string; count?: number }>;
  lastEvent?: RuntimeTraceEvent;
  lastVerifiedCheckpointScore?: number | null;
  lastVerifiedCheckpointGrade?: string | null;
  lastVerifiedCheckpointReason?: string | null;
  lastVerifiedCheckpointEligible?: boolean | null;
  lastVerifiedCheckpointEligibilityReason?: string | null;
  lastVerifiedCheckpointReturned?: boolean | null;
  verifiedCheckpointHistory?: RuntimeTraceEvent[];
  recentEvents?: RuntimeTraceEvent[];
}

interface TraceLoad {
  path: string;
  kind: 'runtime-timeout' | 'runtime-trace';
  trace: RuntimeTraceArtifact;
}

interface ToolDigest {
  toolName: string;
  outcome: string;
  stage: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  durationMs: number | null;
}

export interface Long4516RouteRunSummary {
  label: string;
  runDir: string;
  reportPath: string;
  tracePath: string | null;
  traceKind: 'runtime-timeout' | 'runtime-trace' | null;
  present: boolean;
  file: string | null;
  classification: Long4516RouteClassification;
  beforeScore: number | null;
  beforeGrade: string | null;
  score: number | null;
  grade: string | null;
  deterministicScore: number | null;
  deterministicGrade: string | null;
  durationMs: number | null;
  error: string | null;
  hardTimeout: boolean;
  falsePositiveApplied: number;
  beforeCategories: Record<string, number>;
  afterCategories: Record<string, number>;
  appliedToolCount: number;
  appliedOutcomeCounts: Array<{ key: string; count: number }>;
  scoreMovingToolCount: number;
  firstTools: ToolDigest[];
  lastTools: ToolDigest[];
  deterministicEarlyExitReasons: Array<{ key: string; count: number }>;
  traceElapsedMs: number | null;
  traceEventCount: number | null;
  lastEventKind: string | null;
  lastEventReason: string | null;
  lastPostPassPhase: string | null;
  bestCheckpointScore: number | null;
  bestCheckpointGrade: string | null;
  bestCheckpointReason: string | null;
  bestCheckpointEligible: boolean | null;
  bestCheckpointEligibilityReason: string | null;
  lastReturnedCheckpointReason: string | null;
  returnedCheckpointScore: number | null;
  evidence: string[];
}

export interface Long4516RouteRepeatabilityDiagnostic {
  generatedAt: string;
  rowMatch: string;
  summary: {
    runCount: number;
    presentRuns: number;
    hardTimeoutRuns: number;
    completedRuns: number;
    highCompletedRuns: number;
    lowCompletedRuns: number;
    beforeScoreRange: number | null;
    afterScoreRange: number | null;
    initialCategoryVarianceKeys: string[];
    classificationCounts: Array<{ key: Long4516RouteClassification; count: number }>;
    decision: {
      status: Long4516RouteDecisionStatus;
      recommendation: string;
      reasons: string[];
    };
  };
  runs: Long4516RouteRunSummary[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/long4516-route-repeatability-diagnostic.ts [options]',
    '  --run <label=run-dir-or-baseline_report.json>  repeatable; defaults to May 22 4516 artifacts',
    '  --row <substring>                              default: 4516',
    '  --out <dir>',
  ].join('\n');
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function rowsFrom(report: BaselineReport): BaselineReportRow[] {
  if (Array.isArray(report.rows)) return report.rows;
  if (Array.isArray(report.remediateResults)) return report.remediateResults;
  return [];
}

function rowName(row: BaselineReportRow): string {
  return row.file ?? row.filename ?? row.id ?? '';
}

function findRow(report: BaselineReport, rowMatch: string): BaselineReportRow | null {
  const lowered = rowMatch.toLowerCase();
  return rowsFrom(report).find(row => rowName(row).toLowerCase().includes(lowered)) ?? null;
}

function scoreFor(row: BaselineReportRow | null): number | null {
  return numberOrNull(row?.reanalyzedScore) ?? numberOrNull(row?.afterScore);
}

function gradeFor(row: BaselineReportRow | null): string | null {
  return stringOrNull(row?.reanalyzedGrade) ?? stringOrNull(row?.afterGrade);
}

function isHardTimeout(row: BaselineReportRow | null): boolean {
  if (!row) return false;
  return /timeout|aborted due to timeout/i.test(row.error ?? '') || (
    scoreFor(row) === 0 &&
    /timeout/i.test(row.error ?? '')
  );
}

function categoryRecord(categories: CategoryScore[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const category of categories ?? []) {
    if (category.applicable === false) continue;
    if (typeof category.key === 'string' && typeof category.score === 'number') {
      out[category.key] = category.score;
    }
  }
  return out;
}

function beforeCategories(row: BaselineReportRow | null): Record<string, number> {
  return categoryRecord(row?.categoriesBefore ?? row?.categoryGap?.before);
}

function afterCategories(row: BaselineReportRow | null): Record<string, number> {
  return categoryRecord(
    row?.categoryGap?.after ??
      row?.categoriesAfter ??
      row?.reanalyzedCategoryScores ??
      row?.afterCategoryScores,
  );
}

function toolDigest(tool: AppliedTool): ToolDigest {
  return {
    toolName: tool.toolName ?? 'unknown',
    outcome: tool.outcome ?? 'unknown',
    stage: numberOrNull(tool.stage),
    scoreBefore: numberOrNull(tool.scoreBefore),
    scoreAfter: numberOrNull(tool.scoreAfter),
    durationMs: numberOrNull(tool.durationMs),
  };
}

function countByKey(values: string[]): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
}

function appliedOutcomeCounts(tools: AppliedTool[]): Array<{ key: string; count: number }> {
  return countByKey(tools.map(tool => tool.outcome ?? 'unknown'));
}

function scoreMovingToolCount(tools: AppliedTool[]): number {
  return tools.filter(tool => {
    const before = numberOrNull(tool.scoreBefore);
    const after = numberOrNull(tool.scoreAfter);
    return before !== null && after !== null && after > before;
  }).length;
}

function earlyExitReasons(row: BaselineReportRow | null): Array<{ key: string; count: number }> {
  return (row?.runtimeSummary?.boundedWork?.deterministicEarlyExitReasons ?? [])
    .filter((item): item is { key: string; count: number } =>
      typeof item.key === 'string' && typeof item.count === 'number')
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function traceMatches(item: TraceLoad, rowMatch: string, row: BaselineReportRow | null): boolean {
  const match = rowMatch.toLowerCase();
  const trace = item.trace;
  const rowFile = row ? rowName(row).toLowerCase() : '';
  const traceFile = (trace.file ?? '').toLowerCase();
  const candidates = [
    basename(item.path),
    trace.rowId ?? '',
  ].map(value => value.toLowerCase());
  if (candidates.some(value => value.includes(match))) return true;
  return Boolean(rowFile && traceFile && rowFile === traceFile);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function readTraceFiles(dir: string, kind: TraceLoad['kind']): Promise<TraceLoad[]> {
  try {
    const stats = await stat(dir);
    if (!stats.isDirectory()) return [];
  } catch {
    return [];
  }
  const files = await readdir(dir);
  const traces: TraceLoad[] = [];
  for (const file of files.filter(name => name.endsWith('.json')).sort()) {
    const path = join(dir, file);
    try {
      traces.push({
        path,
        kind,
        trace: await readJson(path) as RuntimeTraceArtifact,
      });
    } catch {
      // Broken local diagnostics should not make a read-only comparison unusable.
    }
  }
  return traces;
}

async function loadTrace(runDir: string, rowMatch: string, row: BaselineReportRow | null): Promise<TraceLoad | null> {
  const [timeouts, traces] = await Promise.all([
    readTraceFiles(join(runDir, 'runtime-timeouts'), 'runtime-timeout'),
    readTraceFiles(join(runDir, 'runtime-traces'), 'runtime-trace'),
  ]);
  const all = [...timeouts, ...traces].filter(item => traceMatches(item, rowMatch, row));
  if (all.length === 0) return null;
  const preferTimeout = isHardTimeout(row);
  return all.find(item => item.kind === (preferTimeout ? 'runtime-timeout' : 'runtime-trace')) ?? all[0] ?? null;
}

function lastReturnedCheckpoint(trace: RuntimeTraceArtifact | null): RuntimeTraceEvent | null {
  const history = trace?.verifiedCheckpointHistory ?? [];
  const fromHistory = [...history].reverse().find(event => event.returned === true);
  if (fromHistory) return fromHistory;
  return trace?.lastEvent?.kind === 'verified_checkpoint' && trace.lastEvent.returned === true
    ? trace.lastEvent
    : null;
}

function lastPostPassPhase(trace: RuntimeTraceArtifact | null): string | null {
  const events = [
    ...(trace?.recentEvents ?? []),
    ...(trace?.lastEvent ? [trace.lastEvent] : []),
  ];
  const event = [...events].reverse().find(item =>
    (item.kind === 'post_pass_start' || item.kind === 'post_pass_finish') &&
    typeof item.phase === 'string'
  );
  return event?.phase ?? null;
}

function classifyRun(input: {
  row: BaselineReportRow | null;
  trace: RuntimeTraceArtifact | null;
}): { classification: Long4516RouteClassification; evidence: string[] } {
  const { row, trace } = input;
  const evidence: string[] = [];
  if (!row) {
    return { classification: 'row_missing', evidence: ['No row matching the focus substring was found in the report.'] };
  }
  const score = scoreFor(row);
  const hardTimeout = isHardTimeout(row);
  const returned = lastReturnedCheckpoint(trace);
  const phase = lastPostPassPhase(trace);

  if (hardTimeout && !trace) {
    return { classification: 'hard_timeout_without_trace', evidence: ['The row hard-timed out, but no runtime trace artifact was found.'] };
  }

  if (hardTimeout && trace && phase === 'tagged_cleanup_post_pass') {
    evidence.push('The row hard-timed out after entering tagged_cleanup_post_pass.');
    const checkpointScore = numberOrNull(trace.lastVerifiedCheckpointScore);
    if (checkpointScore !== null) {
      evidence.push(`The best recorded checkpoint was ${checkpointScore}/${trace.lastVerifiedCheckpointGrade ?? 'n/a'}.`);
    }
    return { classification: 'tagged_cleanup_timeout_after_below_floor_checkpoint', evidence };
  }

  if (hardTimeout && trace) {
    return {
      classification: 'other_runtime_shape',
      evidence: [`The row hard-timed out with trace phase ${phase ?? 'unknown'}, which is outside this diagnostic's promoted shapes.`],
    };
  }

  if (returned && returned.reason === 'return:before_post_pass') {
    evidence.push('The run returned a verified low-score checkpoint before post-pass work.');
    evidence.push(`Returned checkpoint: ${numberOrNull(returned.score) ?? 'n/a'}/${returned.grade ?? 'n/a'}.`);
    return { classification: 'verified_low_checkpoint_return_before_post_pass', evidence };
  }

  if (score !== null && score >= 85) {
    evidence.push(`The row completed at ${score}/${gradeFor(row) ?? 'n/a'}.`);
    return {
      classification: trace ? 'completed_high_route_with_trace' : 'completed_high_route_without_trace',
      evidence,
    };
  }

  if (score !== null && score < 85) {
    evidence.push(`The row completed below the accepted floor at ${score}/${gradeFor(row) ?? 'n/a'}.`);
    return {
      classification: trace ? 'completed_low_route_with_trace' : 'completed_low_route_without_trace',
      evidence,
    };
  }

  return { classification: 'other_runtime_shape', evidence: ['The row did not match a known repeatability shape.'] };
}

function range(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => typeof value === 'number');
  if (numbers.length < 2) return null;
  return Math.max(...numbers) - Math.min(...numbers);
}

function varianceKeys(records: Array<Record<string, number>>): string[] {
  const keys = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) keys.add(key);
  }
  const out: string[] = [];
  for (const key of [...keys].sort()) {
    const values = new Set(records.map(record => record[key]).filter(value => typeof value === 'number'));
    if (values.size > 1) out.push(key);
  }
  return out;
}

function resolveRunSpec(spec: RunSpec): { label: string; runDir: string; reportPath: string } {
  const path = resolve(spec.path);
  const reportPath = basename(path) === 'baseline_report.json' ? path : join(path, 'baseline_report.json');
  return {
    label: spec.label,
    runDir: basename(path) === 'baseline_report.json' ? dirname(path) : path,
    reportPath,
  };
}

async function summarizeRun(spec: RunSpec, rowMatch: string): Promise<Long4516RouteRunSummary> {
  const resolved = resolveRunSpec(spec);
  const report = await readJson(resolved.reportPath) as BaselineReport;
  const row = findRow(report, rowMatch);
  const traceLoad = await loadTrace(resolved.runDir, rowMatch, row);
  const trace = traceLoad?.trace ?? null;
  const classification = classifyRun({ row, trace });
  const tools = row?.appliedTools ?? [];
  const returned = lastReturnedCheckpoint(trace);
  const score = scoreFor(row);
  return {
    label: resolved.label,
    runDir: resolved.runDir,
    reportPath: resolved.reportPath,
    tracePath: traceLoad?.path ?? null,
    traceKind: traceLoad?.kind ?? null,
    present: Boolean(row),
    file: row ? rowName(row) : null,
    classification: classification.classification,
    beforeScore: numberOrNull(row?.beforeScore),
    beforeGrade: stringOrNull(row?.beforeGrade),
    score,
    grade: gradeFor(row),
    deterministicScore: numberOrNull(row?.afterDeterministicScore),
    deterministicGrade: stringOrNull(row?.afterDeterministicGrade),
    durationMs: numberOrNull(row?.durationMs) ?? numberOrNull(row?.wallRemediateMs),
    error: stringOrNull(row?.error),
    hardTimeout: isHardTimeout(row),
    falsePositiveApplied: numberOrNull(row?.falsePositiveApplied) ?? 0,
    beforeCategories: beforeCategories(row),
    afterCategories: afterCategories(row),
    appliedToolCount: tools.length,
    appliedOutcomeCounts: appliedOutcomeCounts(tools),
    scoreMovingToolCount: scoreMovingToolCount(tools),
    firstTools: tools.slice(0, 6).map(toolDigest),
    lastTools: tools.slice(-6).map(toolDigest),
    deterministicEarlyExitReasons: earlyExitReasons(row),
    traceElapsedMs: numberOrNull(trace?.elapsedMs),
    traceEventCount: numberOrNull(trace?.eventCount),
    lastEventKind: stringOrNull(trace?.lastEvent?.kind),
    lastEventReason: stringOrNull(trace?.lastEvent?.reason),
    lastPostPassPhase: lastPostPassPhase(trace),
    bestCheckpointScore: numberOrNull(trace?.lastVerifiedCheckpointScore),
    bestCheckpointGrade: stringOrNull(trace?.lastVerifiedCheckpointGrade),
    bestCheckpointReason: stringOrNull(trace?.lastVerifiedCheckpointReason),
    bestCheckpointEligible: typeof trace?.lastVerifiedCheckpointEligible === 'boolean'
      ? trace.lastVerifiedCheckpointEligible
      : null,
    bestCheckpointEligibilityReason: stringOrNull(trace?.lastVerifiedCheckpointEligibilityReason),
    lastReturnedCheckpointReason: stringOrNull(returned?.reason),
    returnedCheckpointScore: numberOrNull(returned?.score),
    evidence: classification.evidence,
  };
}

function decisionFor(runs: Long4516RouteRunSummary[]): Long4516RouteRepeatabilityDiagnostic['summary']['decision'] {
  const classifications = new Set(runs.map(run => run.classification));
  const beforeRange = range(runs.map(run => run.beforeScore));
  const initialVariance = varianceKeys(runs.map(run => run.beforeCategories));
  const hardTimeoutRuns = runs.filter(run => run.hardTimeout).length;
  const highCompletedRuns = runs.filter(run => !run.hardTimeout && (run.score ?? -1) >= 85).length;
  const lowCheckpointReturns = runs.filter(run => run.classification === 'verified_low_checkpoint_return_before_post_pass').length;
  const taggedCleanupTimeouts = runs.filter(run => run.classification === 'tagged_cleanup_timeout_after_below_floor_checkpoint').length;
  const reasons: string[] = [];

  if (classifications.size > 1 || (beforeRange !== null && beforeRange >= 15) || initialVariance.length > 0) {
    if (classifications.size > 1) {
      reasons.push(`The same row produced ${classifications.size} runtime shapes across the compared artifacts.`);
    }
    if (beforeRange !== null && beforeRange >= 15) {
      reasons.push(`Initial score varied by ${beforeRange} points, so the route is not starting from stable evidence.`);
    }
    if (initialVariance.length > 0) {
      reasons.push(`Initial category evidence varied for: ${initialVariance.join(', ')}.`);
    }
    if (hardTimeoutRuns > 0 && highCompletedRuns > 0) {
      reasons.push('At least one run hard-timed out while another completed at or above the checkpoint floor.');
    }
    if (lowCheckpointReturns > 0) {
      reasons.push('A separate run returned a verified low-score checkpoint before post-pass work.');
    }
    return {
      status: 'route_runtime_volatile_no_behavior_ready',
      recommendation:
        'Keep this diagnostic-only. Do not lower checkpoint floors or add tagged-cleanup/font/post-pass guards until the same native route reproduces with stable initial evidence and controls.',
      reasons,
    };
  }

  if (taggedCleanupTimeouts > 0 && taggedCleanupTimeouts === runs.length) {
    return {
      status: 'plan_repeatable_tagged_cleanup_probe',
      recommendation:
        'A later behavior proof may target tagged_cleanup_post_pass, but only with controls and without lowering checkpoint floors.',
      reasons: ['All compared artifacts reproduced the same tagged-cleanup timeout shape.'],
    };
  }

  if (lowCheckpointReturns > 0 && lowCheckpointReturns === runs.length) {
    return {
      status: 'plan_checkpoint_policy_probe',
      recommendation:
        'Inspect the verified checkpoint selection policy, but do not accept low-score returns as completed remediation without a separate floor decision.',
      reasons: ['All compared artifacts returned the same verified low-score checkpoint shape.'],
    };
  }

  if (runs.every(run => !run.tracePath)) {
    return {
      status: 'collect_more_trace_evidence',
      recommendation:
        'Repeat with --write-runtime-traces before making a route or timeout decision.',
      reasons: ['No runtime trace artifacts were available for the compared runs.'],
    };
  }

  return {
    status: 'no_safe_behavior_needed',
    recommendation:
      'No repeatable problematic runtime shape was visible in the compared artifacts.',
    reasons: ['The compared artifacts did not expose a score-moving or timeout behavior candidate.'],
  };
}

export function buildLong4516RouteRepeatabilityDiagnostic(input: {
  rowMatch?: string;
  generatedAt?: string;
  runs: Long4516RouteRunSummary[];
}): Long4516RouteRepeatabilityDiagnostic {
  const rowMatch = input.rowMatch ?? DEFAULT_ROW_MATCH;
  const runs = input.runs;
  const beforeScoreRange = range(runs.map(run => run.beforeScore));
  const afterScoreRange = range(runs.map(run => run.score));
  const initialCategoryVarianceKeys = varianceKeys(runs.map(run => run.beforeCategories));
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    rowMatch,
    summary: {
      runCount: runs.length,
      presentRuns: runs.filter(run => run.present).length,
      hardTimeoutRuns: runs.filter(run => run.hardTimeout).length,
      completedRuns: runs.filter(run => run.present && !run.hardTimeout).length,
      highCompletedRuns: runs.filter(run => !run.hardTimeout && (run.score ?? -1) >= 85).length,
      lowCompletedRuns: runs.filter(run => !run.hardTimeout && (run.score ?? 100) < 85).length,
      beforeScoreRange,
      afterScoreRange,
      initialCategoryVarianceKeys,
      classificationCounts: countByKey(runs.map(run => run.classification)) as Array<{
        key: Long4516RouteClassification;
        count: number;
      }>,
      decision: decisionFor(runs),
    },
    runs,
  };
}

function formatScore(score: number | null, grade: string | null): string {
  return score === null ? 'n/a' : `${score}/${grade ?? 'n/a'}`;
}

function selectedCategories(record: Record<string, number>): string {
  const keys = ['heading_structure', 'alt_text', 'table_markup', 'reading_order', 'title_language', 'pdf_ua_compliance'];
  return keys.map(key => `${key}=${record[key] ?? 'n/a'}`).join(', ');
}

function toolList(tools: ToolDigest[]): string {
  if (tools.length === 0) return 'none';
  return tools
    .map(tool => `${tool.toolName}:${tool.outcome}:${tool.scoreBefore ?? 'n/a'}->${tool.scoreAfter ?? 'n/a'}`)
    .join('<br>');
}

export function renderLong4516RouteRepeatabilityMarkdown(
  report: Long4516RouteRepeatabilityDiagnostic,
): string {
  const lines: string[] = [];
  lines.push('# Long-4516 Route Repeatability Diagnostic', '');
  lines.push('Diagnostic-only comparison of existing benchmark JSON and runtime trace artifacts. It does not analyze PDFs, remediate PDFs, call PAC/POC/ODL/Java/semantic AI, write remediated PDFs, or change production behavior.', '');
  lines.push(`- Decision: \`${report.summary.decision.status}\``);
  lines.push(`- Recommendation: ${report.summary.decision.recommendation}`);
  lines.push(`- Compared runs: \`${report.summary.runCount}\``);
  lines.push(`- Hard-timeout runs: \`${report.summary.hardTimeoutRuns}\``);
  lines.push(`- High completed runs: \`${report.summary.highCompletedRuns}\``);
  lines.push(`- Low completed runs: \`${report.summary.lowCompletedRuns}\``);
  lines.push(`- Initial score range: \`${report.summary.beforeScoreRange ?? 'n/a'}\``);
  lines.push(`- Final score range: \`${report.summary.afterScoreRange ?? 'n/a'}\``);
  lines.push(`- Initial category variance: \`${report.summary.initialCategoryVarianceKeys.join(', ') || 'none'}\``);
  lines.push('', '## Decision Reasons', '');
  for (const reason of report.summary.decision.reasons) {
    lines.push(`- ${reason}`);
  }
  lines.push('', '## Run Comparison', '');
  lines.push('| Run | Classification | Before | After | Duration | Trace | Last Event | Best Checkpoint | Early Exit |');
  lines.push('| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |');
  for (const run of report.runs) {
    const trace = run.tracePath ? `${run.traceKind}:${basename(run.tracePath)}` : 'none';
    const lastEvent = [run.lastEventKind, run.lastEventReason ?? run.lastPostPassPhase].filter(Boolean).join(':') || 'n/a';
    const bestCheckpoint = run.bestCheckpointScore === null
      ? 'n/a'
      : `${run.bestCheckpointReason ?? 'checkpoint'} ${formatScore(run.bestCheckpointScore, run.bestCheckpointGrade)} eligible=${run.bestCheckpointEligible ?? 'n/a'}`;
    const earlyExit = run.deterministicEarlyExitReasons.map(item => `${item.key}=${item.count}`).join('<br>') || 'none';
    lines.push(`| ${run.label} | \`${run.classification}\` | ${formatScore(run.beforeScore, run.beforeGrade)} | ${formatScore(run.score, run.grade)} | ${run.durationMs ?? 'n/a'} | ${trace} | ${lastEvent} | ${bestCheckpoint} | ${earlyExit} |`);
  }
  lines.push('', '## Initial And Final Category Evidence', '');
  lines.push('| Run | Before Categories | After Categories | Tools | Score-Moving Tools | Last Tools |');
  lines.push('| --- | --- | --- | ---: | ---: | --- |');
  for (const run of report.runs) {
    lines.push(`| ${run.label} | ${selectedCategories(run.beforeCategories)} | ${selectedCategories(run.afterCategories)} | ${run.appliedToolCount} | ${run.scoreMovingToolCount} | ${toolList(run.lastTools)} |`);
  }
  lines.push('', '## Per-Run Evidence', '');
  for (const run of report.runs) {
    lines.push(`### ${run.label}`, '');
    lines.push(`- Report: \`${run.reportPath}\``);
    lines.push(`- Trace: \`${run.tracePath ?? 'none'}\``);
    for (const item of run.evidence) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export async function writeLong4516RouteRepeatabilityDiagnostic(input: {
  runs?: RunSpec[];
  rowMatch?: string;
  outDir?: string;
}): Promise<Long4516RouteRepeatabilityDiagnostic> {
  const runs = input.runs ?? DEFAULT_RUNS;
  const rowMatch = input.rowMatch ?? DEFAULT_ROW_MATCH;
  const outDir = input.outDir ?? DEFAULT_OUT;
  const summaries = await Promise.all(runs.map(run => summarizeRun(run, rowMatch)));
  const diagnostic = buildLong4516RouteRepeatabilityDiagnostic({ rowMatch, runs: summaries });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, 'long4516-route-repeatability-diagnostic.json'),
    `${JSON.stringify(diagnostic, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    join(outDir, 'long4516-route-repeatability-diagnostic.md'),
    renderLong4516RouteRepeatabilityMarkdown(diagnostic),
    'utf8',
  );
  return diagnostic;
}

function parseRunSpec(value: string): RunSpec {
  const split = value.indexOf('=');
  if (split > 0) {
    return { label: value.slice(0, split), path: value.slice(split + 1) };
  }
  return { label: basename(value.replace(/\/baseline_report\.json$/, '')), path: value };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runs: RunSpec[] = [];
  let rowMatch = DEFAULT_ROW_MATCH;
  let outDir = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--run' && value) {
      runs.push(parseRunSpec(value));
      index += 1;
    } else if (arg === '--row' && value) {
      rowMatch = value;
      index += 1;
    } else if (arg === '--out' && value) {
      outDir = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${usage()}`);
    }
  }
  const diagnostic = await writeLong4516RouteRepeatabilityDiagnostic({
    runs: runs.length > 0 ? runs : undefined,
    rowMatch,
    outDir,
  });
  console.log(`Wrote long-4516 route repeatability diagnostic to ${outDir}`);
  console.log(`Decision: ${diagnostic.summary.decision.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
