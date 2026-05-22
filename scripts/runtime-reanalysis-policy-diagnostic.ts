#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_REPORTS = [
  '/mnt/pdf-review/pdfaf-validation/runtime-tail-4683-telemetry-2026-05-21-r1/baseline_report.json',
  '/mnt/pdf-review/pdfaf-validation/original50-figure-alt-tree-cap-bounded-repeat-2026-05-21-r1/baseline_report.json',
];
const DEFAULT_FOCUS_KEYS = ['4683', '4516', '4438', '4076'];
const DEFAULT_OUT = '/mnt/pdf-review/pdfaf-validation/runtime-reanalysis-policy-diagnostic-2026-05-21-r1';

export type ReanalysisPolicyClassification =
  | 'reanalysis_dominated_low_score_candidate'
  | 'live_reanalysis_positive_route_control'
  | 'live_reanalysis_route_volatility_blocker'
  | 'structural_reanalysis_tail_monitor'
  | 'p95_driver_needs_runtime_summary'
  | 'new_timeout_needs_repeat_or_trace'
  | 'repeated_timeout_known_debt'
  | 'score_adjudication_not_runtime_policy'
  | 'stable_tail_monitor'
  | 'not_runtime_policy_candidate';

export type ReanalysisPolicyDecision =
  | 'plan_reanalysis_admission_probe'
  | 'collect_runtime_telemetry_first'
  | 'keep_runtime_policy_parked';

interface RuntimeCountRow {
  key: string;
  count: number;
}

interface AnalysisRuntimeSummary {
  totalMs?: number;
  structureMs?: number;
  pdfjsMs?: number;
  cacheHit?: boolean;
}

interface RemediationStageRuntimeSummary {
  key?: string;
  stageNumber?: number;
  totalMs?: number;
  reanalyzeMs?: number;
}

interface RemediationToolRuntimeSummary {
  toolName?: string;
  durationMs?: number;
  outcome?: string;
}

interface RemediationLiveAnalysisRuntimeSummary {
  context?: string;
  toolName?: string;
  targetRef?: string;
  durationMs?: number;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
}

interface RemediationRuntimeSummary {
  analysisBefore?: AnalysisRuntimeSummary | null;
  analysisAfter?: AnalysisRuntimeSummary | null;
  deterministicTotalMs?: number;
  stageTimings?: RemediationStageRuntimeSummary[];
  toolTimings?: RemediationToolRuntimeSummary[];
  liveAnalysisTimings?: RemediationLiveAnalysisRuntimeSummary[];
  boundedWork?: {
    deterministicEarlyExitReasons?: RuntimeCountRow[];
  };
}

interface BaselineReportRow {
  file?: string;
  beforeScore?: number | null;
  afterScore?: number | null;
  afterGrade?: string | null;
  durationMs?: number | null;
  error?: string | null;
  falsePositiveApplied?: number | null;
  appliedTools?: Array<{ durationMs?: number | null; details?: string; outcome?: string; toolName?: string }>;
  runtimeSummary?: RemediationRuntimeSummary;
}

interface BaselineReport {
  rows?: BaselineReportRow[];
}

export interface ReanalysisPolicyRow {
  key: string;
  file: string;
  sourcePath: string;
  classification: ReanalysisPolicyClassification;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  error: string | null;
  durationMs: number | null;
  observationCount: number;
  timeoutObservationCount: number;
  hasRuntimeSummary: boolean;
  analysisBeforeMs: number | null;
  analysisAfterMs: number | null;
  deterministicTotalMs: number | null;
  stageReanalysisMs: number;
  stageTotalMs: number;
  toolTimingMs: number;
  liveAnalysisMs: number;
  liveNoGainAnalysisMs: number;
  liveGainAnalysisMs: number;
  liveAnalysisCount: number;
  appliedToolMs: number;
  stageReanalysisRatio: number | null;
  toolTimingRatio: number | null;
  liveAnalysisRatio: number | null;
  earlyExitReasons: RuntimeCountRow[];
  topStages: string[];
  topTools: string[];
  topLiveAnalyses: string[];
  reason: string;
}

export interface ReanalysisPolicyDiagnostic {
  generatedAt: string;
  decision: {
    status: ReanalysisPolicyDecision;
    recommendation: string;
    reasons: string[];
  };
  inputReports: string[];
  focusKeys: string[];
  knownTimeoutKeys: string[];
  scoreAdjudicationKeys: string[];
  rows: ReanalysisPolicyRow[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/runtime-reanalysis-policy-diagnostic.ts [options]',
    '  --reports <baseline_report.json[,baseline_report.json...]>',
    '  --focus <row-key[,row-key...]>',
    '  --known-timeout-keys <row-key[,row-key...]>',
    '  --score-adjudication-keys <row-key[,row-key...]>',
    '  --out <dir>',
  ].join('\n');
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rowKey(row: BaselineReportRow): string {
  const name = row.file ?? '';
  return name.match(/\b(\d{4})\b/)?.[1] ?? basename(name).toLowerCase().replace(/\.pdf$/i, '');
}

function rowsFrom(report: BaselineReport): BaselineReportRow[] {
  return Array.isArray(report.rows) ? report.rows : [];
}

function score(row: BaselineReportRow): number | null {
  return numberOrNull(row.afterScore);
}

function error(row: BaselineReportRow): string | null {
  return typeof row.error === 'string' && row.error.length > 0 ? row.error : null;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function sum(values: Array<number | null | undefined>): number {
  return values.reduce((total, value) => total + (typeof value === 'number' && Number.isFinite(value) ? value : 0), 0);
}

function topStages(runtime?: RemediationRuntimeSummary): string[] {
  return [...(runtime?.stageTimings ?? [])]
    .sort((a, b) => (b.totalMs ?? 0) - (a.totalMs ?? 0))
    .slice(0, 5)
    .map(stage => `stage${stage.stageNumber ?? '?'}:${Math.round(stage.totalMs ?? 0)}ms/reanalyze:${Math.round(stage.reanalyzeMs ?? 0)}ms`);
}

function topTools(runtime?: RemediationRuntimeSummary): string[] {
  return [...(runtime?.toolTimings ?? [])]
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, 5)
    .map(tool => `${tool.toolName ?? '?'}:${Math.round(tool.durationMs ?? 0)}ms:${tool.outcome ?? '?'}`);
}

function topLiveAnalyses(runtime?: RemediationRuntimeSummary): string[] {
  return [...(runtime?.liveAnalysisTimings ?? [])]
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, 5)
    .map(live => {
      const scoreText = `${live.scoreBefore ?? 'n/a'}->${live.scoreAfter ?? 'n/a'}`;
      return `${live.context ?? '?'}:${live.toolName ?? '?'}:${live.targetRef ?? '?'}:${Math.round(live.durationMs ?? 0)}ms:${scoreText}`;
    });
}

function earlyExitReasons(runtime?: RemediationRuntimeSummary): RuntimeCountRow[] {
  return runtime?.boundedWork?.deterministicEarlyExitReasons ?? [];
}

function hasEarlyExit(row: ReanalysisPolicyRow, prefixOrKey: string): boolean {
  return row.earlyExitReasons.some(reason => reason.key === prefixOrKey || reason.key.startsWith(prefixOrKey));
}

function classifyTelemetryRow(
  row: Omit<ReanalysisPolicyRow, 'classification' | 'reason'>,
  input: {
    knownTimeoutKeys: Set<string>;
    scoreAdjudicationKeys: Set<string>;
  },
): {
  classification: ReanalysisPolicyClassification;
  reason: string;
} {
  if (row.error && (input.knownTimeoutKeys.has(row.key) || row.timeoutObservationCount >= 2)) {
    return {
      classification: 'repeated_timeout_known_debt',
      reason: 'Repeated or explicitly known hard-timeout row; no safe policy can be inferred without a trace/checkpoint state.',
    };
  }
  if (row.error) {
    return {
      classification: 'new_timeout_needs_repeat_or_trace',
      reason: 'Timeout/error row needs focused repeat or runtime-timeout trace before policy promotion.',
    };
  }
  if (
    input.scoreAdjudicationKeys.has(row.key) &&
    row.afterScore !== null &&
    (row.afterScore < 85 || (row.beforeScore !== null && row.afterScore <= row.beforeScore - 10))
  ) {
    return {
      classification: 'score_adjudication_not_runtime_policy',
      reason: 'Explicit stricter-score adjudication row; runtime policy should not mask the lower current score.',
    };
  }
  if (!row.hasRuntimeSummary) {
    return {
      classification: 'p95_driver_needs_runtime_summary',
      reason: 'Runtime-tail row lacks benchmark runtime telemetry; rerun with current telemetry before designing behavior.',
    };
  }
  if (
    (row.afterScore ?? 0) >= 93 &&
    row.liveAnalysisMs >= 40_000
  ) {
    return {
      classification: 'live_reanalysis_positive_route_control',
      reason: 'High-score row still depends on substantial live analysis; any future no-gain policy must preserve this route.',
    };
  }
  if (
    (row.afterScore ?? 0) < 85 &&
    row.liveGainAnalysisMs > 0
  ) {
    return {
      classification: 'live_reanalysis_route_volatility_blocker',
      reason: 'Low final score occurred despite at least one live analysis showing score gain; route needs diagnosis before cutoff policy.',
    };
  }
  if (
    (row.afterScore ?? 0) < 85 &&
    row.stageReanalysisMs >= 45_000 &&
    row.liveNoGainAnalysisMs >= 40_000 &&
    row.liveGainAnalysisMs === 0 &&
    (hasEarlyExit(row as ReanalysisPolicyRow, 'verified_low_score_checkpoint_timeout_return') ||
      hasEarlyExit(row as ReanalysisPolicyRow, 'verified_low_score_checkpoint_slow_no_gain_figure_alt_return') ||
      hasEarlyExit(row as ReanalysisPolicyRow, 'reanalysis_tail_soft_cap_') ||
      hasEarlyExit(row as ReanalysisPolicyRow, 'soft_deadline_'))
  ) {
    return {
      classification: 'reanalysis_dominated_low_score_candidate',
      reason: 'Low-score row has substantial repeated reanalysis plus score-neutral live analysis and bounded-work checkpoint/soft-stop evidence.',
    };
  }
  if (
    row.liveAnalysisMs === 0 &&
    row.stageReanalysisMs >= 90_000 &&
    (row.durationMs ?? 0) >= 180_000
  ) {
    return {
      classification: 'structural_reanalysis_tail_monitor',
      reason: 'Runtime tail is dominated by repeated structural reanalysis rather than live figure/alt analysis.',
    };
  }
  if ((row.durationMs ?? 0) >= 180_000) {
    return {
      classification: 'stable_tail_monitor',
      reason: 'Runtime tail is visible but current telemetry does not support a behavior predicate.',
    };
  }
  return {
    classification: 'not_runtime_policy_candidate',
    reason: 'No runtime-policy signal found.',
  };
}

function buildRows(input: {
  reports: Array<{ path: string; report: BaselineReport }>;
  focusKeys: string[];
  knownTimeoutKeys: Set<string>;
  scoreAdjudicationKeys: Set<string>;
}): ReanalysisPolicyRow[] {
  const focus = new Set(input.focusKeys);
  const bestRows = new Map<string, { path: string; row: BaselineReportRow }>();
  const observationCounts = new Map<string, number>();
  const timeoutObservationCounts = new Map<string, number>();
  for (const source of input.reports) {
    for (const row of rowsFrom(source.report)) {
      const key = rowKey(row);
      if (!focus.has(key)) continue;
      observationCounts.set(key, (observationCounts.get(key) ?? 0) + 1);
      if (error(row)) timeoutObservationCounts.set(key, (timeoutObservationCounts.get(key) ?? 0) + 1);
      const existing = bestRows.get(key);
      const rowHasRuntime = Boolean(row.runtimeSummary);
      const existingHasRuntime = Boolean(existing?.row.runtimeSummary);
      const rowDuration = numberOrNull(row.durationMs) ?? -1;
      const existingDuration = numberOrNull(existing?.row.durationMs) ?? -1;
      if (!existing || (rowHasRuntime && !existingHasRuntime) || (rowHasRuntime === existingHasRuntime && rowDuration > existingDuration)) {
        bestRows.set(key, { path: source.path, row });
      }
    }
  }
  return [...bestRows.entries()]
    .map(([key, source]) => {
      const runtime = source.row.runtimeSummary;
      const durationMs = numberOrNull(source.row.durationMs);
      const stageReanalysisMs = Math.round(sum((runtime?.stageTimings ?? []).map(stage => stage.reanalyzeMs)));
      const stageTotalMs = Math.round(sum((runtime?.stageTimings ?? []).map(stage => stage.totalMs)));
      const toolTimingMs = Math.round(sum((runtime?.toolTimings ?? []).map(tool => tool.durationMs)));
      const liveAnalyses = runtime?.liveAnalysisTimings ?? [];
      const liveAnalysisMs = Math.round(sum(liveAnalyses.map(live => live.durationMs)));
      const liveNoGainAnalysisMs = Math.round(sum(liveAnalyses.map(live => {
        const before = numberOrNull(live.scoreBefore);
        const after = numberOrNull(live.scoreAfter);
        return before !== null && after !== null && after <= before ? live.durationMs : 0;
      })));
      const liveGainAnalysisMs = Math.round(sum(liveAnalyses.map(live => {
        const before = numberOrNull(live.scoreBefore);
        const after = numberOrNull(live.scoreAfter);
        return before !== null && after !== null && after > before ? live.durationMs : 0;
      })));
      const appliedToolMs = Math.round(sum((source.row.appliedTools ?? []).map(tool => tool.durationMs)));
      const base = {
        key,
        file: source.row.file ?? key,
        sourcePath: source.path,
        beforeScore: numberOrNull(source.row.beforeScore),
        afterScore: score(source.row),
        afterGrade: source.row.afterGrade ?? null,
        error: error(source.row),
        durationMs,
        observationCount: observationCounts.get(key) ?? 1,
        timeoutObservationCount: timeoutObservationCounts.get(key) ?? 0,
        hasRuntimeSummary: Boolean(runtime),
        analysisBeforeMs: numberOrNull(runtime?.analysisBefore?.totalMs),
        analysisAfterMs: numberOrNull(runtime?.analysisAfter?.totalMs),
        deterministicTotalMs: numberOrNull(runtime?.deterministicTotalMs),
        stageReanalysisMs,
        stageTotalMs,
        toolTimingMs,
        liveAnalysisMs,
        liveNoGainAnalysisMs,
        liveGainAnalysisMs,
        liveAnalysisCount: liveAnalyses.length,
        appliedToolMs,
        stageReanalysisRatio: durationMs && durationMs > 0 ? round4(stageReanalysisMs / durationMs) : null,
        toolTimingRatio: durationMs && durationMs > 0 ? round4(toolTimingMs / durationMs) : null,
        liveAnalysisRatio: durationMs && durationMs > 0 ? round4(liveAnalysisMs / durationMs) : null,
        earlyExitReasons: earlyExitReasons(runtime),
        topStages: topStages(runtime),
        topTools: topTools(runtime),
        topLiveAnalyses: topLiveAnalyses(runtime),
      };
      return {
        ...base,
        ...classifyTelemetryRow(base, {
          knownTimeoutKeys: input.knownTimeoutKeys,
          scoreAdjudicationKeys: input.scoreAdjudicationKeys,
        }),
      };
    })
    .sort((a, b) => {
      const order: ReanalysisPolicyClassification[] = [
        'reanalysis_dominated_low_score_candidate',
        'live_reanalysis_route_volatility_blocker',
        'live_reanalysis_positive_route_control',
        'structural_reanalysis_tail_monitor',
        'new_timeout_needs_repeat_or_trace',
        'repeated_timeout_known_debt',
        'p95_driver_needs_runtime_summary',
        'score_adjudication_not_runtime_policy',
        'stable_tail_monitor',
        'not_runtime_policy_candidate',
      ];
      return order.indexOf(a.classification) - order.indexOf(b.classification) ||
        (b.durationMs ?? 0) - (a.durationMs ?? 0) ||
        a.key.localeCompare(b.key);
    });
}

export function buildReanalysisPolicyDiagnostic(input: {
  generatedAt?: string;
  reports: Array<{ path: string; report: BaselineReport }>;
  focusKeys?: string[];
  knownTimeoutKeys?: string[];
  scoreAdjudicationKeys?: string[];
}): ReanalysisPolicyDiagnostic {
  const focusKeys = input.focusKeys ?? DEFAULT_FOCUS_KEYS;
  const knownTimeoutKeys = input.knownTimeoutKeys ?? [];
  const scoreAdjudicationKeys = input.scoreAdjudicationKeys ?? [];
  const rows = buildRows({
    reports: input.reports,
    focusKeys,
    knownTimeoutKeys: new Set(knownTimeoutKeys),
    scoreAdjudicationKeys: new Set(scoreAdjudicationKeys),
  });
  const candidateCount = rows.filter(row => row.classification === 'reanalysis_dominated_low_score_candidate').length;
  const positiveControlCount = rows.filter(row => row.classification === 'live_reanalysis_positive_route_control').length;
  const routeVolatilityCount = rows.filter(row => row.classification === 'live_reanalysis_route_volatility_blocker').length;
  const structuralMonitorCount = rows.filter(row => row.classification === 'structural_reanalysis_tail_monitor').length;
  const missingTelemetryCount = rows.filter(row => row.classification === 'p95_driver_needs_runtime_summary').length;
  const traceNeededCount = rows.filter(row => row.classification === 'new_timeout_needs_repeat_or_trace').length;
  const reasons: string[] = [];
  let status: ReanalysisPolicyDecision;
  let recommendation: string;
  if (candidateCount > 0) {
    status = 'plan_reanalysis_admission_probe';
    reasons.push(`${candidateCount} row(s) show reanalysis-dominated low-score runtime pressure.`);
    if (positiveControlCount > 0) reasons.push(`${positiveControlCount} high-score live-analysis control row(s) must be preserved.`);
    if (routeVolatilityCount > 0) reasons.push(`${routeVolatilityCount} live-analysis route-volatility row(s) block broad cutoff behavior.`);
    if (structuralMonitorCount > 0) reasons.push(`${structuralMonitorCount} structural reanalysis tail row(s) need a separate policy lane.`);
    if (missingTelemetryCount > 0) reasons.push(`${missingTelemetryCount} row(s) still need runtime telemetry.`);
    if (traceNeededCount > 0) reasons.push(`${traceNeededCount} timeout row(s) need focused repeat or timeout trace.`);
    recommendation = 'Plan a separate guarded behavior probe around reanalysis admission or verified checkpoint policy; do not change score/PAC gates from this diagnostic.';
  } else if (missingTelemetryCount > 0 || traceNeededCount > 0) {
    status = 'collect_runtime_telemetry_first';
    if (missingTelemetryCount > 0) reasons.push(`${missingTelemetryCount} p95/tail row(s) need benchmark runtime telemetry.`);
    if (traceNeededCount > 0) reasons.push(`${traceNeededCount} timeout row(s) need focused repeat or timeout trace.`);
    recommendation = 'Collect telemetry before proposing behavior.';
  } else {
    status = 'keep_runtime_policy_parked';
    reasons.push('No safe runtime policy candidate is supported by current telemetry.');
    if (positiveControlCount > 0) reasons.push(`${positiveControlCount} high-score live-analysis control row(s) make broad cutoff unsafe.`);
    if (routeVolatilityCount > 0) reasons.push(`${routeVolatilityCount} route-volatility row(s) need diagnosis before cutoff policy.`);
    if (structuralMonitorCount > 0) reasons.push(`${structuralMonitorCount} structural reanalysis tail row(s) do not match the live-analysis policy lane.`);
    recommendation = 'Keep runtime behavior parked and continue PAC/POC lane work.';
  }
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    decision: { status, recommendation, reasons },
    inputReports: input.reports.map(report => report.path),
    focusKeys,
    knownTimeoutKeys,
    scoreAdjudicationKeys,
    rows,
  };
}

function rowTable(rows: ReanalysisPolicyRow[]): string[] {
  if (rows.length === 0) return ['No focus rows found in the supplied reports.'];
  const lines = [
    '| Key | Classification | Score | Runtime | Reanalysis | Live Analysis | Live No-Gain | Reason |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of rows) {
    lines.push([
      `| ${row.key}`,
      `\`${row.classification}\``,
      `${row.afterScore ?? 'n/a'}/${row.afterGrade ?? '?'}`,
      row.durationMs ?? 'n/a',
      row.stageReanalysisMs,
      row.liveAnalysisMs,
      row.liveNoGainAnalysisMs,
      `${row.reason} |`,
    ].join(' | '));
  }
  return lines;
}

function formatMs(value: number | null): string {
  return value === null ? 'n/a' : `${value}ms`;
}

export function renderReanalysisPolicyMarkdown(report: ReanalysisPolicyDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Runtime Reanalysis Policy Diagnostic', '');
  lines.push('Read-only diagnostic over existing benchmark reports. It does not analyze PDFs, remediate PDFs, write PDFs, call PAC/POC/ODL/Java/semantic AI, or change production behavior.', '');
  lines.push(`- Decision: \`${report.decision.status}\``);
  lines.push(`- Recommendation: ${report.decision.recommendation}`);
  lines.push(`- Focus keys: \`${report.focusKeys.join(',')}\``);
  lines.push(`- Known timeout keys: \`${report.knownTimeoutKeys.join(',') || 'none'}\``);
  lines.push(`- Score adjudication keys: \`${report.scoreAdjudicationKeys.join(',') || 'none'}\``, '');
  lines.push('## Reasons', '');
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  lines.push('', '## Rows', '');
  lines.push(...rowTable(report.rows));
  lines.push('', '## Evidence Details', '');
  for (const row of report.rows) {
    lines.push(`### ${row.key}`, '');
    lines.push(`- Source: \`${row.sourcePath}\``);
    lines.push(`- Observations/timeouts: \`${row.observationCount} / ${row.timeoutObservationCount}\``);
    lines.push(`- Runtime summary: \`${row.hasRuntimeSummary}\``);
    lines.push(`- Initial/final analysis: \`${formatMs(row.analysisBeforeMs)} / ${formatMs(row.analysisAfterMs)}\``);
    lines.push(`- Deterministic total: \`${formatMs(row.deterministicTotalMs)}\``);
    lines.push(`- Stage total/reanalysis: \`${row.stageTotalMs} / ${row.stageReanalysisMs}ms\``);
    lines.push(`- Runtime/applied tool time: \`${row.toolTimingMs} / ${row.appliedToolMs}ms\``);
    lines.push(`- Live analysis total/no-gain/gain: \`${row.liveAnalysisMs} / ${row.liveNoGainAnalysisMs} / ${row.liveGainAnalysisMs}ms\``);
    lines.push(`- Early exits: \`${row.earlyExitReasons.map(reason => `${reason.key} x${reason.count}`).join(', ') || 'none'}\``);
    lines.push(`- Top stages: \`${row.topStages.join('; ') || 'none'}\``);
    lines.push(`- Top tools: \`${row.topTools.join('; ') || 'none'}\``, '');
    lines.push(`- Top live analyses: \`${row.topLiveAnalyses.join('; ') || 'none'}\``, '');
  }
  return `${lines.join('\n')}\n`;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as T;
}

export async function writeReanalysisPolicyDiagnostic(input: {
  reportPaths?: string[];
  focusKeys?: string[];
  knownTimeoutKeys?: string[];
  scoreAdjudicationKeys?: string[];
  outDir?: string;
}): Promise<ReanalysisPolicyDiagnostic> {
  const reportPaths = input.reportPaths ?? DEFAULT_REPORTS;
  const outDir = input.outDir ?? DEFAULT_OUT;
  const reports = await Promise.all(reportPaths.map(async path => ({
    path,
    report: await readJson<BaselineReport>(path),
  })));
  const diagnostic = buildReanalysisPolicyDiagnostic({
    reports,
    focusKeys: input.focusKeys,
    knownTimeoutKeys: input.knownTimeoutKeys,
    scoreAdjudicationKeys: input.scoreAdjudicationKeys,
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'runtime-reanalysis-policy-diagnostic.json'), `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'runtime-reanalysis-policy-diagnostic.md'), renderReanalysisPolicyMarkdown(diagnostic), 'utf8');
  return diagnostic;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let reportPaths = DEFAULT_REPORTS;
  let focusKeys = DEFAULT_FOCUS_KEYS;
  let knownTimeoutKeys: string[] = [];
  let scoreAdjudicationKeys: string[] = [];
  let outDir = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--reports' && value) {
      reportPaths = value.split(',').map(item => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--focus' && value) {
      focusKeys = value.split(',').map(item => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--known-timeout-keys' && value) {
      knownTimeoutKeys = value.split(',').map(item => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--score-adjudication-keys' && value) {
      scoreAdjudicationKeys = value.split(',').map(item => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--out' && value) {
      outDir = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${usage()}`);
    }
  }
  const report = await writeReanalysisPolicyDiagnostic({
    reportPaths,
    focusKeys,
    knownTimeoutKeys,
    scoreAdjudicationKeys,
    outDir,
  });
  console.log(`Wrote runtime reanalysis policy diagnostic to ${outDir}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
