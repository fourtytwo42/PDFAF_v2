#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type CategoryScores = Record<string, number>;

interface ToolRow {
  toolName?: string;
  name?: string;
  outcome?: string;
  stage?: number;
  round?: number;
  source?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  details?: unknown;
}

interface FinalAdjustment {
  kind?: string;
  status?: string;
  reason?: string;
  evidenceCount?: number;
  sourceTool?: string | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
}

interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  file?: string;
  localFile?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: Array<{ key: string; score: number }>;
  appliedTools?: ToolRow[];
  finalAdjustments?: FinalAdjustment[];
}

interface RunData {
  label: string;
  runDir: string;
  rows: Map<string, BenchmarkRow>;
}

export type Stage54aDivergenceClass =
  | 'same_state_different_decision'
  | 'different_state_same_tool'
  | 'different_tool_sequence'
  | 'final_parity_only'
  | 'inconclusive_missing_state';

export interface Stage54aTimelineEntry {
  index: number;
  toolName: string;
  stage: number | null;
  round: number | null;
  source: string | null;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  categoryBefore: CategoryScores;
  categoryAfter: CategoryScores;
  note: string | null;
  invariants: Record<string, unknown>;
  structuralBenefits: Record<string, unknown>;
  targetRef: string | null;
  stateSignatureBefore: string | null;
}

export interface Stage54aPairReplay {
  baselineLabel: string;
  candidateLabel: string;
  baselineScore: number | null;
  candidateScore: number | null;
  firstDivergentIndex: number | null;
  divergenceClass: Stage54aDivergenceClass;
  reason: string;
  baselineEntry: Stage54aTimelineEntry | null;
  candidateEntry: Stage54aTimelineEntry | null;
  finalParity: {
    baseline: FinalAdjustment | null;
    candidate: FinalAdjustment | null;
  };
}

export interface Stage54aRowReplay {
  rowId: string;
  file: string | null;
  role: 'focus' | 'control';
  scoresByRun: Record<string, number | null>;
  pairReplays: Stage54aPairReplay[];
}

export interface Stage54aReport {
  generatedAt: string;
  runs: Array<{ label: string; runDir: string }>;
  focusIds: string[];
  controlIds: string[];
  rows: Stage54aRowReplay[];
  decision: {
    status: 'diagnostic_only' | 'same_state_fix_candidate' | 'ordering_fix_candidate';
    reasons: string[];
  };
}

const DEFAULT_RUNS = [
  ['stage50', 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage50-target-edge-mix-2026-04-24-r3'],
  ['stage52b-r2', 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage52b-target-edge-mix-2026-04-24-r2'],
  ['stage52b-r3', 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage52b-target-edge-mix-2026-04-24-r3'],
] as const;
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix/stage54a-edge-mix-replay-2026-04-24-r1';
const DEFAULT_FOCUS_IDS = ['v1-4683', 'v1-4139', 'v1-4567'];
const DEFAULT_CONTROL_IDS = ['v1-4215', 'v1-4122', 'v1-4751', 'v1-4627'];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage54a-edge-mix-replay.ts [options]',
    '  --run <label=run-dir>  Repeat to override default runs',
    `  --out <dir>            Default: ${DEFAULT_OUT}`,
    '  --id <row-id>          Repeat to override focus ids',
    '  --control <row-id>     Repeat to override control ids',
  ].join('\n');
}

function rowKey(row: BenchmarkRow): string {
  return String(row.id ?? row.publicationId ?? '');
}

async function loadRun(label: string, runDir: string): Promise<RunData> {
  const absolute = resolve(runDir);
  const raw = JSON.parse(await readFile(join(absolute, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown[] }).rows)
      ? (raw as { rows: BenchmarkRow[] }).rows
      : null;
  if (!rows) throw new Error(`No remediate rows found in ${absolute}`);
  return {
    label,
    runDir: absolute,
    rows: new Map((rows as BenchmarkRow[]).map(row => [rowKey(row), row]).filter(([key]) => key.length > 0)),
  };
}

function parseDetails(details: unknown): Record<string, unknown> {
  if (!details) return {};
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string') return {};
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { raw: details };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { raw: details };
  } catch {
    return { raw: details };
  }
}

function nestedRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function noteFromDetails(details: Record<string, unknown>): string | null {
  const note = details['note'];
  if (typeof note === 'string') return note;
  const raw = details['raw'];
  return typeof raw === 'string' ? raw : null;
}

function categoriesFromScore(score: number | null): CategoryScores {
  return typeof score === 'number' ? { overall: score } : {};
}

function normalizeCategorySnapshot(value: unknown): CategoryScores {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: CategoryScores = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
  }
  return out;
}

function stateSignatureFromDetails(details: Record<string, unknown>, scoreBefore: number | null): string | null {
  const debug = nestedRecord(details, 'debug');
  const replayState = nestedRecord(debug, 'replayState');
  const explicit = replayState['stateSignatureBefore']
    ?? debug['runtimeTailStateSignature']
    ?? debug['stateSignatureBefore']
    ?? debug['stateSignature'];
  if (typeof explicit === 'string' && explicit.trim()) return explicit;
  const beforeSnapshot = nestedRecord(debug, 'beforeSnapshot');
  const beforeCategories = normalizeCategorySnapshot(
    replayState['categoryScoresBefore']
      ?? debug['categoryBefore']
      ?? debug['categoriesBefore'],
  );
  const compact: Record<string, unknown> = {};
  const rootReachableHeadingCount = beforeSnapshot['rootReachableHeadingCount'] ?? beforeSnapshot['globalHeadingCount'];
  const checkerVisibleFigureCount = beforeSnapshot['checkerVisibleFigureCount'] ?? beforeSnapshot['checkerVisibleFigures'];
  const orphanCount = beforeSnapshot['orphanMcidCount'] ?? beforeSnapshot['orphanMcids'];
  if (rootReachableHeadingCount !== undefined) compact['rootReachableHeadingCount'] = rootReachableHeadingCount;
  if (checkerVisibleFigureCount !== undefined) compact['checkerVisibleFigureCount'] = checkerVisibleFigureCount;
  if (orphanCount !== undefined) compact['orphanMcidCount'] = orphanCount;
  if (Object.keys(beforeCategories).length > 0) compact['categories'] = beforeCategories;
  if (scoreBefore !== null) compact['scoreBefore'] = scoreBefore;
  return Object.keys(compact).length > 1 ? stableStringify(compact) : null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function timelineEntry(tool: ToolRow, index: number): Stage54aTimelineEntry {
  const details = parseDetails(tool.details);
  const invariants = nestedRecord(details, 'invariants');
  const structuralBenefits = nestedRecord(details, 'structuralBenefits');
  const debug = nestedRecord(details, 'debug');
  const replayState = nestedRecord(debug, 'replayState');
  const scoreBefore = typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null;
  const scoreAfter = typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null;
  const targetRef = [invariants['targetRef'], debug['targetRef']]
    .find((value): value is string => typeof value === 'string' && value.length > 0) ?? null;
  return {
    index,
    toolName: tool.toolName ?? tool.name ?? 'unknown',
    stage: typeof tool.stage === 'number' ? tool.stage : null,
    round: typeof tool.round === 'number' ? tool.round : null,
    source: typeof tool.source === 'string' ? tool.source : null,
    outcome: tool.outcome ?? 'unknown',
    scoreBefore,
    scoreAfter,
    categoryBefore: normalizeCategorySnapshot(
      replayState['categoryScoresBefore']
        ?? debug['categoryBefore']
        ?? debug['categoriesBefore'],
    ) || categoriesFromScore(scoreBefore),
    categoryAfter: normalizeCategorySnapshot(
      replayState['categoryScoresAfter']
        ?? debug['categoryAfter']
        ?? debug['categoriesAfter'],
    ) || categoriesFromScore(scoreAfter),
    note: noteFromDetails(details),
    invariants,
    structuralBenefits,
    targetRef,
    stateSignatureBefore: stateSignatureFromDetails(details, scoreBefore),
  };
}

function timeline(row?: BenchmarkRow): Stage54aTimelineEntry[] {
  return (row?.appliedTools ?? []).map((tool, index) => timelineEntry(tool, index));
}

function comparableEntry(entry: Stage54aTimelineEntry | undefined): string {
  if (!entry) return 'missing';
  return stableStringify({
    toolName: entry.toolName,
    stage: entry.stage,
    round: entry.round,
    source: entry.source,
    outcome: entry.outcome,
    note: entry.note,
    targetRef: entry.targetRef,
  });
}

function firstDivergence(
  baselineTimeline: Stage54aTimelineEntry[],
  candidateTimeline: Stage54aTimelineEntry[],
): { index: number | null; baseline: Stage54aTimelineEntry | null; candidate: Stage54aTimelineEntry | null } {
  const max = Math.max(baselineTimeline.length, candidateTimeline.length);
  for (let index = 0; index < max; index += 1) {
    const baseline = baselineTimeline[index];
    const candidate = candidateTimeline[index];
    if (comparableEntry(baseline) !== comparableEntry(candidate)) {
      return { index, baseline: baseline ?? null, candidate: candidate ?? null };
    }
  }
  return { index: null, baseline: null, candidate: null };
}

function finalParity(row?: BenchmarkRow): FinalAdjustment | null {
  return row?.finalAdjustments?.find(adjustment => adjustment.kind === 'final_hidden_heading_parity') ?? null;
}

function finalParityKey(row?: BenchmarkRow): string {
  const adjustment = finalParity(row);
  if (!adjustment) return 'missing';
  return stableStringify({
    status: adjustment.status ?? null,
    reason: adjustment.reason ?? null,
    evidenceCount: adjustment.evidenceCount ?? null,
    scoreBefore: adjustment.scoreBefore ?? null,
    scoreAfter: adjustment.scoreAfter ?? null,
  });
}

export function classifyReplayDivergence(input: {
  baseline?: Stage54aTimelineEntry | null;
  candidate?: Stage54aTimelineEntry | null;
  baselineFinalParity?: string;
  candidateFinalParity?: string;
  scoreDelta?: number | null;
}): { divergenceClass: Stage54aDivergenceClass; reason: string } {
  const baseline = input.baseline ?? null;
  const candidate = input.candidate ?? null;
  if (!baseline && !candidate) {
    if ((input.baselineFinalParity ?? 'missing') !== (input.candidateFinalParity ?? 'missing')) {
      return { divergenceClass: 'final_parity_only', reason: 'tool_timeline_equal_final_parity_differs' };
    }
    return { divergenceClass: 'final_parity_only', reason: 'no_tool_divergence_detected' };
  }
  if (!baseline || !candidate) {
    return { divergenceClass: 'different_tool_sequence', reason: 'tool_present_in_only_one_run' };
  }
  if (baseline.stateSignatureBefore && candidate.stateSignatureBefore && baseline.stateSignatureBefore === candidate.stateSignatureBefore) {
    if (baseline.toolName === candidate.toolName && baseline.outcome !== candidate.outcome) {
      return { divergenceClass: 'same_state_different_decision', reason: 'same_state_same_tool_different_outcome' };
    }
    if (baseline.toolName !== candidate.toolName) {
      return { divergenceClass: 'different_tool_sequence', reason: 'same_state_different_next_tool' };
    }
  }
  if (baseline.toolName === candidate.toolName && baseline.stateSignatureBefore && candidate.stateSignatureBefore && baseline.stateSignatureBefore !== candidate.stateSignatureBefore) {
    return { divergenceClass: 'different_state_same_tool', reason: 'same_tool_different_state_signature' };
  }
  if (!baseline.stateSignatureBefore || !candidate.stateSignatureBefore) {
    return { divergenceClass: 'inconclusive_missing_state', reason: 'state_signature_missing' };
  }
  return { divergenceClass: 'different_tool_sequence', reason: 'different_tool_or_target_sequence' };
}

function compareRows(
  baselineRun: RunData,
  candidateRun: RunData,
  rowId: string,
): Stage54aPairReplay {
  const baseline = baselineRun.rows.get(rowId);
  const candidate = candidateRun.rows.get(rowId);
  const baselineTimeline = timeline(baseline);
  const candidateTimeline = timeline(candidate);
  const divergence = firstDivergence(baselineTimeline, candidateTimeline);
  const scoreDelta = typeof baseline?.afterScore === 'number' && typeof candidate?.afterScore === 'number'
    ? candidate.afterScore - baseline.afterScore
    : null;
  const classified = classifyReplayDivergence({
    baseline: divergence.baseline,
    candidate: divergence.candidate,
    baselineFinalParity: finalParityKey(baseline),
    candidateFinalParity: finalParityKey(candidate),
    scoreDelta,
  });
  return {
    baselineLabel: baselineRun.label,
    candidateLabel: candidateRun.label,
    baselineScore: baseline?.afterScore ?? null,
    candidateScore: candidate?.afterScore ?? null,
    firstDivergentIndex: divergence.index,
    divergenceClass: classified.divergenceClass,
    reason: classified.reason,
    baselineEntry: divergence.baseline,
    candidateEntry: divergence.candidate,
    finalParity: {
      baseline: finalParity(baseline),
      candidate: finalParity(candidate),
    },
  };
}

function comparisonPairs(runs: RunData[]): Array<[RunData, RunData]> {
  if (runs.length < 2) return [];
  const out: Array<[RunData, RunData]> = [];
  for (let index = 1; index < runs.length; index += 1) out.push([runs[0]!, runs[index]!]);
  for (let index = 1; index < runs.length - 1; index += 1) out.push([runs[index]!, runs[index + 1]!]);
  return out;
}

export function buildStage54aReport(input: {
  runs: RunData[];
  focusIds?: string[];
  controlIds?: string[];
  generatedAt?: string;
}): Stage54aReport {
  const focusIds = input.focusIds ?? DEFAULT_FOCUS_IDS;
  const controlIds = input.controlIds ?? DEFAULT_CONTROL_IDS;
  const ids = [...new Set([...focusIds, ...controlIds])];
  const pairs = comparisonPairs(input.runs);
  const rows = ids.map(rowId => {
    const firstRow = input.runs.find(run => run.rows.has(rowId))?.rows.get(rowId);
    return {
      rowId,
      file: firstRow?.file ?? firstRow?.localFile ?? null,
      role: focusIds.includes(rowId) ? 'focus' as const : 'control' as const,
      scoresByRun: Object.fromEntries(input.runs.map(run => [run.label, run.rows.get(rowId)?.afterScore ?? null])),
      pairReplays: pairs.map(([baseline, candidate]) => compareRows(baseline, candidate, rowId)),
    };
  });
  const allPairs = rows.flatMap(row => row.pairReplays);
  const sameState = allPairs.filter(pair => pair.divergenceClass === 'same_state_different_decision');
  const ordering = allPairs.filter(pair => pair.divergenceClass === 'different_tool_sequence' && pair.reason === 'same_state_different_next_tool');
  const status = sameState.length > 0
    ? 'same_state_fix_candidate'
    : ordering.length > 0
      ? 'ordering_fix_candidate'
      : 'diagnostic_only';
  const reasons = status === 'diagnostic_only'
    ? ['no same-state decision or same-state ordering bug found; first divergences are different upstream paths or missing state signatures']
    : status === 'same_state_fix_candidate'
      ? [`${sameState.length} same-state different-decision divergence(s) found`]
      : [`${ordering.length} same-state next-tool ordering divergence(s) found`];
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runs: input.runs.map(run => ({ label: run.label, runDir: run.runDir })),
    focusIds,
    controlIds,
    rows,
    decision: { status, reasons },
  };
}

function renderEntry(entry: Stage54aTimelineEntry | null): string {
  if (!entry) return 'missing';
  return [
    `${entry.toolName}/${entry.outcome}`,
    `stage=${entry.stage ?? 'n/a'}`,
    `round=${entry.round ?? 'n/a'}`,
    `source=${entry.source ?? 'n/a'}`,
    `score=${entry.scoreBefore ?? 'n/a'}->${entry.scoreAfter ?? 'n/a'}`,
    entry.note ? `note=${entry.note}` : null,
    entry.targetRef ? `target=${entry.targetRef}` : null,
    entry.stateSignatureBefore ? `state=${entry.stateSignatureBefore}` : 'state=missing',
  ].filter(Boolean).join(' ');
}

function markdown(report: Stage54aReport): string {
  const lines = ['# Stage 54A Edge-Mix Mutator Path Replay', ''];
  lines.push(`Decision: **${report.decision.status}**`);
  lines.push(`Reasons: ${report.decision.reasons.join('; ')}`, '');
  lines.push('Runs:');
  for (const run of report.runs) lines.push(`- ${run.label}: \`${run.runDir}\``);
  lines.push('');
  lines.push('| row | role | scores | first classes |');
  lines.push('| --- | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push(`| ${row.rowId} | ${row.role} | ${JSON.stringify(row.scoresByRun)} | ${row.pairReplays.map(pair => `${pair.baselineLabel}->${pair.candidateLabel}:${pair.divergenceClass}`).join(', ')} |`);
  }
  lines.push('');
  for (const row of report.rows) {
    lines.push(`## ${row.rowId}`, '');
    lines.push(`- File: ${row.file ?? 'n/a'}`);
    for (const pair of row.pairReplays) {
      lines.push(`- ${pair.baselineLabel} -> ${pair.candidateLabel}: ${pair.baselineScore ?? 'n/a'} -> ${pair.candidateScore ?? 'n/a'}; class=${pair.divergenceClass}; reason=${pair.reason}; index=${pair.firstDivergentIndex ?? 'n/a'}`);
      lines.push(`  - baseline: ${renderEntry(pair.baselineEntry)}`);
      lines.push(`  - candidate: ${renderEntry(pair.candidateEntry)}`);
      lines.push(`  - final parity: \`${JSON.stringify(pair.finalParity)}\``);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv: string[]): {
  runs: Array<[string, string]>;
  outDir: string;
  focusIds: string[];
  controlIds: string[];
} {
  const runs: Array<[string, string]> = [];
  let outDir = DEFAULT_OUT;
  const focusIds: string[] = [];
  const controlIds: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--run') {
      const value = argv[++index];
      if (!value || !value.includes('=')) throw new Error('Expected --run <label=run-dir>');
      const splitIndex = value.indexOf('=');
      runs.push([value.slice(0, splitIndex), value.slice(splitIndex + 1)]);
    } else if (arg === '--out') {
      outDir = argv[++index] ?? outDir;
    } else if (arg === '--id') {
      const id = argv[++index];
      if (id) focusIds.push(id);
    } else if (arg === '--control') {
      const id = argv[++index];
      if (id) controlIds.push(id);
    } else if (arg === '--help' || arg === '-h') {
      throw new Error(usage());
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  return {
    runs: runs.length > 0 ? runs : DEFAULT_RUNS.map(([label, runDir]) => [label, runDir]),
    outDir,
    focusIds: focusIds.length > 0 ? focusIds : [...DEFAULT_FOCUS_IDS],
    controlIds: controlIds.length > 0 ? controlIds : [...DEFAULT_CONTROL_IDS],
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const runs = await Promise.all(args.runs.map(([label, runDir]) => loadRun(label, runDir)));
  const report = buildStage54aReport({
    runs,
    focusIds: args.focusIds,
    controlIds: args.controlIds,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage54a-edge-mix-replay.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.outDir, 'stage54a-edge-mix-replay.md'), markdown(report), 'utf8');
  console.log(`Wrote Stage 54A edge-mix replay report to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
