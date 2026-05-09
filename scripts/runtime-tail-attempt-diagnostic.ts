#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { AppliedRemediationTool } from '../src/types.js';

const DEFAULT_BASELINE = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_CANDIDATE = 'Output/experiment-corpus-baseline/run-font3448-native-tagging-fixed50-2026-05-08-r1';
const DEFAULT_GATE = 'Output/experiment-corpus-baseline/font3448-native-tagging-fixed50-gate-2026-05-08-r1/stage41-benchmark-gate.json';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/runtime-tail-attempt-diagnostic-2026-05-09-r1';
const DEFAULT_FOCUS_ROWS = [
  'structure-4438',
  'long-4516',
  'structure-4076',
  'long-4683',
  'figure-4702',
  'font-4057',
  'long-4680',
  'figure-4754',
];

export type RuntimeAttemptClassification =
  | 'parked_hard_timeout'
  | 'checkpoint_return_candidate'
  | 'repeated_no_gain_churn'
  | 'final_reanalysis_tail'
  | 'optional_postpass_churn'
  | 'quality_gain_runtime_tradeoff'
  | 'residual_score_debt_not_runtime_fix';

export interface RuntimeAttemptToolSummary {
  toolName: string;
  outcome: string;
  count: number;
  totalMs: number;
  noGainCount: number;
  rejectedOrNoEffectCount: number;
  replayStateCount: number;
}

export interface RuntimeAttemptRow {
  id: string;
  file: string;
  classification: RuntimeAttemptClassification;
  score: number | null;
  grade: string | null;
  baselineScore: number | null;
  wallMs: number | null;
  baselineWallMs: number | null;
  wallDeltaMs: number | null;
  attemptCount: number;
  rejectedOrNoEffectCount: number;
  noGainAttemptCount: number;
  postPassAttemptCount: number;
  postPassNoGainCount: number;
  stageReanalysisMs: number;
  analysisAfterMs: number | null;
  finalReanalysisDrop: number | null;
  hardTimeout: boolean;
  lastVerifiedCheckpointScore: number | null;
  topRepeatedTools: RuntimeAttemptToolSummary[];
  topNoGainTools: RuntimeAttemptToolSummary[];
  safeRuntimeGuard: string;
  reason: string;
}

export interface RuntimeAttemptDiagnosticReport {
  generatedAt: string;
  baselineRunDir: string;
  candidateRunDir: string;
  gatePath: string | null;
  gateSummary: {
    passed: boolean | null;
    failedGates: string[];
    baselineP95WallMs: number | null;
    candidateP95WallMs: number | null;
    baselineAttemptCount: number | null;
    candidateAttemptCount: number | null;
    falsePositiveAppliedCount: number | null;
  };
  summary: {
    rowCount: number;
    focusRows: string[];
    classificationCounts: Array<{ key: RuntimeAttemptClassification; count: number }>;
    behaviorRecommendation: 'no_behavior_change' | 'narrow_runtime_guard_candidate';
    recommendedNextAction: string;
  };
  rows: RuntimeAttemptRow[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/runtime-tail-attempt-diagnostic.ts [options]',
    '  --baseline <run-dir>',
    '  --candidate <run-dir>',
    '  --gate <stage41-benchmark-gate.json>',
    '  --out <dir>',
    '  --focus <id,id,...>',
  ].join('\n');
}

function rowMap(rows: RemediateBenchmarkRow[]): Map<string, RemediateBenchmarkRow> {
  return new Map(rows.map(row => [row.id, row]));
}

function scoreFor(row?: RemediateBenchmarkRow): number | null {
  return row?.reanalyzedScore ?? row?.afterScore ?? null;
}

function gradeFor(row?: RemediateBenchmarkRow): string | null {
  return row?.reanalyzedGrade ?? row?.afterGrade ?? null;
}

function wallFor(row?: RemediateBenchmarkRow): number | null {
  return typeof row?.wallRemediateMs === 'number' && Number.isFinite(row.wallRemediateMs) ? row.wallRemediateMs : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (typeof details !== 'string' || details.trim().length === 0) return null;
  try {
    return asRecord(JSON.parse(details));
  } catch {
    return null;
  }
}

function replayStateBefore(tool: AppliedRemediationTool): string | null {
  const parsed = parseDetails(tool.details);
  const debug = asRecord(parsed?.debug);
  const replay = asRecord(debug?.replayState);
  const value = replay?.stateSignatureBefore;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isNoGain(tool: AppliedRemediationTool): boolean {
  return tool.scoreAfter <= tool.scoreBefore;
}

function isRejectedOrNoEffect(tool: AppliedRemediationTool): boolean {
  return tool.outcome === 'rejected' || tool.outcome === 'no_effect';
}

function isPostPass(tool: AppliedRemediationTool): boolean {
  return tool.source === 'post_pass' || /^post_pass_/.test(String(tool.details ?? '')) || String(tool.details ?? '').includes('"post_pass_');
}

function stageReanalysisMs(row: RemediateBenchmarkRow): number {
  return Math.round((row.runtimeSummary?.stageTimings ?? []).reduce((sum, stage) => sum + (stage.reanalyzeMs ?? 0), 0));
}

function finalReanalysisDrop(row: RemediateBenchmarkRow): number | null {
  if (typeof row.afterScore !== 'number' || typeof row.reanalyzedScore !== 'number') return null;
  return row.afterScore - row.reanalyzedScore;
}

function lastCheckpointScore(row: RemediateBenchmarkRow): number | null {
  const captures = row.protectedDebugStateCaptures ?? [];
  if (captures.length > 0) return captures[captures.length - 1]?.score ?? null;
  const selection = asRecord(row.protectedReanalysisSelection);
  const checkpoint = asRecord(selection?.selectedCheckpoint);
  return numberOrNull(checkpoint?.score);
}

function summarizeTools(tools: AppliedRemediationTool[]): RuntimeAttemptToolSummary[] {
  const groups = new Map<string, {
    toolName: string;
    outcome: string;
    count: number;
    totalMs: number;
    noGainCount: number;
    rejectedOrNoEffectCount: number;
    states: Set<string>;
  }>();
  for (const tool of tools) {
    const key = `${tool.toolName}:${tool.outcome}`;
    const group = groups.get(key) ?? {
      toolName: tool.toolName,
      outcome: tool.outcome,
      count: 0,
      totalMs: 0,
      noGainCount: 0,
      rejectedOrNoEffectCount: 0,
      states: new Set<string>(),
    };
    group.count += 1;
    group.totalMs += tool.durationMs ?? 0;
    if (isNoGain(tool)) group.noGainCount += 1;
    if (isRejectedOrNoEffect(tool)) group.rejectedOrNoEffectCount += 1;
    const state = replayStateBefore(tool);
    if (state) group.states.add(state);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(group => ({
      toolName: group.toolName,
      outcome: group.outcome,
      count: group.count,
      totalMs: Math.round(group.totalMs),
      noGainCount: group.noGainCount,
      rejectedOrNoEffectCount: group.rejectedOrNoEffectCount,
      replayStateCount: group.states.size,
    }))
    .sort((a, b) => b.count - a.count || b.totalMs - a.totalMs || a.toolName.localeCompare(b.toolName) || a.outcome.localeCompare(b.outcome));
}

function classificationCounts(rows: RuntimeAttemptRow[]): Array<{ key: RuntimeAttemptClassification; count: number }> {
  const counts = new Map<RuntimeAttemptClassification, number>();
  for (const row of rows) counts.set(row.classification, (counts.get(row.classification) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function chooseClassification(input: {
  row: RemediateBenchmarkRow;
  score: number | null;
  hardTimeout: boolean;
  wallMs: number | null;
  attemptCount: number;
  rejectedOrNoEffectCount: number;
  noGainAttemptCount: number;
  postPassAttemptCount: number;
  postPassNoGainCount: number;
  stageReanalysisMs: number;
  analysisAfterMs: number | null;
  finalReanalysisDrop: number | null;
  topRepeatedTools: RuntimeAttemptToolSummary[];
}): { classification: RuntimeAttemptClassification; safeRuntimeGuard: string; reason: string } {
  if (input.hardTimeout) {
    return {
      classification: 'parked_hard_timeout',
      safeRuntimeGuard: 'none',
      reason: 'The row hard-timed out and has no completed candidate score to preserve.',
    };
  }
  if (input.finalReanalysisDrop != null && input.finalReanalysisDrop >= 10) {
    return {
      classification: 'final_reanalysis_tail',
      safeRuntimeGuard: 'none',
      reason: `Final/protected reanalysis drops the in-run score by ${input.finalReanalysisDrop}; this is quality evidence, not a runtime-only skip.`,
    };
  }
  if (input.score != null && input.score < 80) {
    return {
      classification: 'residual_score_debt_not_runtime_fix',
      safeRuntimeGuard: 'none',
      reason: 'Final score is below B; runtime guards should not hide residual score debt.',
    };
  }
  if (input.postPassNoGainCount >= 3 && input.wallMs != null && input.wallMs >= 60_000) {
    return {
      classification: 'optional_postpass_churn',
      safeRuntimeGuard: 'diagnostic_only',
      reason: 'Multiple post-pass attempts did not move score; this may become a narrow optional-postpass guard after targeted proof.',
    };
  }
  const repeatedNoGain = input.topRepeatedTools.some(tool => tool.count >= 2 && tool.noGainCount >= 2 && tool.rejectedOrNoEffectCount >= 1);
  if (repeatedNoGain && input.wallMs != null && input.wallMs >= 60_000) {
    return {
      classification: 'repeated_no_gain_churn',
      safeRuntimeGuard: 'diagnostic_only',
      reason: 'Repeated same-family no-gain work contributes to runtime, but needs row/tool-state proof before suppression.',
    };
  }
  if (input.wallMs != null && input.wallMs >= 120_000 && input.score != null && input.score >= 80) {
    return {
      classification: 'quality_gain_runtime_tradeoff',
      safeRuntimeGuard: 'none',
      reason: 'The expensive row completes with acceptable quality; skipping work risks losing score movement.',
    };
  }
  return {
    classification: 'residual_score_debt_not_runtime_fix',
    safeRuntimeGuard: 'none',
    reason: 'Row is not a current safe runtime-guard candidate.',
  };
}

export function buildRuntimeAttemptDiagnostic(input: {
  baselineRunDir: string;
  candidateRunDir: string;
  gatePath?: string | null;
  baselineRows: RemediateBenchmarkRow[];
  candidateRows: RemediateBenchmarkRow[];
  gateJson?: unknown;
  focusRows?: string[];
  generatedAt?: string;
}): RuntimeAttemptDiagnosticReport {
  const focusRows = input.focusRows ?? DEFAULT_FOCUS_ROWS;
  const baselineById = rowMap(input.baselineRows);
  const selected = new Set(focusRows);
  const candidateWalls = input.candidateRows.map(row => wallFor(row)).filter((value): value is number => value != null).sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(candidateWalls.length * 0.95) - 1);
  const p95 = candidateWalls[p95Index] ?? null;
  for (const row of input.candidateRows) {
    const wall = wallFor(row);
    if (row.error || (wall != null && p95 != null && wall >= p95)) selected.add(row.id);
  }

  const rows = input.candidateRows.filter(row => selected.has(row.id)).map(row => {
    const tools = row.appliedTools ?? [];
    const topRepeatedTools = summarizeTools(tools).filter(tool => tool.count > 1).slice(0, 5);
    const topNoGainTools = summarizeTools(tools.filter(isNoGain)).slice(0, 5);
    const score = scoreFor(row);
    const wallMs = wallFor(row);
    const baselineWallMs = wallFor(baselineById.get(row.id));
    const hardTimeout = /timeout|aborted/i.test(String(row.error ?? ''));
    const noGainAttemptCount = tools.filter(isNoGain).length;
    const rejectedOrNoEffectCount = tools.filter(isRejectedOrNoEffect).length;
    const postPassTools = tools.filter(isPostPass);
    const reanalysisMs = stageReanalysisMs(row);
    const analysisAfterMs = typeof row.analysisAfterMs === 'number' ? row.analysisAfterMs : null;
    const drop = finalReanalysisDrop(row);
    const classified = chooseClassification({
      row,
      score,
      hardTimeout,
      wallMs,
      attemptCount: tools.length,
      rejectedOrNoEffectCount,
      noGainAttemptCount,
      postPassAttemptCount: postPassTools.length,
      postPassNoGainCount: postPassTools.filter(isNoGain).length,
      stageReanalysisMs: reanalysisMs,
      analysisAfterMs,
      finalReanalysisDrop: drop,
      topRepeatedTools,
    });
    return {
      id: row.id,
      file: row.file,
      classification: classified.classification,
      score,
      grade: gradeFor(row),
      baselineScore: scoreFor(baselineById.get(row.id)),
      wallMs,
      baselineWallMs,
      wallDeltaMs: wallMs != null && baselineWallMs != null ? Math.round(wallMs - baselineWallMs) : null,
      attemptCount: tools.length,
      rejectedOrNoEffectCount,
      noGainAttemptCount,
      postPassAttemptCount: postPassTools.length,
      postPassNoGainCount: postPassTools.filter(isNoGain).length,
      stageReanalysisMs: reanalysisMs,
      analysisAfterMs,
      finalReanalysisDrop: drop,
      hardTimeout,
      lastVerifiedCheckpointScore: lastCheckpointScore(row),
      topRepeatedTools,
      topNoGainTools,
      safeRuntimeGuard: classified.safeRuntimeGuard,
      reason: classified.reason,
    };
  }).sort((a, b) => {
    const rank = (row: RuntimeAttemptRow): number => DEFAULT_FOCUS_ROWS.includes(row.id) ? DEFAULT_FOCUS_ROWS.indexOf(row.id) : 999;
    return rank(a) - rank(b) || (b.wallMs ?? -1) - (a.wallMs ?? -1) || a.id.localeCompare(b.id);
  });

  const gate = asRecord(input.gateJson);
  const summary = asRecord(gate?.summary);
  const failedGates = Array.isArray(gate?.gates)
    ? gate.gates.map(item => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item) && item.passed === false).map(item => String(item.key ?? 'unknown'))
    : stringArray(gate?.failedGates);
  const guardCandidates = rows.filter(row => row.safeRuntimeGuard === 'diagnostic_only');
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    baselineRunDir: input.baselineRunDir,
    candidateRunDir: input.candidateRunDir,
    gatePath: input.gatePath ?? null,
    gateSummary: {
      passed: typeof gate?.passed === 'boolean' ? gate.passed : null,
      failedGates,
      baselineP95WallMs: numberOrNull(summary?.baselineP95WallMs),
      candidateP95WallMs: numberOrNull(summary?.candidateP95WallMs),
      baselineAttemptCount: numberOrNull(summary?.baselineAttemptCount),
      candidateAttemptCount: numberOrNull(summary?.candidateAttemptCount),
      falsePositiveAppliedCount: numberOrNull(summary?.falsePositiveAppliedCount),
    },
    summary: {
      rowCount: rows.length,
      focusRows,
      classificationCounts: classificationCounts(rows),
      behaviorRecommendation: guardCandidates.length > 0 ? 'narrow_runtime_guard_candidate' : 'no_behavior_change',
      recommendedNextAction: guardCandidates.length > 0
        ? 'Collect targeted row/tool-state proof before implementing a suppression guard.'
        : 'Do not change behavior from this diagnostic; keep parked debt documented.',
    },
    rows,
  };
}

function mdTable(headers: string[], rows: string[][]): string[] {
  if (rows.length === 0) return ['None.'];
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(cell => cell.replace(/\|/g, '\\|')).join(' | ')} |`),
  ];
}

function toolSummaryCell(tools: RuntimeAttemptToolSummary[]): string {
  return tools.length === 0
    ? 'none'
    : tools.slice(0, 3).map(tool => `${tool.toolName}:${tool.outcome} x${tool.count} noGain:${tool.noGainCount} ${tool.totalMs}ms`).join('<br>');
}

export function renderRuntimeAttemptMarkdown(report: RuntimeAttemptDiagnosticReport): string {
  const lines: string[] = [];
  lines.push('# Runtime Tail And Attempt Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Baseline: \`${report.baselineRunDir}\``);
  lines.push(`Candidate: \`${report.candidateRunDir}\``);
  if (report.gatePath) lines.push(`Gate: \`${report.gatePath}\``);
  lines.push('');
  lines.push('## Summary', '');
  lines.push(`- Gate passed: \`${report.gateSummary.passed ?? 'unknown'}\``);
  lines.push(`- Failed gates: ${report.gateSummary.failedGates.map(key => `\`${key}\``).join(', ') || 'none'}`);
  lines.push(`- p95 wall: \`${Math.round(report.gateSummary.baselineP95WallMs ?? 0)} -> ${Math.round(report.gateSummary.candidateP95WallMs ?? 0)}ms\``);
  lines.push(`- attempts: \`${report.gateSummary.baselineAttemptCount ?? 'n/a'} -> ${report.gateSummary.candidateAttemptCount ?? 'n/a'}\``);
  lines.push(`- false_positive_applied: \`${report.gateSummary.falsePositiveAppliedCount ?? 'n/a'}\``);
  lines.push(`- behavior recommendation: \`${report.summary.behaviorRecommendation}\``);
  lines.push(`- next action: ${report.summary.recommendedNextAction}`, '');
  lines.push(...mdTable(
    ['Class', 'Count'],
    report.summary.classificationCounts.map(row => [row.key, String(row.count)]),
  ));
  lines.push('', '## Rows', '');
  lines.push(...mdTable(
    ['File', 'Class', 'Score', 'Wall', 'Attempts', 'Rejected/no-effect', 'Post-pass no-gain', 'Final drop', 'Guard', 'Reason'],
    report.rows.map(row => [
      row.id,
      row.classification,
      `${row.score ?? 'n/a'}/${row.grade ?? 'n/a'}`,
      `${Math.round(row.wallMs ?? 0)}ms`,
      String(row.attemptCount),
      String(row.rejectedOrNoEffectCount),
      `${row.postPassNoGainCount}/${row.postPassAttemptCount}`,
      String(row.finalReanalysisDrop ?? 'n/a'),
      row.safeRuntimeGuard,
      row.reason,
    ]),
  ));
  lines.push('', '## Repeated/No-Gain Tools', '');
  lines.push(...mdTable(
    ['File', 'Top repeated tools', 'Top no-gain tools'],
    report.rows.map(row => [row.id, toolSummaryCell(row.topRepeatedTools), toolSummaryCell(row.topNoGainTools)]),
  ));
  lines.push('');
  return lines.join('\n');
}

async function loadGate(path: string | null): Promise<unknown> {
  if (!path) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let baseline = DEFAULT_BASELINE;
  let candidate = DEFAULT_CANDIDATE;
  let gate: string | null = DEFAULT_GATE;
  let out = DEFAULT_OUT;
  let focus = DEFAULT_FOCUS_ROWS;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--baseline') baseline = args[++index] ?? '';
    else if (arg === '--candidate') candidate = args[++index] ?? '';
    else if (arg === '--gate') gate = args[++index] ?? null;
    else if (arg === '--out') out = args[++index] ?? '';
    else if (arg === '--focus') focus = (args[++index] ?? '').split(',').map(item => item.trim()).filter(Boolean);
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  if (!baseline || !candidate || !out) throw new Error(usage());
  const [baselineRows, candidateRows, gateJson] = await Promise.all([
    loadBenchmarkRowsFromRunDir(baseline),
    loadBenchmarkRowsFromRunDir(candidate),
    loadGate(gate),
  ]);
  const report = buildRuntimeAttemptDiagnostic({
    baselineRunDir: baseline,
    candidateRunDir: candidate,
    gatePath: gate,
    baselineRows: baselineRows.remediateResults,
    candidateRows: candidateRows.remediateResults,
    gateJson,
    focusRows: focus,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'runtime-tail-attempt-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'runtime-tail-attempt-diagnostic.md'), renderRuntimeAttemptMarkdown(report), 'utf8');
  console.log(`Wrote runtime tail/attempt diagnostic to ${outDir}`);
  console.log(`Recommendation: ${report.summary.behaviorRecommendation}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
