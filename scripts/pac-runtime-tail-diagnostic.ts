#!/usr/bin/env tsx
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';

const DEFAULT_REFERENCE = 'Output/experiment-corpus-baseline/run-stage187-full-2026-05-03-r1';
const DEFAULT_RECOVERY = 'Output/experiment-corpus-baseline/run-pac-gate-recovery-2026-05-06-r4';
const DEFAULT_CANDIDATE = 'Output/experiment-corpus-baseline/run-pac-analysis-budget-2026-05-06-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/pac-runtime-tail-diagnostic';
const DEFAULT_FOCUS = ['structure-4438', 'long-4516', 'structure-4076', 'long-4683'];
const CHECK_TIMEOUT_MS = 15_000;
const REMEDIATION_ANALYSIS_TIMEOUT_MS = 45_000;
const REMEDIATION_WALL_TIMEOUT_MS = 300_000;

export type RuntimeTailClassification =
  | 'per_pdf_timeout'
  | 'returned_checkpoint_then_timeout'
  | 'soft_deadline_stop'
  | 'verified_checkpoint_timeout_returned'
  | 'bounded_final_reanalysis_guarded'
  | 'late_optional_reanalysis_guarded'
  | 'stage_reanalysis_guarded'
  | 'analyzer_starvation'
  | 'repeated_no_gain_tool_churn'
  | 'protected_reanalysis_churn'
  | 'reanalysis_heavy_large_document'
  | 'mutation_heavy_large_document'
  | 'not_runtime_tail';

export interface RuntimeTailRow {
  fileId: string;
  file: string;
  classification: RuntimeTailClassification;
  candidateWallMs: number | null;
  recoveryWallMs: number | null;
  referenceWallMs: number | null;
  wallDeltaVsReferenceMs: number | null;
  candidateScore: number | null;
  recoveryScore: number | null;
  referenceScore: number | null;
  candidateError: string | null;
  appliedToolCount: number;
  rejectedToolCount: number;
  noEffectToolCount: number;
  pacGateRejectionCount: number;
  deterministicEarlyExitCount: number;
  sameStateNoGainEarlyExitCount: number;
  stageReanalysisCount: number;
  stageReanalysisMs: number;
  mutationToolMs: number;
  protectedReanalysisPassCount: number;
  timeoutTrace: RuntimeTimeoutTraceSummary | null;
  topStageKeys: string[];
  topToolKeys: string[];
}

export interface RuntimeTimeoutTraceSummary {
  lastPhase: string;
  elapsedMs: number;
  lastStageNumber: number | null;
  lastRound: number | null;
  lastToolName: string | null;
  lastToolOutcome: string | null;
  lastToolDurationMs: number | null;
  lastStateSignatureBefore: string | null;
  lastRejectedOrNoEffectReason: string | null;
  completedToolCount: number;
  completedStageCount: number;
  completedStageReanalysisCount: number;
  completedStageReanalysisMs: number;
  lastVerifiedCheckpointScore: number | null;
  lastVerifiedCheckpointGrade: string | null;
  lastVerifiedCheckpointReason: string | null;
  lastVerifiedCheckpointAppliedToolCount: number | null;
  lastVerifiedCheckpointEligible: boolean | null;
  lastVerifiedCheckpointEligibilityReason: string | null;
  lastVerifiedCheckpointReturned: boolean;
  lastVerifiedCheckpointAgeMs: number | null;
  verifiedCheckpointHistory: Array<{
    reason: string;
    score: number;
    grade: string | null;
    appliedToolCount: number;
    eligible: boolean;
    eligibilityReason: string;
    returned: boolean;
    elapsedMs: number;
  }>;
}

export interface RuntimeTailDiagnosticReport {
  generatedAt: string;
  referenceRunDir: string;
  recoveryRunDir: string;
  candidateRunDir: string;
  summary: {
    candidateRows: number;
    focusRows: string[];
    timeoutRows: string[];
    runtimeTailRows: number;
    p95WallMs: number | null;
    maxWallMs: number | null;
    classificationCounts: Array<{ key: RuntimeTailClassification; count: number }>;
  };
  rows: RuntimeTailRow[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/pac-runtime-tail-diagnostic.ts',
    '  [--reference <run-dir>] [--recovery <run-dir>] [--candidate <run-dir>] [--out <dir>] [--focus <id,id,...>]',
  ].join('\n');
}

function scoreFor(row?: RemediateBenchmarkRow): number | null {
  if (!row) return null;
  return row.reanalyzedScore ?? row.afterScore ?? null;
}

function wallFor(row?: RemediateBenchmarkRow): number | null {
  return typeof row?.wallRemediateMs === 'number' && Number.isFinite(row.wallRemediateMs)
    ? row.wallRemediateMs
    : null;
}

function mapRows(rows: RemediateBenchmarkRow[]): Map<string, RemediateBenchmarkRow> {
  return new Map(rows.map(row => [row.id, row]));
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

function verifiedCheckpointHistory(value: unknown): RuntimeTimeoutTraceSummary['verifiedCheckpointHistory'] {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    const record = asRecord(item);
    if (!record) return null;
    const reason = stringOrNull(record['reason']);
    const score = numberOrNull(record['score']);
    if (!reason || score == null) return null;
    return {
      reason,
      score,
      grade: stringOrNull(record['grade']),
      appliedToolCount: numberOrNull(record['appliedToolCount']) ?? 0,
      eligible: record['eligible'] === true,
      eligibilityReason: stringOrNull(record['eligibilityReason']) ?? 'unknown',
      returned: record['returned'] === true,
      elapsedMs: numberOrNull(record['elapsedMs']) ?? 0,
    };
  }).filter((item): item is RuntimeTimeoutTraceSummary['verifiedCheckpointHistory'][number] => Boolean(item));
}

export function parseRuntimeTimeoutTrace(value: unknown): RuntimeTimeoutTraceSummary | null {
  const record = asRecord(value);
  if (!record) return null;
  const lastPhase = stringOrNull(record['lastPhase']);
  if (!lastPhase) return null;
  return {
    lastPhase,
    elapsedMs: numberOrNull(record['elapsedMs']) ?? 0,
    lastStageNumber: numberOrNull(record['lastStageNumber']),
    lastRound: numberOrNull(record['lastRound']),
    lastToolName: stringOrNull(record['lastToolName']),
    lastToolOutcome: stringOrNull(record['lastToolOutcome']),
    lastToolDurationMs: numberOrNull(record['lastToolDurationMs']),
    lastStateSignatureBefore: stringOrNull(record['lastStateSignatureBefore']),
    lastRejectedOrNoEffectReason: stringOrNull(record['lastRejectedOrNoEffectReason']),
    completedToolCount: numberOrNull(record['completedToolCount']) ?? 0,
    completedStageCount: numberOrNull(record['completedStageCount']) ?? 0,
    completedStageReanalysisCount: numberOrNull(record['completedStageReanalysisCount']) ?? 0,
    completedStageReanalysisMs: numberOrNull(record['completedStageReanalysisMs']) ?? 0,
    lastVerifiedCheckpointScore: numberOrNull(record['lastVerifiedCheckpointScore']),
    lastVerifiedCheckpointGrade: stringOrNull(record['lastVerifiedCheckpointGrade']),
    lastVerifiedCheckpointReason: stringOrNull(record['lastVerifiedCheckpointReason']),
    lastVerifiedCheckpointAppliedToolCount: numberOrNull(record['lastVerifiedCheckpointAppliedToolCount']),
    lastVerifiedCheckpointEligible: typeof record['lastVerifiedCheckpointEligible'] === 'boolean' ? record['lastVerifiedCheckpointEligible'] : null,
    lastVerifiedCheckpointEligibilityReason: stringOrNull(record['lastVerifiedCheckpointEligibilityReason']),
    lastVerifiedCheckpointReturned: record['lastVerifiedCheckpointReturned'] === true,
    lastVerifiedCheckpointAgeMs: numberOrNull(record['lastVerifiedCheckpointAgeMs']),
    verifiedCheckpointHistory: verifiedCheckpointHistory(record['verifiedCheckpointHistory']),
  };
}

async function loadRuntimeTimeoutTraces(runDir: string): Promise<Map<string, RuntimeTimeoutTraceSummary>> {
  const dir = join(runDir, 'runtime-timeouts');
  const traces = new Map<string, RuntimeTimeoutTraceSummary>();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return traces;
  }
  await Promise.all(names.filter(name => name.endsWith('.json')).map(async name => {
    const raw = JSON.parse(await readFile(join(dir, name), 'utf8')) as unknown;
    const parsed = parseRuntimeTimeoutTrace(raw);
    const rowId = stringOrNull(asRecord(raw)?.['rowId']) ?? name.replace(/\.json$/, '');
    if (parsed) traces.set(rowId, parsed);
  }));
  return traces;
}

function percentile(values: number[], p: number): number | null {
  const sorted = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

function pacGateRejectionCount(row: RemediateBenchmarkRow): number {
  return (row.appliedTools ?? []).filter(tool => /pac_rule_regressed\(/.test(String(tool.details ?? ''))).length;
}

function sameStateNoGainEarlyExitCount(row: RemediateBenchmarkRow): number {
  return row.runtimeSummary?.boundedWork?.deterministicEarlyExitReasons
    ?.filter(item => item.key.startsWith('same_state_no_gain_runtime_cap:'))
    .reduce((sum, item) => sum + item.count, 0) ?? 0;
}

function softDeadlineEarlyExitCount(row: RemediateBenchmarkRow): number {
  return row.runtimeSummary?.boundedWork?.deterministicEarlyExitReasons
    ?.filter(item => item.key.startsWith('soft_deadline_') || item.key.startsWith('reanalysis_tail_soft_cap_'))
    .reduce((sum, item) => sum + item.count, 0) ?? 0;
}

function softDeadlineReasons(row: RemediateBenchmarkRow): string[] {
  return row.runtimeSummary?.boundedWork?.deterministicEarlyExitReasons
    ?.filter(item => item.key.startsWith('soft_deadline_') || item.key.startsWith('reanalysis_tail_soft_cap_'))
    .flatMap(item => Array(item.count).fill(item.key)) ?? [];
}

function stageReanalysisAdmissionGuardCount(row: RemediateBenchmarkRow): number {
  return row.runtimeSummary?.boundedWork?.deterministicEarlyExitReasons
    ?.filter(item => item.key === 'stage_reanalysis_admission_guard')
    .reduce((sum, item) => sum + item.count, 0) ?? 0;
}

function boundedFinalReanalysisGuardCount(row: RemediateBenchmarkRow): number {
  return row.runtimeSummary?.boundedWork?.deterministicEarlyExitReasons
    ?.filter(item => item.key === 'bounded_final_reanalysis_guard')
    .reduce((sum, item) => sum + item.count, 0) ?? 0;
}

function lateOptionalReanalysisGuardCount(row: RemediateBenchmarkRow): number {
  return row.runtimeSummary?.boundedWork?.deterministicEarlyExitReasons
    ?.filter(item => item.key === 'late_catalog_reanalysis_guard' || item.key === 'late_list_reanalysis_guard')
    .reduce((sum, item) => sum + item.count, 0) ?? 0;
}

function lateOptionalReanalysisReasons(row: RemediateBenchmarkRow): string[] {
  return row.runtimeSummary?.boundedWork?.deterministicEarlyExitReasons
    ?.filter(item => item.key === 'late_catalog_reanalysis_guard' || item.key === 'late_list_reanalysis_guard')
    .flatMap(item => Array(item.count).fill(item.key)) ?? [];
}

function verifiedCheckpointReturnCount(row: RemediateBenchmarkRow): number {
  return row.runtimeSummary?.boundedWork?.deterministicEarlyExitReasons
    ?.filter(item => item.key === 'verified_checkpoint_timeout_return')
    .reduce((sum, item) => sum + item.count, 0) ?? 0;
}

function stageReanalysis(row: RemediateBenchmarkRow): { count: number; ms: number } {
  const stageTimings = row.runtimeSummary?.stageTimings ?? [];
  return {
    count: stageTimings.filter(stage => (stage.reanalyzeMs ?? 0) > 0).length,
    ms: Math.round(stageTimings.reduce((sum, stage) => sum + (stage.reanalyzeMs ?? 0), 0)),
  };
}

function mutationToolMs(row: RemediateBenchmarkRow): number {
  return Math.round((row.runtimeSummary?.toolTimings ?? []).reduce((sum, tool) => sum + (tool.durationMs ?? 0), 0));
}

function protectedReanalysisPassCount(row: RemediateBenchmarkRow): number {
  const selection = row.protectedReanalysisSelection as { attempts?: unknown[] } | undefined;
  if (Array.isArray(selection?.attempts)) return selection.attempts.length;
  return 0;
}

function topStageKeys(row: RemediateBenchmarkRow): string[] {
  return [...(row.runtimeSummary?.stageTimings ?? [])]
    .sort((a, b) => (b.totalMs ?? 0) - (a.totalMs ?? 0) || a.key.localeCompare(b.key))
    .slice(0, 3)
    .map(stage => `${stage.key}:${Math.round(stage.totalMs ?? 0)}ms/reanalyze:${Math.round(stage.reanalyzeMs ?? 0)}ms`);
}

function topToolKeys(row: RemediateBenchmarkRow): string[] {
  return [...(row.runtimeSummary?.toolTimings ?? [])]
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0) || a.toolName.localeCompare(b.toolName))
    .slice(0, 5)
    .map(tool => `${tool.toolName}:${Math.round(tool.durationMs ?? 0)}ms:${tool.outcome}`);
}

function appliedToolDetails(row: RemediateBenchmarkRow): { rejected: number; noEffect: number } {
  const tools = row.appliedTools ?? [];
  return {
    rejected: tools.filter(tool => tool.outcome === 'rejected').length,
    noEffect: tools.filter(tool => tool.outcome === 'no_effect').length,
  };
}

export function classifyRuntimeTail(input: {
  row: RemediateBenchmarkRow;
  candidateWallMs: number | null;
  stageReanalysisMs: number;
  mutationToolMs: number;
  sameStateNoGainEarlyExitCount: number;
  protectedReanalysisPassCount: number;
  pacGateRejectionCount: number;
  softDeadlineEarlyExitCount?: number;
  stageReanalysisAdmissionGuardCount?: number;
  boundedFinalReanalysisGuardCount?: number;
  lateOptionalReanalysisGuardCount?: number;
  verifiedCheckpointReturnCount?: number;
  returnedCheckpointThenTimedOut?: boolean;
}): RuntimeTailClassification {
  const error = String(input.row.error ?? '');
  if (/timeout|aborted/i.test(error) && input.returnedCheckpointThenTimedOut === true) {
    return 'returned_checkpoint_then_timeout';
  }
  if (/timeout|aborted/i.test(error)) return 'per_pdf_timeout';
  if ((input.verifiedCheckpointReturnCount ?? 0) > 0) return 'verified_checkpoint_timeout_returned';
  if ((input.softDeadlineEarlyExitCount ?? 0) > 0) return 'soft_deadline_stop';
  if ((input.boundedFinalReanalysisGuardCount ?? 0) > 0) return 'bounded_final_reanalysis_guarded';
  if ((input.lateOptionalReanalysisGuardCount ?? 0) > 0) return 'late_optional_reanalysis_guarded';
  if ((input.stageReanalysisAdmissionGuardCount ?? 0) > 0) return 'stage_reanalysis_guarded';
  if ((input.row.analysisBeforeMs ?? 0) >= CHECK_TIMEOUT_MS * 0.9 && input.stageReanalysisMs === 0) {
    return 'analyzer_starvation';
  }
  if (input.sameStateNoGainEarlyExitCount > 0 || (input.pacGateRejectionCount >= 5 && input.candidateWallMs != null && input.candidateWallMs >= 60_000)) {
    return 'repeated_no_gain_tool_churn';
  }
  if (input.protectedReanalysisPassCount >= 2 && input.candidateWallMs != null && input.candidateWallMs >= 60_000) {
    return 'protected_reanalysis_churn';
  }
  if (input.stageReanalysisMs >= REMEDIATION_ANALYSIS_TIMEOUT_MS || (input.candidateWallMs != null && input.stageReanalysisMs >= input.candidateWallMs * 0.35)) {
    return 'reanalysis_heavy_large_document';
  }
  if (input.mutationToolMs >= 60_000 || (input.candidateWallMs != null && input.mutationToolMs >= input.candidateWallMs * 0.45)) {
    return 'mutation_heavy_large_document';
  }
  return 'not_runtime_tail';
}

function rowSort(a: RuntimeTailRow, b: RuntimeTailRow): number {
  const rank = (row: RuntimeTailRow): number => row.classification === 'per_pdf_timeout'
    ? 0
    : row.classification === 'returned_checkpoint_then_timeout'
      ? 1
      : row.classification === 'verified_checkpoint_timeout_returned'
        ? 2
        : row.classification === 'soft_deadline_stop'
          ? 3
          : row.classification === 'bounded_final_reanalysis_guarded'
            ? 4
            : row.classification === 'late_optional_reanalysis_guarded'
              ? 5
              : row.classification === 'stage_reanalysis_guarded'
                ? 6
                : row.classification === 'repeated_no_gain_tool_churn'
                  ? 7
                  : row.classification === 'protected_reanalysis_churn'
                    ? 8
                    : row.classification === 'reanalysis_heavy_large_document'
                      ? 9
                      : row.classification === 'mutation_heavy_large_document'
                        ? 10
                        : row.classification === 'analyzer_starvation'
                          ? 11
                          : 12;
  return (
    rank(a) - rank(b) ||
    (b.candidateWallMs ?? -1) - (a.candidateWallMs ?? -1) ||
    a.fileId.localeCompare(b.fileId)
  );
}

function frequency(rows: RuntimeTailRow[]): Array<{ key: RuntimeTailClassification; count: number }> {
  const counts = new Map<RuntimeTailClassification, number>();
  for (const row of rows) counts.set(row.classification, (counts.get(row.classification) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function buildRuntimeTailDiagnostic(input: {
  referenceRunDir: string;
  recoveryRunDir: string;
  candidateRunDir: string;
  referenceRows: RemediateBenchmarkRow[];
  recoveryRows: RemediateBenchmarkRow[];
  candidateRows: RemediateBenchmarkRow[];
  timeoutTraces?: Map<string, RuntimeTimeoutTraceSummary>;
  focusRows?: string[];
  generatedAt?: string;
}): RuntimeTailDiagnosticReport {
  const referenceById = mapRows(input.referenceRows);
  const recoveryById = mapRows(input.recoveryRows);
  const focus = input.focusRows ?? DEFAULT_FOCUS;
  const p95 = percentile(input.candidateRows.map(row => wallFor(row)).filter((value): value is number => value != null), 95);
  const selectedIds = new Set<string>(focus);
  for (const row of input.candidateRows) {
    const wall = wallFor(row);
    if (row.error || (wall != null && p95 != null && wall >= p95)) selectedIds.add(row.id);
  }

  const rows = input.candidateRows
    .filter(row => selectedIds.has(row.id))
    .map(row => {
      const candidateWallMs = wallFor(row);
      const referenceWallMs = wallFor(referenceById.get(row.id));
      const recoveryWallMs = wallFor(recoveryById.get(row.id));
      const reanalysis = stageReanalysis(row);
      const toolDetails = appliedToolDetails(row);
      const pacCount = pacGateRejectionCount(row);
      const sameStateCount = sameStateNoGainEarlyExitCount(row);
      const softDeadlineCount = softDeadlineEarlyExitCount(row);
      const stageAdmissionGuardCount = stageReanalysisAdmissionGuardCount(row);
      const boundedFinalGuardCount = boundedFinalReanalysisGuardCount(row);
      const lateOptionalGuardCount = lateOptionalReanalysisGuardCount(row);
      const verifiedCheckpointCount = verifiedCheckpointReturnCount(row);
      const protectedPasses = protectedReanalysisPassCount(row);
      const mutationMs = mutationToolMs(row);
      const timeoutTrace = input.timeoutTraces?.get(row.id) ?? null;
      const traceReturnedCheckpoint = timeoutTrace?.lastVerifiedCheckpointReturned === true ||
        timeoutTrace?.verifiedCheckpointHistory.some(item => item.returned) === true;
      return {
        fileId: row.id,
        file: row.file,
        classification: classifyRuntimeTail({
          row,
          candidateWallMs,
          stageReanalysisMs: reanalysis.ms,
          mutationToolMs: mutationMs,
          sameStateNoGainEarlyExitCount: sameStateCount,
          protectedReanalysisPassCount: protectedPasses,
          pacGateRejectionCount: pacCount,
          softDeadlineEarlyExitCount: softDeadlineCount,
          stageReanalysisAdmissionGuardCount: stageAdmissionGuardCount,
          boundedFinalReanalysisGuardCount: boundedFinalGuardCount,
          lateOptionalReanalysisGuardCount: lateOptionalGuardCount,
          verifiedCheckpointReturnCount: verifiedCheckpointCount,
          returnedCheckpointThenTimedOut: traceReturnedCheckpoint,
        }),
        candidateWallMs,
        recoveryWallMs,
        referenceWallMs,
        wallDeltaVsReferenceMs: candidateWallMs != null && referenceWallMs != null
          ? Math.round(candidateWallMs - referenceWallMs)
          : null,
        candidateScore: scoreFor(row),
        recoveryScore: scoreFor(recoveryById.get(row.id)),
        referenceScore: scoreFor(referenceById.get(row.id)),
        candidateError: row.error ?? null,
        appliedToolCount: (row.appliedTools ?? []).length,
        rejectedToolCount: toolDetails.rejected,
        noEffectToolCount: toolDetails.noEffect,
        pacGateRejectionCount: pacCount,
        deterministicEarlyExitCount: row.runtimeSummary?.boundedWork?.deterministicEarlyExitCount ?? 0,
        sameStateNoGainEarlyExitCount: sameStateCount,
        stageReanalysisCount: reanalysis.count,
        stageReanalysisMs: reanalysis.ms,
        mutationToolMs: mutationMs,
        protectedReanalysisPassCount: protectedPasses,
        timeoutTrace,
        topStageKeys: verifiedCheckpointCount > 0
          ? ['verified_checkpoint_timeout_return']
          : softDeadlineCount > 0
            ? softDeadlineReasons(row)
          : boundedFinalGuardCount > 0
            ? ['bounded_final_reanalysis_guard']
            : lateOptionalGuardCount > 0
              ? lateOptionalReanalysisReasons(row)
          : stageAdmissionGuardCount > 0
            ? ['stage_reanalysis_admission_guard']
            : topStageKeys(row),
        topToolKeys: topToolKeys(row),
      };
    })
    .sort(rowSort);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    referenceRunDir: input.referenceRunDir,
    recoveryRunDir: input.recoveryRunDir,
    candidateRunDir: input.candidateRunDir,
    summary: {
      candidateRows: input.candidateRows.length,
      focusRows: focus,
      timeoutRows: rows.filter(row => row.classification === 'per_pdf_timeout').map(row => row.fileId),
      runtimeTailRows: rows.filter(row => row.classification !== 'not_runtime_tail').length,
      p95WallMs: p95,
      maxWallMs: percentile(input.candidateRows.map(row => wallFor(row)).filter((value): value is number => value != null), 100),
      classificationCounts: frequency(rows),
    },
    rows,
  };
}

function mdTable(headers: string[], rows: string[][]): string[] {
  if (rows.length === 0) return ['None.'];
  return [
    `| ${headers.join(' |')} |`,
    `| ${headers.map(() => '---').join(' |')} |`,
    ...rows.map(row => `| ${row.map(cell => String(cell).replace(/\|/g, '\\|')).join(' |')} |`),
  ];
}

export function renderRuntimeTailMarkdown(report: RuntimeTailDiagnosticReport): string {
  const lines: string[] = [];
  lines.push('# PAC Runtime Tail Diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Reference run: \`${report.referenceRunDir}\``);
  lines.push(`Recovery run: \`${report.recoveryRunDir}\``);
  lines.push(`Candidate run: \`${report.candidateRunDir}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Candidate rows: ${report.summary.candidateRows}`);
  lines.push(`- Runtime tail rows: ${report.summary.runtimeTailRows}`);
  lines.push(`- Timeout rows: ${report.summary.timeoutRows.join(', ') || 'none'}`);
  lines.push(`- p95 wall: ${Math.round(report.summary.p95WallMs ?? 0)}ms`);
  lines.push(`- max wall: ${Math.round(report.summary.maxWallMs ?? 0)}ms`);
  lines.push('');
  lines.push(...mdTable(
    ['Class', 'Count'],
    report.summary.classificationCounts.map(row => [row.key, String(row.count)]),
  ));
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push(...mdTable(
    ['File', 'Class', 'Wall', 'Ref wall', 'Score', 'Tools', 'PAC rejects', 'Reanalysis', 'Mutation', 'Top stages'],
    report.rows.map(row => [
      row.fileId,
      row.classification,
      String(Math.round(row.candidateWallMs ?? 0)),
      String(Math.round(row.referenceWallMs ?? 0)),
      `${row.candidateScore ?? 'n/a'} / ref ${row.referenceScore ?? 'n/a'}`,
      String(row.appliedToolCount),
      String(row.pacGateRejectionCount),
      `${row.stageReanalysisCount} / ${row.stageReanalysisMs}ms`,
      `${row.mutationToolMs}ms`,
      row.timeoutTrace
        ? `${row.timeoutTrace.lastPhase}${row.timeoutTrace.lastToolName ? `:${row.timeoutTrace.lastToolName}` : ''}`
        : row.topStageKeys.join('<br>'),
    ]),
  ));
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let reference = DEFAULT_REFERENCE;
  let recovery = DEFAULT_RECOVERY;
  let candidate = DEFAULT_CANDIDATE;
  let out = DEFAULT_OUT;
  let focus = DEFAULT_FOCUS;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--reference') reference = args[++index] ?? '';
    else if (arg === '--recovery') recovery = args[++index] ?? '';
    else if (arg === '--candidate') candidate = args[++index] ?? '';
    else if (arg === '--out') out = args[++index] ?? '';
    else if (arg === '--focus') focus = (args[++index] ?? '').split(',').map(item => item.trim()).filter(Boolean);
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  if (!reference || !recovery || !candidate || !out) throw new Error(usage());

  const [referenceRows, recoveryRows, candidateRows, timeoutTraces] = await Promise.all([
    loadBenchmarkRowsFromRunDir(reference),
    loadBenchmarkRowsFromRunDir(recovery),
    loadBenchmarkRowsFromRunDir(candidate),
    loadRuntimeTimeoutTraces(candidate),
  ]);
  const report = buildRuntimeTailDiagnostic({
    referenceRunDir: reference,
    recoveryRunDir: recovery,
    candidateRunDir: candidate,
    referenceRows: referenceRows.remediateResults,
    recoveryRows: recoveryRows.remediateResults,
    candidateRows: candidateRows.remediateResults,
    timeoutTraces,
    focusRows: focus,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pac-runtime-tail-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'pac-runtime-tail-diagnostic.md'), renderRuntimeTailMarkdown(report), 'utf8');
  console.log(`Wrote PAC runtime tail diagnostic to ${outDir}`);
  console.log(`Runtime tail rows: ${report.summary.runtimeTailRows}`);
  console.log(`Timeout rows: ${report.summary.timeoutRows.join(', ') || 'none'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
