#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import type { CategoryKey } from '../src/types.js';
import {
  firstTimelineDivergence,
  toolTimeline,
  type TimelineDivergence,
} from './pac-target-route-diagnostic.js';

const DEFAULT_STAGE42 = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_STRICT = 'Output/experiment-corpus-baseline/run-table-batch-parked-debt-fixed50-2026-05-08-r1';
const DEFAULT_CURRENT = 'Output/experiment-corpus-baseline/run-figure4702-sequence-fixed50-2026-05-08-r1';
const DEFAULT_GATE = 'Output/experiment-corpus-baseline/figure4702-sequence-fixed50-gate-2026-05-08-r1/stage41-benchmark-gate.json';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/protected-regression-runtime-split-diagnostic-2026-05-08-r1';
const DEFAULT_REGRESSION_ROWS = ['font-3448', 'long-4680'];
const DEFAULT_RUNTIME_ROWS = ['long-4683', 'long-4516', 'structure-4076', 'figure-4702', 'long-4680', 'structure-4438'];

export type ProtectedRegressionClassification =
  | 'route_volatility'
  | 'final_reanalysis_drift'
  | 'analyzer_volatility'
  | 'real_harmful_accepted_state'
  | 'missing_evidence';

export type RuntimeTailClassification =
  | 'hard_timeout'
  | 'long_successful_recovery'
  | 'final_reanalysis_tail'
  | 'repeated_no_gain_or_rejected_churn'
  | 'runtime_observation';

export interface CategoryDeltaSummary {
  key: CategoryKey;
  stage42Score: number | null;
  strictScore: number | null;
  currentScore: number | null;
  deltaFromStage42: number | null;
  deltaFromStrict: number | null;
}

export interface PacRejectionSummary {
  toolName: string;
  ruleIds: string[];
  note: string | null;
  stateSignatureBefore: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
}

export interface ProtectedRegressionRowDiagnostic {
  rowId: string;
  classification: ProtectedRegressionClassification;
  stage42Score: number | null;
  strictScore: number | null;
  currentScore: number | null;
  stage42ReanalyzedScore: number | null;
  strictReanalyzedScore: number | null;
  currentReanalyzedScore: number | null;
  currentFinalReanalysisDrop: number | null;
  firstStage42ToCurrentDivergence: TimelineDivergence | null;
  firstStrictToCurrentDivergence: TimelineDivergence | null;
  categoryDeltas: CategoryDeltaSummary[];
  pacRejections: PacRejectionSummary[];
  acceptedToolCount: number;
  rejectedOrNoEffectCount: number;
  protectedFloorNotes: string[];
  recommendation: string;
}

export interface RuntimeTailRowDiagnostic {
  rowId: string;
  classification: RuntimeTailClassification;
  currentScore: number | null;
  currentReanalyzedScore: number | null;
  wallMs: number | null;
  gateRuntimeDeltaMs: number | null;
  hardTimeout: boolean;
  appliedToolCount: number;
  rejectedOrNoEffectCount: number;
  pacRejectionCount: number;
  finalReanalysisDrop: number | null;
  lastToolName: string | null;
  sequenceRecovered: boolean;
  recommendation: string;
}

export interface ProtectedRegressionRuntimeSplitDiagnostic {
  generatedAt: string;
  stage42Run: string;
  strictRun: string;
  currentRun: string;
  gatePath: string | null;
  protectedRegressions: ProtectedRegressionRowDiagnostic[];
  runtimeTail: RuntimeTailRowDiagnostic[];
  summary: {
    protectedRegressionClassifications: Record<ProtectedRegressionClassification, number>;
    runtimeTailClassifications: Record<RuntimeTailClassification, number>;
    falsePositiveAppliedCount: number | null;
    candidateMean: number | null;
    candidateReanalyzedMean: number | null;
    candidateP95WallMs: number | null;
    candidateAttemptCount: number | null;
    nextRecommendation: string;
  };
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/protected-regression-runtime-split-diagnostic.ts [options]',
    '  --stage42 <run-dir>',
    '  --strict <run-dir>',
    '  --current <run-dir>',
    '  --gate <stage41-gate.json>',
    '  --row <id>',
    '  --runtime-row <id>',
    '  --out <dir>',
  ].join('\n');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseDetails(details: string | undefined): Record<string, unknown> | null {
  if (!details?.trim().startsWith('{')) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function rowById(rows: RemediateBenchmarkRow[], rowId: string): RemediateBenchmarkRow | null {
  return rows.find(row => row.id === rowId) ?? null;
}

function finalScore(row: RemediateBenchmarkRow | null | undefined): number | null {
  return row?.reanalyzedScore ?? row?.afterScore ?? null;
}

function finalReanalysisDrop(row: RemediateBenchmarkRow | null | undefined): number | null {
  if (typeof row?.afterScore !== 'number' || typeof row.reanalyzedScore !== 'number') return null;
  return row.afterScore - row.reanalyzedScore;
}

function categoryScore(row: RemediateBenchmarkRow | null | undefined, key: CategoryKey): number | null {
  const categories = row?.reanalyzedCategories ?? row?.afterCategories ?? [];
  const found = categories.find(category => category.key === key);
  return typeof found?.score === 'number' ? found.score : null;
}

function categoryDeltas(stage42: RemediateBenchmarkRow | null, strict: RemediateBenchmarkRow | null, current: RemediateBenchmarkRow | null): CategoryDeltaSummary[] {
  const keys = new Set<CategoryKey>();
  for (const row of [stage42, strict, current]) {
    for (const category of row?.reanalyzedCategories ?? row?.afterCategories ?? []) keys.add(category.key as CategoryKey);
  }
  return [...keys].map((key) => {
    const stage42Score = categoryScore(stage42, key);
    const strictScore = categoryScore(strict, key);
    const currentScore = categoryScore(current, key);
    return {
      key,
      stage42Score,
      strictScore,
      currentScore,
      deltaFromStage42: stage42Score == null || currentScore == null ? null : currentScore - stage42Score,
      deltaFromStrict: strictScore == null || currentScore == null ? null : currentScore - strictScore,
    };
  }).filter(delta => delta.deltaFromStage42 !== 0 || delta.deltaFromStrict !== 0)
    .sort((a, b) => {
      const aSeverity = Math.min(a.deltaFromStage42 ?? 0, a.deltaFromStrict ?? 0);
      const bSeverity = Math.min(b.deltaFromStage42 ?? 0, b.deltaFromStrict ?? 0);
      return aSeverity - bSeverity || a.key.localeCompare(b.key);
    });
}

function ruleIdsFromDetails(parsed: Record<string, unknown> | null): string[] {
  const ids = new Set<string>();
  const one = asRecord(parsed?.['pacRuleRegression']);
  const oneRule = stringOrNull(one?.['ruleId']);
  if (oneRule) ids.add(oneRule);
  for (const item of asArray(parsed?.['pacRuleRegressions'])) {
    const ruleId = stringOrNull(asRecord(item)?.['ruleId']);
    if (ruleId) ids.add(ruleId);
  }
  const note = stringOrNull(parsed?.['note']) ?? stringOrNull(parsed?.['raw']);
  const match = note?.match(/pac_rule_regressed\(([^)]+)\)/);
  if (match?.[1]) ids.add(match[1]);
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function replayStateBefore(parsed: Record<string, unknown> | null): string | null {
  const debug = asRecord(parsed?.['debug']);
  const replayState = asRecord(debug?.['replayState']);
  return stringOrNull(replayState?.['stateSignatureBefore']);
}

function pacRejections(row: RemediateBenchmarkRow | null | undefined): PacRejectionSummary[] {
  const out: PacRejectionSummary[] = [];
  for (const tool of row?.appliedTools ?? []) {
    if (tool.outcome !== 'rejected') continue;
    const parsed = parseDetails(tool.details);
    const ruleIds = ruleIdsFromDetails(parsed);
    if (ruleIds.length === 0) continue;
    out.push({
      toolName: tool.toolName,
      ruleIds,
      note: stringOrNull(parsed?.['note']) ?? stringOrNull(parsed?.['raw']),
      stateSignatureBefore: replayStateBefore(parsed),
      scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
      scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
    });
  }
  return out.sort((a, b) => a.toolName.localeCompare(b.toolName) || (a.note ?? '').localeCompare(b.note ?? ''));
}

function protectedFloorNotes(row: RemediateBenchmarkRow | null | undefined): string[] {
  const notes = new Set<string>();
  for (const tool of row?.appliedTools ?? []) {
    const parsed = parseDetails(tool.details);
    const note = stringOrNull(parsed?.['note']) ?? stringOrNull(parsed?.['raw']);
    if (note?.includes('protected_')) notes.add(`${tool.toolName}:${note}`);
  }
  return [...notes].sort((a, b) => a.localeCompare(b));
}

function hasHardTimeout(row: RemediateBenchmarkRow | null | undefined): boolean {
  const error = stringOrNull(asRecord(row)?.['error'])?.toLowerCase() ?? '';
  return error.includes('timeout') || error.includes('aborted');
}

function sequenceRecovered(row: RemediateBenchmarkRow | null | undefined): boolean {
  return (row?.appliedTools ?? []).some(tool => tool.details?.includes('structure_annotation_sequence_recovered'));
}

function acceptedToolCount(row: RemediateBenchmarkRow | null | undefined): number {
  return (row?.appliedTools ?? []).filter(tool => tool.outcome === 'applied').length;
}

function rejectedOrNoEffectCount(row: RemediateBenchmarkRow | null | undefined): number {
  return (row?.appliedTools ?? []).filter(tool => tool.outcome === 'rejected' || tool.outcome === 'no_effect').length;
}

function lastToolName(row: RemediateBenchmarkRow | null | undefined): string | null {
  const tools = row?.appliedTools ?? [];
  return tools.length > 0 ? tools[tools.length - 1]?.toolName ?? null : null;
}

function classifyProtectedRegression(input: {
  stage42: RemediateBenchmarkRow | null;
  strict: RemediateBenchmarkRow | null;
  current: RemediateBenchmarkRow | null;
  stage42ToCurrent: TimelineDivergence | null;
  strictToCurrent: TimelineDivergence | null;
}): ProtectedRegressionClassification {
  if (!input.stage42 || !input.current) return 'missing_evidence';
  const drop = finalReanalysisDrop(input.current);
  if (drop != null && drop >= 5) return 'final_reanalysis_drift';
  if (input.stage42ToCurrent || input.strictToCurrent) return 'route_volatility';
  if ((input.current.appliedTools ?? []).length === 0 && (finalScore(input.stage42) ?? 0) > (finalScore(input.current) ?? 0)) return 'analyzer_volatility';
  return 'real_harmful_accepted_state';
}

function recommendationForProtected(classification: ProtectedRegressionClassification, rowId: string): string {
  if (classification === 'final_reanalysis_drift') return 'Inspect final reanalysis evidence and checkpoint safety before preserving any in-run state.';
  if (classification === 'route_volatility') return 'Compare same-state tool outcomes before adding any guard; do not patch from aggregate score deltas alone.';
  if (classification === 'analyzer_volatility') return 'Treat as analyzer volatility until a repeat proves a stable remediation path.';
  if (classification === 'real_harmful_accepted_state') return `Run a focused target for ${rowId}; if the same harmful accepted state repeats, add a narrow rollback/admission guard.`;
  return 'Collect complete Stage 42 and current rows before changing behavior.';
}

function buildProtectedRegressionRow(input: {
  rowId: string;
  stage42: RemediateBenchmarkRow | null;
  strict: RemediateBenchmarkRow | null;
  current: RemediateBenchmarkRow | null;
}): ProtectedRegressionRowDiagnostic {
  const stage42ToCurrent = input.stage42 && input.current
    ? firstTimelineDivergence(toolTimeline(input.stage42), toolTimeline(input.current))
    : null;
  const strictToCurrent = input.strict && input.current
    ? firstTimelineDivergence(toolTimeline(input.strict), toolTimeline(input.current))
    : null;
  const classification = classifyProtectedRegression({
    stage42: input.stage42,
    strict: input.strict,
    current: input.current,
    stage42ToCurrent,
    strictToCurrent,
  });
  return {
    rowId: input.rowId,
    classification,
    stage42Score: input.stage42?.afterScore ?? null,
    strictScore: input.strict?.afterScore ?? null,
    currentScore: input.current?.afterScore ?? null,
    stage42ReanalyzedScore: input.stage42?.reanalyzedScore ?? null,
    strictReanalyzedScore: input.strict?.reanalyzedScore ?? null,
    currentReanalyzedScore: input.current?.reanalyzedScore ?? null,
    currentFinalReanalysisDrop: finalReanalysisDrop(input.current),
    firstStage42ToCurrentDivergence: stage42ToCurrent,
    firstStrictToCurrentDivergence: strictToCurrent,
    categoryDeltas: categoryDeltas(input.stage42, input.strict, input.current),
    pacRejections: pacRejections(input.current),
    acceptedToolCount: acceptedToolCount(input.current),
    rejectedOrNoEffectCount: rejectedOrNoEffectCount(input.current),
    protectedFloorNotes: protectedFloorNotes(input.current),
    recommendation: recommendationForProtected(classification, input.rowId),
  };
}

function gateRuntimeDelta(gate: Record<string, unknown> | null, rowId: string): number | null {
  for (const item of asArray(gate?.['topRuntimeRegressions'])) {
    const record = asRecord(item);
    if (record?.['id'] === rowId) return numberOrNull(record['deltaMs']);
  }
  return null;
}

function classifyRuntime(row: RemediateBenchmarkRow | null, rowId: string): RuntimeTailClassification {
  if (hasHardTimeout(row)) return 'hard_timeout';
  const drop = finalReanalysisDrop(row);
  if (drop != null && drop >= 5) return 'final_reanalysis_tail';
  if (rejectedOrNoEffectCount(row) >= Math.max(6, acceptedToolCount(row))) return 'repeated_no_gain_or_rejected_churn';
  if ((row?.wallRemediateMs ?? 0) >= 120_000 && (finalScore(row) ?? 0) >= 80) return 'long_successful_recovery';
  if (rowId === 'structure-4438') return 'hard_timeout';
  return 'runtime_observation';
}

function recommendationForRuntime(classification: RuntimeTailClassification, rowId: string): string {
  if (classification === 'hard_timeout') return rowId === 'structure-4438'
    ? 'Keep parked unless a trace shows an eligible 90/A checkpoint.'
    : 'Inspect timeout trace before changing admission or checkpoint behavior.';
  if (classification === 'long_successful_recovery') return 'Preserve quality; look for late optional work or final-reanalysis cost before suppressing anything.';
  if (classification === 'final_reanalysis_tail') return 'Check whether the in-run state is safe before considering checkpoint preservation.';
  if (classification === 'repeated_no_gain_or_rejected_churn') return 'Candidate for a bounded no-gain admission guard if same-state repetition is proven.';
  return 'Track as runtime observation; no behavior change from this row alone.';
}

function buildRuntimeTailRow(input: {
  rowId: string;
  current: RemediateBenchmarkRow | null;
  gate: Record<string, unknown> | null;
}): RuntimeTailRowDiagnostic {
  const classification = classifyRuntime(input.current, input.rowId);
  return {
    rowId: input.rowId,
    classification,
    currentScore: input.current?.afterScore ?? null,
    currentReanalyzedScore: input.current?.reanalyzedScore ?? null,
    wallMs: input.current?.wallRemediateMs ?? input.current?.totalPipelineMs ?? null,
    gateRuntimeDeltaMs: gateRuntimeDelta(input.gate, input.rowId),
    hardTimeout: hasHardTimeout(input.current),
    appliedToolCount: acceptedToolCount(input.current),
    rejectedOrNoEffectCount: rejectedOrNoEffectCount(input.current),
    pacRejectionCount: pacRejections(input.current).length,
    finalReanalysisDrop: finalReanalysisDrop(input.current),
    lastToolName: lastToolName(input.current),
    sequenceRecovered: sequenceRecovered(input.current),
    recommendation: recommendationForRuntime(classification, input.rowId),
  };
}

function emptyProtectedCounts(): Record<ProtectedRegressionClassification, number> {
  return {
    route_volatility: 0,
    final_reanalysis_drift: 0,
    analyzer_volatility: 0,
    real_harmful_accepted_state: 0,
    missing_evidence: 0,
  };
}

function emptyRuntimeCounts(): Record<RuntimeTailClassification, number> {
  return {
    hard_timeout: 0,
    long_successful_recovery: 0,
    final_reanalysis_tail: 0,
    repeated_no_gain_or_rejected_churn: 0,
    runtime_observation: 0,
  };
}

export function buildProtectedRegressionRuntimeSplitDiagnostic(input: {
  stage42Run: string;
  strictRun: string;
  currentRun: string;
  gatePath?: string | null;
  stage42Rows: RemediateBenchmarkRow[];
  strictRows: RemediateBenchmarkRow[];
  currentRows: RemediateBenchmarkRow[];
  gate?: Record<string, unknown> | null;
  regressionRows?: string[];
  runtimeRows?: string[];
  generatedAt?: string;
}): ProtectedRegressionRuntimeSplitDiagnostic {
  const regressionRows = input.regressionRows ?? DEFAULT_REGRESSION_ROWS;
  const runtimeRows = input.runtimeRows ?? DEFAULT_RUNTIME_ROWS;
  const protectedRegressions = regressionRows.map(rowId => buildProtectedRegressionRow({
    rowId,
    stage42: rowById(input.stage42Rows, rowId),
    strict: rowById(input.strictRows, rowId),
    current: rowById(input.currentRows, rowId),
  }));
  const runtimeTail = runtimeRows.map(rowId => buildRuntimeTailRow({
    rowId,
    current: rowById(input.currentRows, rowId),
    gate: input.gate ?? null,
  }));
  const protectedCounts = emptyProtectedCounts();
  for (const row of protectedRegressions) protectedCounts[row.classification] += 1;
  const runtimeCounts = emptyRuntimeCounts();
  for (const row of runtimeTail) runtimeCounts[row.classification] += 1;
  const summaryRecord = asRecord(input.gate?.['summary']);
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    stage42Run: input.stage42Run,
    strictRun: input.strictRun,
    currentRun: input.currentRun,
    gatePath: input.gatePath ?? null,
    protectedRegressions,
    runtimeTail,
    summary: {
      protectedRegressionClassifications: protectedCounts,
      runtimeTailClassifications: runtimeCounts,
      falsePositiveAppliedCount: numberOrNull(summaryRecord?.['falsePositiveAppliedCount']),
      candidateMean: numberOrNull(summaryRecord?.['candidateMean']),
      candidateReanalyzedMean: mean(input.currentRows.map(row => row.reanalyzedScore)),
      candidateP95WallMs: numberOrNull(summaryRecord?.['candidateP95WallMs']),
      candidateAttemptCount: numberOrNull(summaryRecord?.['candidateAttemptCount']),
      nextRecommendation: protectedRegressions.some(row => row.classification === 'final_reanalysis_drift')
        ? 'Start with final reanalysis drift on long-4680; diagnose font-3448 route/floor failure separately before behavior changes.'
        : 'Use the classified rows to pick one narrow behavior target; do not broaden PAC policy or timeouts.',
    },
  };
}

function mean(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function renderDivergence(divergence: TimelineDivergence | null): string {
  if (!divergence) return 'none';
  const left = divergence.left ? `${divergence.left.toolName}:${divergence.left.outcome}:${divergence.left.stateSignatureBefore ?? 'no-state'}` : 'none';
  const right = divergence.right ? `${divergence.right.toolName}:${divergence.right.outcome}:${divergence.right.stateSignatureBefore ?? 'no-state'}` : 'none';
  return `${divergence.reason}/${divergence.classification} [${left} vs ${right}]`;
}

export function renderProtectedRegressionRuntimeSplitMarkdown(report: ProtectedRegressionRuntimeSplitDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Protected Regression And Runtime Tail Split Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Stage 42: \`${report.stage42Run}\``);
  lines.push(`Strict/table baseline: \`${report.strictRun}\``);
  lines.push(`Current: \`${report.currentRun}\``);
  lines.push(`Gate: \`${report.gatePath ?? 'not provided'}\``, '');
  lines.push('## Summary', '');
  lines.push(`- Candidate mean: \`${report.summary.candidateMean ?? 'n/a'}\``);
  lines.push(`- Candidate reanalyzed mean: \`${report.summary.candidateReanalyzedMean ?? 'n/a'}\``);
  lines.push(`- p95 wall: \`${report.summary.candidateP95WallMs ?? 'n/a'}ms\``);
  lines.push(`- Attempts: \`${report.summary.candidateAttemptCount ?? 'n/a'}\``);
  lines.push(`- False-positive-applied: \`${report.summary.falsePositiveAppliedCount ?? 'n/a'}\``);
  lines.push(`- Recommendation: ${report.summary.nextRecommendation}`, '');
  lines.push('## Protected Regressions', '');
  lines.push('| Row | Classification | Stage42 | Strict | Current | Current Reanalyzed | Final Drop | First Divergence | PAC Rejections |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.protectedRegressions) {
    lines.push(`| \`${row.rowId}\` | \`${row.classification}\` | \`${row.stage42Score ?? 'n/a'}\` | \`${row.strictScore ?? 'n/a'}\` | \`${row.currentScore ?? 'n/a'}\` | \`${row.currentReanalyzedScore ?? 'n/a'}\` | \`${row.currentFinalReanalysisDrop ?? 'n/a'}\` | ${renderDivergence(row.firstStage42ToCurrentDivergence)} | \`${row.pacRejections.length}\` |`);
  }
  for (const row of report.protectedRegressions) {
    lines.push('', `### ${row.rowId}`, '');
    lines.push(`- Recommendation: ${row.recommendation}`);
    lines.push(`- Strict-to-current divergence: ${renderDivergence(row.firstStrictToCurrentDivergence)}`);
    lines.push(`- Protected notes: ${row.protectedFloorNotes.join('; ') || 'none'}`);
    lines.push(`- Category deltas: ${row.categoryDeltas.map(delta => `${delta.key}:${delta.deltaFromStage42 ?? 'n/a'}/${delta.deltaFromStrict ?? 'n/a'}`).join(', ') || 'none'}`);
  }
  lines.push('', '## Runtime Tail', '');
  lines.push('| Row | Classification | Score | Reanalyzed | Wall ms | Gate delta ms | Timeout | Tools applied/rejected | Final Drop | Last Tool |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.runtimeTail) {
    lines.push(`| \`${row.rowId}\` | \`${row.classification}\` | \`${row.currentScore ?? 'n/a'}\` | \`${row.currentReanalyzedScore ?? 'n/a'}\` | \`${row.wallMs ?? 'n/a'}\` | \`${row.gateRuntimeDeltaMs ?? 'n/a'}\` | \`${row.hardTimeout}\` | \`${row.appliedToolCount}/${row.rejectedOrNoEffectCount}\` | \`${row.finalReanalysisDrop ?? 'n/a'}\` | \`${row.lastToolName ?? 'none'}\` |`);
  }
  return `${lines.join('\n')}\n`;
}

async function loadRows(runDir: string): Promise<RemediateBenchmarkRow[]> {
  return (await loadBenchmarkRowsFromRunDir(runDir)).remediateResults;
}

async function loadGate(gatePath: string | null): Promise<Record<string, unknown> | null> {
  if (!gatePath) return null;
  try {
    return JSON.parse(await readFile(gatePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let stage42Run = DEFAULT_STAGE42;
  let strictRun = DEFAULT_STRICT;
  let currentRun = DEFAULT_CURRENT;
  let gatePath: string | null = DEFAULT_GATE;
  let out = DEFAULT_OUT;
  const regressionRows: string[] = [];
  const runtimeRows: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--stage42') stage42Run = args[++index] ?? DEFAULT_STAGE42;
    else if (arg === '--strict') strictRun = args[++index] ?? DEFAULT_STRICT;
    else if (arg === '--current') currentRun = args[++index] ?? DEFAULT_CURRENT;
    else if (arg === '--gate') gatePath = args[++index] ?? DEFAULT_GATE;
    else if (arg === '--no-gate') gatePath = null;
    else if (arg === '--row') regressionRows.push(args[++index] ?? '');
    else if (arg === '--runtime-row') runtimeRows.push(args[++index] ?? '');
    else if (arg === '--out') out = args[++index] ?? DEFAULT_OUT;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  const [stage42Rows, strictRows, currentRows, gate] = await Promise.all([
    loadRows(stage42Run),
    loadRows(strictRun),
    loadRows(currentRun),
    loadGate(gatePath),
  ]);
  const report = buildProtectedRegressionRuntimeSplitDiagnostic({
    stage42Run,
    strictRun,
    currentRun,
    gatePath,
    stage42Rows,
    strictRows,
    currentRows,
    gate,
    regressionRows: regressionRows.filter(Boolean).length ? regressionRows.filter(Boolean) : DEFAULT_REGRESSION_ROWS,
    runtimeRows: runtimeRows.filter(Boolean).length ? runtimeRows.filter(Boolean) : DEFAULT_RUNTIME_ROWS,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'protected-regression-runtime-split-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'protected-regression-runtime-split-diagnostic.md'), renderProtectedRegressionRuntimeSplitMarkdown(report), 'utf8');
  console.log(`Wrote protected regression/runtime split diagnostic to ${outDir}`);
  console.log(`Protected classifications: ${JSON.stringify(report.summary.protectedRegressionClassifications)}`);
  console.log(`Runtime classifications: ${JSON.stringify(report.summary.runtimeTailClassifications)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
