#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_REFERENCE =
  '/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json';
const DEFAULT_CURRENT =
  '/mnt/pdf-review/pdfaf-validation/original50-figure-alt-tree-cap-bounded-repeat-2026-05-21-r1/baseline_report.json';
const DEFAULT_HISTORY = [
  '/mnt/pdf-review/pdfaf-validation/original50-figure-alt-tree-cap-calibration-2026-05-21-r1/baseline_report.json',
  '/mnt/pdf-review/pdfaf-validation/original50-native-layout-audit-2026-05-19-r1/baseline_report.json',
  '/mnt/pdf-review/pdfaf-validation/original50-odl-text-risk-2026-05-19-r1/baseline_report.json',
];
const DEFAULT_OUT =
  '/mnt/pdf-review/pdfaf-validation/runtime-tail-gate-diagnostic-2026-05-21-r1';

type RuntimeDecision =
  | 'runtime_gate_clear'
  | 'runtime_gate_blocked'
  | 'score_adjudication_needed'
  | 'incomplete_artifacts';

type RuntimeClassification =
  | 'new_timeout_gate_blocker'
  | 'repeated_timeout_known_debt'
  | 'p95_runtime_driver'
  | 'analyzer_dominated_completed_tail'
  | 'stricter_score_adjudication'
  | 'material_score_regression'
  | 'material_score_improvement'
  | 'stable_or_non_blocking';

interface ToolAttempt {
  durationMs?: number | null;
}

interface RuntimeStageTiming {
  key?: string;
  stageNumber?: number;
  round?: number;
  source?: string;
  toolCount?: number;
  totalMs?: number | null;
  reanalyzeMs?: number | null;
}

interface RuntimeToolTiming {
  toolName?: string;
  stage?: number;
  round?: number;
  source?: string;
  durationMs?: number | null;
  outcome?: string;
}

interface RuntimeLiveAnalysisTiming {
  context?: string;
  toolName?: string;
  targetRef?: string;
  durationMs?: number | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
}

interface RuntimeSummary {
  analysisBefore?: { totalMs?: number | null };
  analysisAfter?: { totalMs?: number | null };
  deterministicTotalMs?: number | null;
  stageTimings?: RuntimeStageTiming[];
  toolTimings?: RuntimeToolTiming[];
  liveAnalysisTimings?: RuntimeLiveAnalysisTiming[];
  boundedWork?: {
    deterministicEarlyExitReasons?: Array<{ key?: string; count?: number | null }>;
  };
}

interface BaselineReportRow {
  file?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  durationMs?: number | null;
  error?: string | null;
  falsePositiveApplied?: number | null;
  appliedTools?: ToolAttempt[];
  runtimeSummary?: RuntimeSummary;
}

interface BaselineReport {
  rows?: BaselineReportRow[];
}

interface RunMetrics {
  path: string;
  rowCount: number;
  completedRows: number;
  meanAllRows: number | null;
  falsePositiveApplied: number;
  runtimeP95Ms: number | null;
  runtimeMaxMs: number | null;
  timeoutKeys: string[];
}

interface RowObservation {
  path: string;
  score: number | null;
  grade: string | null;
  durationMs: number | null;
  error: string | null;
}

interface RuntimeHotspot {
  kind: 'stage' | 'tool' | 'live_analysis';
  label: string;
  durationMs: number;
  reanalyzeMs?: number;
  outcome?: string | null;
}

interface RowRuntimeBreakdown {
  analysisBeforeMs: number | null;
  analysisAfterMs: number | null;
  deterministicTotalMs: number | null;
  stageTotalMs: number;
  stageReanalysisMs: number;
  runtimeToolTimingMs: number;
  liveAnalysisMs: number;
  appliedToolTimingMs: number;
  unaccountedMs: number | null;
  topHotspots: RuntimeHotspot[];
  earlyExitReasons: Array<{ key: string; count: number }>;
}

export interface RuntimeGateRow {
  key: string;
  file: string;
  classification: RuntimeClassification;
  referenceScore: number | null;
  currentScore: number | null;
  delta: number | null;
  referenceError: string | null;
  currentError: string | null;
  currentDurationMs: number | null;
  toolDurationMs: number;
  unaccountedDurationMs: number | null;
  toolDurationRatio: number | null;
  runtimeBreakdown: RowRuntimeBreakdown | null;
  historicalObservations: RowObservation[];
  reason: string;
}

export interface RuntimeTailGateDiagnostic {
  generatedAt: string;
  decision: {
    status: RuntimeDecision;
    reasons: string[];
    recommendation: string;
  };
  gates: {
    falsePositiveAppliedZero: boolean;
    noNewTimeouts: boolean;
    runtimeWithinBound: boolean;
  };
  reference: RunMetrics;
  current: RunMetrics;
  rows: RuntimeGateRow[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/runtime-tail-gate-diagnostic.ts [options]',
    '  --reference <baseline_report.json>',
    '  --current <baseline_report.json>',
    '  --history <baseline_report.json[,baseline_report.json...]>',
    '  --stricter-score-keys <csv-row-keys>',
    '  --out <dir>',
  ].join('\n');
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function rowKey(row: BaselineReportRow): string {
  const name = row.file ?? '';
  return name.match(/\b(\d{4})\b/)?.[1] ?? basename(name).toLowerCase().replace(/\.pdf$/i, '');
}

function rowsFrom(report: BaselineReport): BaselineReportRow[] {
  return Array.isArray(report.rows) ? report.rows : [];
}

function rowMap(report: BaselineReport): Map<string, BaselineReportRow> {
  return new Map(rowsFrom(report).map(row => [rowKey(row), row]));
}

function score(row?: BaselineReportRow): number | null {
  return numberOrNull(row?.afterScore);
}

function error(row?: BaselineReportRow): string | null {
  return typeof row?.error === 'string' && row.error.length > 0 ? row.error : null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

function metrics(path: string, report: BaselineReport): RunMetrics {
  const rows = rowsFrom(report);
  const scores = rows.map(row => score(row) ?? 0);
  const completedRows = rows.filter(row => !error(row) && score(row) !== null).length;
  const durations = rows
    .map(row => row.durationMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return {
    path,
    rowCount: rows.length,
    completedRows,
    meanAllRows: scores.length ? round4(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
    falsePositiveApplied: rows.reduce((sum, row) => sum + (numberOrNull(row.falsePositiveApplied) ?? 0), 0),
    runtimeP95Ms: percentile(durations, 95),
    runtimeMaxMs: durations.length ? Math.max(...durations) : null,
    timeoutKeys: rows
      .filter(row => error(row) || score(row) === null)
      .map(rowKey)
      .sort(),
  };
}

function runtimeWithinBound(reference: RunMetrics, current: RunMetrics): boolean {
  if (reference.runtimeP95Ms === null || current.runtimeP95Ms === null) return false;
  const allowedIncrease = Math.max(reference.runtimeP95Ms * 0.03, 5000);
  return current.runtimeP95Ms - reference.runtimeP95Ms <= allowedIncrease;
}

function toolDuration(row?: BaselineReportRow): number {
  return (row?.appliedTools ?? []).reduce((sum, tool) => sum + (numberOrNull(tool.durationMs) ?? 0), 0);
}

function sumDurations<T>(items: T[] | undefined, read: (item: T) => unknown): number {
  return (items ?? []).reduce((sum, item) => sum + (numberOrNull(read(item)) ?? 0), 0);
}

function runtimeLabelForStage(stage: RuntimeStageTiming): string {
  return [
    stage.key ?? `${stage.source ?? 'unknown'}:stage${stage.stageNumber ?? '?'}`,
    `round ${stage.round ?? '?'}`,
    `${stage.toolCount ?? 0} tools`,
  ].join(' / ');
}

function runtimeBreakdown(row?: BaselineReportRow): RowRuntimeBreakdown | null {
  const summary = row?.runtimeSummary;
  if (!summary) return null;
  const stageTotalMs = sumDurations(summary.stageTimings, item => item.totalMs);
  const stageReanalysisMs = sumDurations(summary.stageTimings, item => item.reanalyzeMs);
  const runtimeToolTimingMs = sumDurations(summary.toolTimings, item => item.durationMs);
  const liveAnalysisMs = sumDurations(summary.liveAnalysisTimings, item => item.durationMs);
  const appliedToolTimingMs = toolDuration(row);
  const currentDurationMs = numberOrNull(row?.durationMs);
  const accountedMs =
    (numberOrNull(summary.analysisBefore?.totalMs) ?? 0) +
    (numberOrNull(summary.analysisAfter?.totalMs) ?? 0) +
    (numberOrNull(summary.deterministicTotalMs) ?? stageTotalMs);
  const stageHotspots: RuntimeHotspot[] = (summary.stageTimings ?? []).map(stage => ({
    kind: 'stage',
    label: runtimeLabelForStage(stage),
    durationMs: numberOrNull(stage.totalMs) ?? 0,
    reanalyzeMs: numberOrNull(stage.reanalyzeMs) ?? 0,
  }));
  const toolHotspots: RuntimeHotspot[] = (summary.toolTimings ?? []).map(tool => ({
    kind: 'tool',
    label: [
      tool.toolName ?? 'unknown_tool',
      `stage ${tool.stage ?? '?'}`,
      tool.source ?? 'unknown',
    ].join(' / '),
    durationMs: numberOrNull(tool.durationMs) ?? 0,
    outcome: tool.outcome ?? null,
  }));
  const liveHotspots: RuntimeHotspot[] = (summary.liveAnalysisTimings ?? []).map(live => ({
    kind: 'live_analysis',
    label: [
      live.context ?? 'live_analysis',
      live.toolName ?? 'unknown_tool',
      live.targetRef ?? 'no_target',
      `${live.scoreBefore ?? 'n/a'}->${live.scoreAfter ?? 'n/a'}`,
    ].join(' / '),
    durationMs: numberOrNull(live.durationMs) ?? 0,
  }));
  const topHotspots = [...stageHotspots, ...toolHotspots, ...liveHotspots]
    .filter(hotspot => hotspot.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 8);
  const earlyExitReasons = (summary.boundedWork?.deterministicEarlyExitReasons ?? [])
    .map(reason => ({
      key: reason.key ?? 'unknown',
      count: numberOrNull(reason.count) ?? 0,
    }))
    .filter(reason => reason.count > 0);
  return {
    analysisBeforeMs: numberOrNull(summary.analysisBefore?.totalMs),
    analysisAfterMs: numberOrNull(summary.analysisAfter?.totalMs),
    deterministicTotalMs: numberOrNull(summary.deterministicTotalMs),
    stageTotalMs: Math.round(stageTotalMs),
    stageReanalysisMs: Math.round(stageReanalysisMs),
    runtimeToolTimingMs: Math.round(runtimeToolTimingMs),
    liveAnalysisMs: Math.round(liveAnalysisMs),
    appliedToolTimingMs: Math.round(appliedToolTimingMs),
    unaccountedMs: currentDurationMs === null ? null : Math.max(0, Math.round(currentDurationMs - accountedMs)),
    topHotspots,
    earlyExitReasons,
  };
}

function observation(path: string, row?: BaselineReportRow): RowObservation | null {
  if (!row) return null;
  return {
    path,
    score: score(row),
    grade: row.afterGrade ?? null,
    durationMs: numberOrNull(row.durationMs),
    error: error(row),
  };
}

function classifyRow(input: {
  key: string;
  reference: BaselineReportRow;
  current?: BaselineReportRow;
  history: RowObservation[];
  currentP95Ms: number | null;
  stricterScoreKeys: Set<string>;
}): RuntimeGateRow {
  const referenceScore = score(input.reference);
  const currentScore = score(input.current);
  const delta = referenceScore !== null && currentScore !== null ? currentScore - referenceScore : null;
  const referenceError = error(input.reference);
  const currentError = error(input.current);
  const currentDurationMs = numberOrNull(input.current?.durationMs);
  const toolDurationMs = toolDuration(input.current);
  const breakdown = runtimeBreakdown(input.current);
  const unaccountedDurationMs = currentDurationMs === null ? null : Math.max(0, currentDurationMs - toolDurationMs);
  const toolDurationRatio = currentDurationMs && currentDurationMs > 0 ? round4(toolDurationMs / currentDurationMs) : null;
  const base = {
    key: input.key,
    file: input.reference.file ?? input.current?.file ?? input.key,
    referenceScore,
    currentScore,
    delta,
    referenceError,
    currentError,
    currentDurationMs,
    toolDurationMs: Math.round(toolDurationMs),
    unaccountedDurationMs,
    toolDurationRatio,
    runtimeBreakdown: breakdown,
    historicalObservations: input.history,
  };

  if (currentError && !referenceError) {
    return {
      ...base,
      classification: 'new_timeout_gate_blocker',
      reason: 'Current run timed out or errored where the reference completed.',
    };
  }
  if (currentError && referenceError) {
    return {
      ...base,
      classification: 'repeated_timeout_known_debt',
      reason: 'Current and reference both timed out or errored.',
    };
  }
  if (currentDurationMs !== null && input.currentP95Ms !== null && currentDurationMs >= input.currentP95Ms) {
    return {
      ...base,
      classification: 'p95_runtime_driver',
      reason: 'Completed row sits at or above the current p95 runtime.',
    };
  }
  if (
    currentDurationMs !== null &&
    currentDurationMs >= 180_000 &&
    toolDurationRatio !== null &&
    toolDurationRatio <= 0.2
  ) {
    return {
      ...base,
      classification: 'analyzer_dominated_completed_tail',
      reason: 'Completed row is near the wall, but recorded tool time explains little of the runtime.',
    };
  }
  if (delta !== null && delta <= -10 && input.stricterScoreKeys.has(input.key)) {
    return {
      ...base,
      classification: 'stricter_score_adjudication',
      reason: 'Known metadata structural optimism row needs explicit stricter-score adjudication.',
    };
  }
  if (delta !== null && delta <= -10) {
    return {
      ...base,
      classification: 'material_score_regression',
      reason: 'Material score drop without timeout/error classification.',
    };
  }
  if (delta !== null && delta >= 10) {
    return {
      ...base,
      classification: 'material_score_improvement',
      reason: 'Material score improvement.',
    };
  }
  return {
    ...base,
    classification: 'stable_or_non_blocking',
    reason: 'No material runtime or score gate issue found for this row.',
  };
}

export function buildRuntimeTailGateDiagnostic(input: {
  generatedAt?: string;
  referencePath: string;
  currentPath: string;
  historyPaths: string[];
  reference: BaselineReport;
  current: BaselineReport;
  history: BaselineReport[];
  stricterScoreKeys?: string[];
}): RuntimeTailGateDiagnostic {
  const stricterScoreKeys = new Set(input.stricterScoreKeys ?? []);
  const referenceMetrics = metrics(input.referencePath, input.reference);
  const currentMetrics = metrics(input.currentPath, input.current);
  const referenceRows = rowMap(input.reference);
  const currentRows = rowMap(input.current);
  const historyMaps = input.history.map(report => rowMap(report));
  const rows = [...referenceRows.entries()]
    .map(([key, reference]) => {
      const history = historyMaps
        .map((map, index) => observation(input.historyPaths[index] ?? `history-${index}`, map.get(key)))
        .filter((value): value is RowObservation => value !== null);
      return classifyRow({
        key,
        reference,
        current: currentRows.get(key),
        history,
        currentP95Ms: currentMetrics.runtimeP95Ms,
        stricterScoreKeys,
      });
    })
    .filter(row => row.classification !== 'stable_or_non_blocking')
    .sort((a, b) => {
      const order: RuntimeClassification[] = [
        'new_timeout_gate_blocker',
        'repeated_timeout_known_debt',
        'p95_runtime_driver',
        'analyzer_dominated_completed_tail',
        'stricter_score_adjudication',
        'material_score_regression',
        'material_score_improvement',
        'stable_or_non_blocking',
      ];
      return order.indexOf(a.classification) - order.indexOf(b.classification) ||
        (b.currentDurationMs ?? 0) - (a.currentDurationMs ?? 0);
    });

  const falsePositiveAppliedZero = referenceMetrics.falsePositiveApplied === 0 && currentMetrics.falsePositiveApplied === 0;
  const noNewTimeouts = currentMetrics.timeoutKeys.every(key => referenceMetrics.timeoutKeys.includes(key));
  const runtimeOk = runtimeWithinBound(referenceMetrics, currentMetrics);
  const reasons: string[] = [];
  if (!falsePositiveAppliedZero) reasons.push('false_positive_applied is non-zero in a compared run');
  if (!noNewTimeouts) reasons.push('current run has timeout/error rows absent from the reference');
  if (!runtimeOk) reasons.push('current p95 runtime exceeds the bounded increase allowance');

  let status: RuntimeDecision;
  let recommendation: string;
  if (referenceMetrics.rowCount === 0 || currentMetrics.rowCount === 0) {
    status = 'incomplete_artifacts';
    recommendation = 'Provide non-empty baseline_report artifacts before making a runtime gate decision.';
  } else if (reasons.length > 0) {
    status = 'runtime_gate_blocked';
    recommendation = 'Do not accept the candidate until new timeout and p95 drivers are resolved or explicitly waived.';
  } else if (rows.some(row => row.classification === 'stricter_score_adjudication')) {
    status = 'score_adjudication_needed';
    reasons.push('runtime gates are clean, but stricter-score candidates still need explicit acceptance');
    recommendation = 'Adjudicate documented stricter-score rows before accepting the candidate.';
  } else {
    status = 'runtime_gate_clear';
    recommendation = 'Runtime gates are clear for this comparison; continue with score and holdout acceptance checks.';
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    decision: { status, reasons, recommendation },
    gates: {
      falsePositiveAppliedZero,
      noNewTimeouts,
      runtimeWithinBound: runtimeOk,
    },
    reference: referenceMetrics,
    current: currentMetrics,
    rows,
  };
}

function rowTable(rows: RuntimeGateRow[]): string[] {
  if (rows.length === 0) return ['No runtime-tail or material score rows found.'];
  const lines = [
    '| Key | Classification | Reference | Current | Runtime | Tool Ratio | Stage Reanalysis | Live Analysis | Reason |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of rows) {
    lines.push([
      `| ${row.key}`,
      `\`${row.classification}\``,
      `${row.referenceScore ?? 'n/a'}${row.referenceError ? ` (${row.referenceError})` : ''}`,
      `${row.currentScore ?? 'n/a'}${row.currentError ? ` (${row.currentError})` : ''}`,
      row.currentDurationMs ?? 'n/a',
      row.toolDurationRatio ?? 'n/a',
      row.runtimeBreakdown?.stageReanalysisMs ?? 'n/a',
      row.runtimeBreakdown?.liveAnalysisMs ?? 'n/a',
      `${row.reason} |`,
    ].join(' | '));
  }
  return lines;
}

function compactPathLabel(path: string): string {
  return `${basename(dirname(path))}/${basename(path)}`;
}

export function renderRuntimeTailGateDiagnosticMarkdown(report: RuntimeTailGateDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Runtime Tail Gate Diagnostic', '');
  lines.push('Read-only diagnostic over existing baseline reports. It does not analyze PDFs, remediate PDFs, write PDFs, call PAC/POC/ODL/Java/semantic AI, or change production behavior.', '');
  lines.push(`- Decision: \`${report.decision.status}\``);
  lines.push(`- Recommendation: ${report.decision.recommendation}`);
  lines.push(`- Reference mean: \`${report.reference.meanAllRows}\`; current mean: \`${report.current.meanAllRows}\``);
  lines.push(`- Reference p95: \`${report.reference.runtimeP95Ms}\`; current p95: \`${report.current.runtimeP95Ms}\``);
  lines.push(`- Reference timeouts: \`${report.reference.timeoutKeys.join(',') || 'none'}\``);
  lines.push(`- Current timeouts: \`${report.current.timeoutKeys.join(',') || 'none'}\``, '');
  lines.push('## Gates', '');
  for (const [key, value] of Object.entries(report.gates)) {
    lines.push(`- ${key}: \`${value}\``);
  }
  lines.push('', '## Reasons', '');
  if (report.decision.reasons.length === 0) lines.push('- none');
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  lines.push('', '## Rows', '');
  lines.push(...rowTable(report.rows));
  const rowsWithHistory = report.rows.filter(row => row.historicalObservations.length > 0);
  if (rowsWithHistory.length > 0) {
    lines.push('', '## Historical Observations', '');
    for (const row of rowsWithHistory) {
      const observations = row.historicalObservations
        .map(observation => {
          const scoreText = `${observation.score ?? 'n/a'}/${observation.grade ?? '?'}`;
          const errorText = observation.error ? `, error ${observation.error}` : '';
          return `${compactPathLabel(observation.path)}: ${scoreText}, ${observation.durationMs ?? 'n/a'}ms${errorText}`;
        })
        .join('; ');
      lines.push(`- ${row.key}: ${observations}`);
    }
  }
  const rowsWithBreakdown = report.rows.filter(row => row.runtimeBreakdown !== null);
  if (rowsWithBreakdown.length > 0) {
    lines.push('', '## Runtime Hotspots', '');
    for (const row of rowsWithBreakdown) {
      const breakdown = row.runtimeBreakdown!;
      lines.push(
        `### ${row.key}`,
        '',
        `- Analysis before/after: \`${breakdown.analysisBeforeMs ?? 'n/a'}ms / ${breakdown.analysisAfterMs ?? 'n/a'}ms\``,
        `- Deterministic total: \`${breakdown.deterministicTotalMs ?? 'n/a'}ms\``,
        `- Stage total/reanalysis: \`${breakdown.stageTotalMs}ms / ${breakdown.stageReanalysisMs}ms\``,
        `- Runtime tool/live analysis: \`${breakdown.runtimeToolTimingMs}ms / ${breakdown.liveAnalysisMs}ms\``,
        `- Applied-tool timing sum: \`${breakdown.appliedToolTimingMs}ms\``,
        `- Unaccounted wall estimate: \`${breakdown.unaccountedMs ?? 'n/a'}ms\``,
        `- Early exits: \`${breakdown.earlyExitReasons.map(reason => `${reason.key} x${reason.count}`).join(', ') || 'none'}\``,
        '',
      );
      if (breakdown.topHotspots.length === 0) {
        lines.push('- No runtime hotspots recorded.', '');
      } else {
        for (const hotspot of breakdown.topHotspots) {
          const reanalysis = hotspot.reanalyzeMs ? `, reanalysis ${Math.round(hotspot.reanalyzeMs)}ms` : '';
          const outcome = hotspot.outcome ? `, outcome ${hotspot.outcome}` : '';
          lines.push(`- ${hotspot.kind}: \`${hotspot.label}\` ${Math.round(hotspot.durationMs)}ms${reanalysis}${outcome}`);
        }
        lines.push('');
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as T;
}

export async function writeRuntimeTailGateDiagnostic(input: {
  referencePath?: string;
  currentPath?: string;
  historyPaths?: string[];
  stricterScoreKeys?: string[];
  outDir?: string;
}): Promise<RuntimeTailGateDiagnostic> {
  const referencePath = input.referencePath ?? DEFAULT_REFERENCE;
  const currentPath = input.currentPath ?? DEFAULT_CURRENT;
  const historyPaths = input.historyPaths ?? DEFAULT_HISTORY;
  const outDir = input.outDir ?? DEFAULT_OUT;
  const [reference, current, ...history] = await Promise.all([
    readJson<BaselineReport>(referencePath),
    readJson<BaselineReport>(currentPath),
    ...historyPaths.map(path => readJson<BaselineReport>(path)),
  ]);
  const report = buildRuntimeTailGateDiagnostic({
    referencePath,
    currentPath,
    historyPaths,
    reference,
    current,
    history,
    stricterScoreKeys: input.stricterScoreKeys,
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'runtime-tail-gate-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'runtime-tail-gate-diagnostic.md'), renderRuntimeTailGateDiagnosticMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let referencePath = DEFAULT_REFERENCE;
  let currentPath = DEFAULT_CURRENT;
  let historyPaths = DEFAULT_HISTORY;
  let stricterScoreKeys: string[] = [];
  let outDir = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--reference' && value) {
      referencePath = value;
      index += 1;
    } else if (arg === '--current' && value) {
      currentPath = value;
      index += 1;
    } else if (arg === '--history' && value) {
      historyPaths = value.split(',').map(item => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--stricter-score-keys' && value) {
      stricterScoreKeys = value.split(',').map(item => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--out' && value) {
      outDir = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${usage()}`);
    }
  }
  const report = await writeRuntimeTailGateDiagnostic({ referencePath, currentPath, historyPaths, stricterScoreKeys, outDir });
  console.log(`Wrote runtime tail gate diagnostic to ${outDir}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
