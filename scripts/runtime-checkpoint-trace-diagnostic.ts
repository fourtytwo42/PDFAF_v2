#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_TRACE =
  '/mnt/pdf-review/pdfaf-validation/runtime-checkpoint-trace-4683-2026-05-21-r1/runtime-traces/4683-Illinois_Higher_Education_in_Prison_Task_Force_2022_Report.json';
const DEFAULT_REPORT =
  '/mnt/pdf-review/pdfaf-validation/runtime-checkpoint-trace-4683-2026-05-21-r1/baseline_report.json';
const DEFAULT_OUT = '/mnt/pdf-review/pdfaf-validation/runtime-checkpoint-trace-diagnostic-2026-05-21-r1';

export type RuntimeCheckpointTraceClassification =
  | 'same_output_runtime_waste_candidate'
  | 'returned_checkpoint_without_stagnation'
  | 'higher_later_checkpoint_available'
  | 'no_checkpoint_return'
  | 'trace_missing_checkpoint_origin';

export type RuntimeCheckpointTraceDecision =
  | 'plan_guarded_checkpoint_stagnation_probe'
  | 'collect_more_checkpoint_trace_evidence'
  | 'keep_runtime_checkpoint_behavior_parked';

interface TraceCountRow {
  key: string;
  count: number;
}

interface RuntimeTraceEvent {
  kind: string;
  elapsedMs?: number;
  score?: number;
  grade?: string | null;
  reason?: string;
  appliedToolCount?: number;
  eligible?: boolean;
  eligibilityReason?: string;
  returned?: boolean;
  reanalyzeMs?: number;
}

interface RuntimeTraceArtifact {
  file?: string;
  rowId?: string;
  elapsedMs?: number;
  eventCount?: number;
  eventCounts?: TraceCountRow[];
  lastVerifiedCheckpointReturned?: boolean;
  verifiedCheckpointHistory?: RuntimeTraceEvent[];
  recentEvents?: RuntimeTraceEvent[];
}

interface BaselineReportRow {
  file?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  durationMs?: number | null;
  falsePositiveApplied?: number | null;
}

interface BaselineReport {
  rows?: BaselineReportRow[];
}

export interface RuntimeCheckpointTraceRow {
  key: string;
  file: string;
  classification: RuntimeCheckpointTraceClassification;
  afterScore: number | null;
  afterGrade: string | null;
  durationMs: number | null;
  falsePositiveApplied: number | null;
  returnedReason: string | null;
  returnedScore: number | null;
  returnedAppliedToolCount: number | null;
  selectedCheckpointReason: string | null;
  selectedCheckpointElapsedMs: number | null;
  returnElapsedMs: number | null;
  wastedAfterSelectedMs: number | null;
  reanalysisAfterSelectedMs: number;
  maxLaterCheckpointScore: number | null;
  maxAppliedToolCountBeforeReturn: number | null;
  discardedAppliedToolCount: number | null;
  reason: string;
}

export interface RuntimeCheckpointTraceDiagnostic {
  generatedAt: string;
  decision: {
    status: RuntimeCheckpointTraceDecision;
    recommendation: string;
    reasons: string[];
  };
  tracePath: string;
  reportPath: string | null;
  rows: RuntimeCheckpointTraceRow[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/runtime-checkpoint-trace-diagnostic.ts [options]',
    '  --trace <runtime-trace.json>',
    '  --report <baseline_report.json>',
    '  --out <dir>',
  ].join('\n');
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function keyFromPath(path: string): string {
  return basename(path).match(/\b(\d{4})\b/)?.[1] ?? basename(path).replace(/\.json$/i, '');
}

function rowForTrace(report: BaselineReport | null, trace: RuntimeTraceArtifact): BaselineReportRow | null {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  if (rows.length === 0) return null;
  const traceFile = trace.file ?? '';
  return rows.find(row => row.file === traceFile) ?? rows[0] ?? null;
}

function selectedCheckpointForReturn(history: RuntimeTraceEvent[], returned: RuntimeTraceEvent): RuntimeTraceEvent | null {
  const appliedToolCount = numberOrNull(returned.appliedToolCount);
  const score = numberOrNull(returned.score);
  if (appliedToolCount === null || score === null) return null;
  return [...history]
    .filter(event =>
      event.returned !== true &&
      numberOrNull(event.appliedToolCount) === appliedToolCount &&
      numberOrNull(event.score) === score &&
      numberOrNull(event.elapsedMs) !== null
    )
    .sort((a, b) => (numberOrNull(a.elapsedMs) ?? 0) - (numberOrNull(b.elapsedMs) ?? 0))[0] ?? null;
}

function stageReanalysisAfter(events: RuntimeTraceEvent[], elapsedMs: number | null, returnElapsedMs: number | null): number {
  if (elapsedMs === null || returnElapsedMs === null) return 0;
  return Math.round(events
    .filter(event =>
      event.kind === 'stage_finish' &&
      (numberOrNull(event.elapsedMs) ?? -1) > elapsedMs &&
      (numberOrNull(event.elapsedMs) ?? Number.POSITIVE_INFINITY) <= returnElapsedMs
    )
    .reduce((sum, event) => sum + (numberOrNull(event.reanalyzeMs) ?? 0), 0));
}

function classify(input: {
  tracePath: string;
  trace: RuntimeTraceArtifact;
  report: BaselineReport | null;
}): RuntimeCheckpointTraceRow {
  const history = input.trace.verifiedCheckpointHistory ?? [];
  const returned = [...history].reverse().find(event => event.returned === true) ?? null;
  const reportRow = rowForTrace(input.report, input.trace);
  const key = keyFromPath(input.trace.rowId ?? input.tracePath);
  const afterScore = numberOrNull(reportRow?.afterScore);
  const afterGrade = reportRow?.afterGrade ?? null;
  const durationMs = numberOrNull(reportRow?.durationMs ?? input.trace.elapsedMs);
  const falsePositiveApplied = numberOrNull(reportRow?.falsePositiveApplied);
  if (!returned) {
    return {
      key,
      file: input.trace.file ?? reportRow?.file ?? key,
      classification: 'no_checkpoint_return',
      afterScore,
      afterGrade,
      durationMs,
      falsePositiveApplied,
      returnedReason: null,
      returnedScore: null,
      returnedAppliedToolCount: null,
      selectedCheckpointReason: null,
      selectedCheckpointElapsedMs: null,
      returnElapsedMs: null,
      wastedAfterSelectedMs: null,
      reanalysisAfterSelectedMs: 0,
      maxLaterCheckpointScore: null,
      maxAppliedToolCountBeforeReturn: null,
      discardedAppliedToolCount: null,
      reason: 'No returned verified checkpoint is present in the trace.',
    };
  }

  const selected = selectedCheckpointForReturn(history, returned);
  const returnElapsedMs = numberOrNull(returned.elapsedMs);
  const selectedElapsedMs = numberOrNull(selected?.elapsedMs);
  const returnedScore = numberOrNull(returned.score);
  const returnedAppliedToolCount = numberOrNull(returned.appliedToolCount);
  if (!selected || selectedElapsedMs === null || returnElapsedMs === null) {
    return {
      key,
      file: input.trace.file ?? reportRow?.file ?? key,
      classification: 'trace_missing_checkpoint_origin',
      afterScore,
      afterGrade,
      durationMs,
      falsePositiveApplied,
      returnedReason: returned.reason ?? null,
      returnedScore,
      returnedAppliedToolCount,
      selectedCheckpointReason: null,
      selectedCheckpointElapsedMs: null,
      returnElapsedMs,
      wastedAfterSelectedMs: null,
      reanalysisAfterSelectedMs: 0,
      maxLaterCheckpointScore: null,
      maxAppliedToolCountBeforeReturn: null,
      discardedAppliedToolCount: null,
      reason: 'Returned checkpoint origin could not be matched by score and applied-tool count.',
    };
  }

  const later = history.filter(event =>
    event.returned !== true &&
    (numberOrNull(event.elapsedMs) ?? -1) > selectedElapsedMs &&
    (numberOrNull(event.elapsedMs) ?? Number.POSITIVE_INFINITY) <= returnElapsedMs
  );
  const laterScores = later.map(event => numberOrNull(event.score)).filter((value): value is number => value !== null);
  const laterAppliedCounts = later.map(event => numberOrNull(event.appliedToolCount)).filter((value): value is number => value !== null);
  const maxLaterCheckpointScore = laterScores.length ? Math.max(...laterScores) : null;
  const maxAppliedToolCountBeforeReturn = laterAppliedCounts.length ? Math.max(...laterAppliedCounts) : returnedAppliedToolCount;
  const wastedAfterSelectedMs = Math.max(0, returnElapsedMs - selectedElapsedMs);
  const reanalysisAfterSelectedMs = stageReanalysisAfter(input.trace.recentEvents ?? [], selectedElapsedMs, returnElapsedMs);
  const discardedAppliedToolCount =
    returnedAppliedToolCount !== null && maxAppliedToolCountBeforeReturn !== null
      ? Math.max(0, maxAppliedToolCountBeforeReturn - returnedAppliedToolCount)
      : null;
  const noLaterScoreGain = maxLaterCheckpointScore === null || returnedScore === null || maxLaterCheckpointScore <= returnedScore;
  const finalMatchesReturned = afterScore === null || returnedScore === null || afterScore === returnedScore;
  if (!noLaterScoreGain) {
    return {
      key,
      file: input.trace.file ?? reportRow?.file ?? key,
      classification: 'higher_later_checkpoint_available',
      afterScore,
      afterGrade,
      durationMs,
      falsePositiveApplied,
      returnedReason: returned.reason ?? null,
      returnedScore,
      returnedAppliedToolCount,
      selectedCheckpointReason: selected.reason ?? null,
      selectedCheckpointElapsedMs: selectedElapsedMs,
      returnElapsedMs,
      wastedAfterSelectedMs,
      reanalysisAfterSelectedMs,
      maxLaterCheckpointScore,
      maxAppliedToolCountBeforeReturn,
      discardedAppliedToolCount,
      reason: 'A later checkpoint scored higher than the returned checkpoint, so early return would be unsafe.',
    };
  }
  if (
    finalMatchesReturned &&
    falsePositiveApplied === 0 &&
    returned.eligibilityReason === 'low_score_timeout_checkpoint_eligible' &&
    wastedAfterSelectedMs >= 120_000
  ) {
    return {
      key,
      file: input.trace.file ?? reportRow?.file ?? key,
      classification: 'same_output_runtime_waste_candidate',
      afterScore,
      afterGrade,
      durationMs,
      falsePositiveApplied,
      returnedReason: returned.reason ?? null,
      returnedScore,
      returnedAppliedToolCount,
      selectedCheckpointReason: selected.reason ?? null,
      selectedCheckpointElapsedMs: selectedElapsedMs,
      returnElapsedMs,
      wastedAfterSelectedMs,
      reanalysisAfterSelectedMs,
      maxLaterCheckpointScore,
      maxAppliedToolCountBeforeReturn,
      discardedAppliedToolCount,
      reason: 'Run returned an early low-score checkpoint after substantial later work with no higher checkpoint score; earlier return could preserve the same final score/state while reducing runtime.',
    };
  }
  return {
    key,
    file: input.trace.file ?? reportRow?.file ?? key,
    classification: 'returned_checkpoint_without_stagnation',
    afterScore,
    afterGrade,
    durationMs,
    falsePositiveApplied,
    returnedReason: returned.reason ?? null,
    returnedScore,
    returnedAppliedToolCount,
    selectedCheckpointReason: selected.reason ?? null,
    selectedCheckpointElapsedMs: selectedElapsedMs,
    returnElapsedMs,
    wastedAfterSelectedMs,
    reanalysisAfterSelectedMs,
    maxLaterCheckpointScore,
    maxAppliedToolCountBeforeReturn,
    discardedAppliedToolCount,
    reason: 'A checkpoint was returned, but current trace does not prove a same-output runtime-waste candidate.',
  };
}

export function buildRuntimeCheckpointTraceDiagnostic(input: {
  generatedAt?: string;
  tracePath: string;
  trace: RuntimeTraceArtifact;
  reportPath?: string | null;
  report?: BaselineReport | null;
}): RuntimeCheckpointTraceDiagnostic {
  const row = classify({
    tracePath: input.tracePath,
    trace: input.trace,
    report: input.report ?? null,
  });
  const reasons: string[] = [];
  let status: RuntimeCheckpointTraceDecision;
  let recommendation: string;
  if (row.classification === 'same_output_runtime_waste_candidate') {
    status = 'plan_guarded_checkpoint_stagnation_probe';
    reasons.push(`${row.key} returned the same low-score checkpoint after ${row.wastedAfterSelectedMs}ms of later work.`);
    if ((row.discardedAppliedToolCount ?? 0) > 0) {
      reasons.push(`${row.discardedAppliedToolCount} later applied tool(s) were discarded by the returned checkpoint; behavior proof must preserve current output truth and not claim those discarded repairs.`);
    }
    recommendation = 'Plan a guarded same-output checkpoint-stagnation probe with targeted controls; do not lower checkpoint floors or score/PAC gates.';
  } else if (row.classification === 'trace_missing_checkpoint_origin' || row.classification === 'no_checkpoint_return') {
    status = 'collect_more_checkpoint_trace_evidence';
    reasons.push(row.reason);
    recommendation = 'Collect richer runtime traces before behavior changes.';
  } else {
    status = 'keep_runtime_checkpoint_behavior_parked';
    reasons.push(row.reason);
    recommendation = 'Keep checkpoint behavior unchanged from this trace.';
  }
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    decision: { status, recommendation, reasons },
    tracePath: input.tracePath,
    reportPath: input.reportPath ?? null,
    rows: [row],
  };
}

function renderRowTable(rows: RuntimeCheckpointTraceRow[]): string[] {
  const lines = [
    '| Key | Classification | Final | Returned | Created | Returned At | Later Work | Later Reanalysis | Discarded Tools | Reason |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of rows) {
    lines.push([
      `| ${row.key}`,
      `\`${row.classification}\``,
      `${row.afterScore ?? 'n/a'}/${row.afterGrade ?? '?'}`,
      `${row.returnedScore ?? 'n/a'}`,
      row.selectedCheckpointElapsedMs ?? 'n/a',
      row.returnElapsedMs ?? 'n/a',
      row.wastedAfterSelectedMs ?? 'n/a',
      row.reanalysisAfterSelectedMs,
      row.discardedAppliedToolCount ?? 'n/a',
      `${row.reason} |`,
    ].join(' | '));
  }
  return lines;
}

export function renderRuntimeCheckpointTraceMarkdown(report: RuntimeCheckpointTraceDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Runtime Checkpoint Trace Diagnostic', '');
  lines.push('Read-only diagnostic over an explicitly written runtime trace. It does not analyze PDFs, remediate PDFs, write PDFs, call PAC/POC/ODL/Java/semantic AI, or change production behavior.', '');
  lines.push(`- Decision: \`${report.decision.status}\``);
  lines.push(`- Recommendation: ${report.decision.recommendation}`);
  lines.push(`- Trace: \`${report.tracePath}\``);
  lines.push(`- Report: \`${report.reportPath ?? 'none'}\``, '');
  lines.push('## Reasons', '');
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  lines.push('', '## Rows', '');
  lines.push(...renderRowTable(report.rows));
  return `${lines.join('\n')}\n`;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as T;
}

export async function writeRuntimeCheckpointTraceDiagnostic(input: {
  tracePath?: string;
  reportPath?: string | null;
  outDir?: string;
}): Promise<RuntimeCheckpointTraceDiagnostic> {
  const tracePath = input.tracePath ?? DEFAULT_TRACE;
  const reportPath = input.reportPath === undefined ? DEFAULT_REPORT : input.reportPath;
  const outDir = input.outDir ?? DEFAULT_OUT;
  const [trace, report] = await Promise.all([
    readJson<RuntimeTraceArtifact>(tracePath),
    reportPath ? readJson<BaselineReport>(reportPath) : Promise.resolve(null),
  ]);
  const diagnostic = buildRuntimeCheckpointTraceDiagnostic({
    tracePath,
    trace,
    reportPath,
    report,
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'runtime-checkpoint-trace-diagnostic.json'), `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'runtime-checkpoint-trace-diagnostic.md'), renderRuntimeCheckpointTraceMarkdown(diagnostic), 'utf8');
  return diagnostic;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let tracePath = DEFAULT_TRACE;
  let reportPath: string | null = DEFAULT_REPORT;
  let outDir = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--trace' && value) {
      tracePath = value;
      index += 1;
    } else if (arg === '--report' && value) {
      reportPath = value === 'none' ? null : value;
      index += 1;
    } else if (arg === '--out' && value) {
      outDir = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${usage()}`);
    }
  }
  const report = await writeRuntimeCheckpointTraceDiagnostic({ tracePath, reportPath, outDir });
  console.log(`Wrote runtime checkpoint trace diagnostic to ${outDir}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
