#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;
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
  details?: unknown;
}

interface FinalAdjustment {
  kind?: string;
  status?: string;
  reason?: string;
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
  appliedTools?: ToolRow[];
  finalAdjustments?: FinalAdjustment[];
}

interface RunData {
  label: string;
  runDir: string;
  rows: Map<string, BenchmarkRow>;
}

export type Stage54cDivergenceClass =
  | 'same_state_different_decision'
  | 'same_state_different_next_tool'
  | 'different_upstream_state'
  | 'different_tool_sequence'
  | 'final_parity_only'
  | 'inconclusive_missing_replay_state';

export interface Stage54cTimelineEntry {
  index: number;
  toolName: string;
  outcome: string;
  stage: number | null;
  round: number | null;
  source: string | null;
  note: string | null;
  targetRef: string | null;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  categoryScoresBefore: CategoryScores;
  categoryScoresAfter: CategoryScores;
  detectionSignalsBefore: JsonRecord;
  detectionSignalsAfter: JsonRecord;
}

export interface Stage54cPairSummary {
  baselineLabel: string;
  candidateLabel: string;
  baselineScore: number | null;
  candidateScore: number | null;
  firstDivergentIndex: number | null;
  divergenceClass: Stage54cDivergenceClass;
  divergenceFamily: string;
  reason: string;
  baselineEntry: Stage54cTimelineEntry | null;
  candidateEntry: Stage54cTimelineEntry | null;
  categoryBeforeDelta: Record<string, { baseline: number | null; candidate: number | null; delta: number | null }>;
  detectionBeforeDelta: Record<string, { baseline: unknown; candidate: unknown }>;
  finalParity: { baseline: FinalAdjustment | null; candidate: FinalAdjustment | null };
}

export interface Stage54cRowSummary {
  rowId: string;
  file: string | null;
  role: 'focus' | 'control';
  scoresByRun: Record<string, number | null>;
  pairSummaries: Stage54cPairSummary[];
}

export interface Stage54cReport {
  generatedAt: string;
  runs: Array<{ label: string; runDir: string }>;
  focusIds: string[];
  controlIds: string[];
  rows: Stage54cRowSummary[];
  decision: {
    status: 'diagnostic_only' | 'acceptance_determinism_fix_candidate' | 'stable_tiebreak_fix_candidate' | 'move_to_real_fixer';
    recommendedNext: string;
    reasons: string[];
  };
}

const DEFAULT_RUNS = [
  ['stage54b-r1', 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage54b-edge-mix-r1'],
  ['stage54b-r2', 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage54b-edge-mix-r2'],
  ['stage54c-r3', 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage54c-edge-mix-r3'],
] as const;
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix/stage54c-instrumented-replay-2026-04-24-r1';
const DEFAULT_FOCUS_IDS = ['v1-4683', 'v1-4139', 'v1-4567'];
const DEFAULT_CONTROL_IDS = ['v1-4215', 'v1-4122', 'v1-4751', 'v1-4627'];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage54c-instrumented-replay-summary.ts [options]',
    '  --run <label=run-dir>  Repeat to override default fully instrumented runs',
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

function parseDetails(details: unknown): JsonRecord {
  if (!details) return {};
  if (typeof details === 'object' && !Array.isArray(details)) return details as JsonRecord;
  if (typeof details !== 'string') return {};
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { raw: details };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : { raw: details };
  } catch {
    return { raw: details };
  }
}

function nestedRecord(parent: JsonRecord, key: string): JsonRecord {
  const value = parent[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function numberRecord(value: unknown): CategoryScores {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: CategoryScores = {};
  for (const [key, raw] of Object.entries(value as JsonRecord)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
  }
  return out;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as JsonRecord;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function noteFromDetails(details: JsonRecord): string | null {
  const note = details['note'];
  if (typeof note === 'string') return note;
  const raw = details['raw'];
  return typeof raw === 'string' ? raw : null;
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
    scoreBefore: adjustment.scoreBefore ?? null,
    scoreAfter: adjustment.scoreAfter ?? null,
  });
}

function timelineEntry(tool: ToolRow, index: number): Stage54cTimelineEntry {
  const details = parseDetails(tool.details);
  const invariants = nestedRecord(details, 'invariants');
  const debug = nestedRecord(details, 'debug');
  const replayState = nestedRecord(debug, 'replayState');
  const targetRef = [invariants['targetRef'], debug['targetRef'], replayState['targetRef']]
    .find((value): value is string => typeof value === 'string' && value.length > 0) ?? null;
  return {
    index,
    toolName: tool.toolName ?? tool.name ?? 'unknown',
    outcome: tool.outcome ?? 'unknown',
    stage: typeof tool.stage === 'number' ? tool.stage : null,
    round: typeof tool.round === 'number' ? tool.round : null,
    source: typeof tool.source === 'string' ? tool.source : null,
    note: noteFromDetails(details),
    targetRef,
    stateSignatureBefore: typeof replayState['stateSignatureBefore'] === 'string' ? replayState['stateSignatureBefore'] : null,
    stateSignatureAfter: typeof replayState['stateSignatureAfter'] === 'string' ? replayState['stateSignatureAfter'] : null,
    scoreBefore: typeof replayState['scoreBefore'] === 'number'
      ? replayState['scoreBefore']
      : typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
    scoreAfter: typeof replayState['scoreAfter'] === 'number'
      ? replayState['scoreAfter']
      : typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
    categoryScoresBefore: numberRecord(replayState['categoryScoresBefore']),
    categoryScoresAfter: numberRecord(replayState['categoryScoresAfter']),
    detectionSignalsBefore: nestedRecord(replayState, 'detectionSignalsBefore'),
    detectionSignalsAfter: nestedRecord(replayState, 'detectionSignalsAfter'),
  };
}

function timeline(row?: BenchmarkRow): Stage54cTimelineEntry[] {
  return (row?.appliedTools ?? []).map((tool, index) => timelineEntry(tool, index));
}

function comparableEntry(entry: Stage54cTimelineEntry | undefined): string {
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
  baselineTimeline: Stage54cTimelineEntry[],
  candidateTimeline: Stage54cTimelineEntry[],
): { index: number | null; baseline: Stage54cTimelineEntry | null; candidate: Stage54cTimelineEntry | null } {
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

function categoryDelta(
  baseline: Stage54cTimelineEntry | null,
  candidate: Stage54cTimelineEntry | null,
): Stage54cPairSummary['categoryBeforeDelta'] {
  const keys = new Set([
    ...Object.keys(baseline?.categoryScoresBefore ?? {}),
    ...Object.keys(candidate?.categoryScoresBefore ?? {}),
  ]);
  const out: Stage54cPairSummary['categoryBeforeDelta'] = {};
  for (const key of keys) {
    const left = baseline?.categoryScoresBefore[key] ?? null;
    const right = candidate?.categoryScoresBefore[key] ?? null;
    out[key] = { baseline: left, candidate: right, delta: left != null && right != null ? right - left : null };
  }
  return out;
}

function detectionDelta(
  baseline: Stage54cTimelineEntry | null,
  candidate: Stage54cTimelineEntry | null,
): Stage54cPairSummary['detectionBeforeDelta'] {
  const keys = new Set([
    ...Object.keys(baseline?.detectionSignalsBefore ?? {}),
    ...Object.keys(candidate?.detectionSignalsBefore ?? {}),
  ]);
  const out: Stage54cPairSummary['detectionBeforeDelta'] = {};
  for (const key of keys) {
    const left = baseline?.detectionSignalsBefore[key];
    const right = candidate?.detectionSignalsBefore[key];
    if (stableStringify(left) !== stableStringify(right)) out[key] = { baseline: left ?? null, candidate: right ?? null };
  }
  return out;
}

function divergenceFamily(entry: Stage54cTimelineEntry | null): string {
  if (!entry) return 'tool_sequence';
  if (entry.toolName === 'set_document_language' || entry.toolName === 'set_document_title' || entry.toolName === 'set_pdfua_identification') return 'metadata';
  if (entry.toolName.includes('heading') || entry.toolName === 'repair_structure_conformance' || entry.toolName === 'synthesize_basic_structure_from_layout') return 'heading';
  if (entry.toolName === 'remap_orphan_mcids_as_artifacts' || entry.toolName === 'mark_untagged_content_as_artifact' || entry.toolName === 'artifact_repeating_page_furniture') return 'orphan_artifact';
  if (entry.toolName.includes('figure') || entry.toolName === 'repair_alt_text_structure') return 'figure_alt';
  if (entry.toolName.includes('table')) return 'table';
  return 'other';
}

export function classifyStage54cDivergence(input: {
  baseline: Stage54cTimelineEntry | null;
  candidate: Stage54cTimelineEntry | null;
  baselineFinalParity?: string;
  candidateFinalParity?: string;
}): { divergenceClass: Stage54cDivergenceClass; reason: string } {
  const { baseline, candidate } = input;
  if (!baseline && !candidate) {
    if ((input.baselineFinalParity ?? 'missing') !== (input.candidateFinalParity ?? 'missing')) {
      return { divergenceClass: 'final_parity_only', reason: 'tool_timeline_equal_final_parity_differs' };
    }
    return { divergenceClass: 'final_parity_only', reason: 'no_tool_divergence_detected' };
  }
  if (!baseline || !candidate) return { divergenceClass: 'different_tool_sequence', reason: 'tool_present_in_only_one_run' };
  if (!baseline.stateSignatureBefore || !candidate.stateSignatureBefore) {
    return { divergenceClass: 'inconclusive_missing_replay_state', reason: 'replay_state_signature_missing' };
  }
  if (baseline.stateSignatureBefore === candidate.stateSignatureBefore) {
    if (baseline.toolName === candidate.toolName && baseline.outcome !== candidate.outcome) {
      return { divergenceClass: 'same_state_different_decision', reason: 'same_state_same_tool_different_outcome' };
    }
    if (baseline.toolName !== candidate.toolName) {
      return { divergenceClass: 'same_state_different_next_tool', reason: 'same_state_different_next_tool' };
    }
  }
  if (baseline.toolName === candidate.toolName && baseline.stateSignatureBefore !== candidate.stateSignatureBefore) {
    return { divergenceClass: 'different_upstream_state', reason: 'same_tool_different_state_signature' };
  }
  return { divergenceClass: 'different_tool_sequence', reason: 'different_tool_or_target_sequence' };
}

function compareRows(baselineRun: RunData, candidateRun: RunData, rowId: string): Stage54cPairSummary {
  const baseline = baselineRun.rows.get(rowId);
  const candidate = candidateRun.rows.get(rowId);
  const divergence = firstDivergence(timeline(baseline), timeline(candidate));
  const classified = classifyStage54cDivergence({
    baseline: divergence.baseline,
    candidate: divergence.candidate,
    baselineFinalParity: finalParityKey(baseline),
    candidateFinalParity: finalParityKey(candidate),
  });
  return {
    baselineLabel: baselineRun.label,
    candidateLabel: candidateRun.label,
    baselineScore: baseline?.afterScore ?? null,
    candidateScore: candidate?.afterScore ?? null,
    firstDivergentIndex: divergence.index,
    divergenceClass: classified.divergenceClass,
    divergenceFamily: classified.divergenceClass === 'final_parity_only'
      ? 'final_parity'
      : divergenceFamily(divergence.candidate ?? divergence.baseline),
    reason: classified.reason,
    baselineEntry: divergence.baseline,
    candidateEntry: divergence.candidate,
    categoryBeforeDelta: categoryDelta(divergence.baseline, divergence.candidate),
    detectionBeforeDelta: detectionDelta(divergence.baseline, divergence.candidate),
    finalParity: { baseline: finalParity(baseline), candidate: finalParity(candidate) },
  };
}

function comparisonPairs(runs: RunData[]): Array<[RunData, RunData]> {
  const out: Array<[RunData, RunData]> = [];
  for (let index = 0; index < runs.length - 1; index += 1) out.push([runs[index]!, runs[index + 1]!]);
  if (runs.length > 2) out.push([runs[0]!, runs[runs.length - 1]!]);
  return out;
}

export function buildStage54cReport(input: {
  runs: RunData[];
  focusIds?: string[];
  controlIds?: string[];
  generatedAt?: string;
}): Stage54cReport {
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
      pairSummaries: pairs.map(([baseline, candidate]) => compareRows(baseline, candidate, rowId)),
    };
  });
  const focusPairs = rows.filter(row => row.role === 'focus').flatMap(row => row.pairSummaries);
  const sameStateDecision = focusPairs.filter(pair => pair.divergenceClass === 'same_state_different_decision');
  const sameStateOrder = focusPairs.filter(pair => pair.divergenceClass === 'same_state_different_next_tool');
  const missingReplay = focusPairs.filter(pair => pair.divergenceClass === 'inconclusive_missing_replay_state');
  const status = sameStateDecision.length > 0
    ? 'acceptance_determinism_fix_candidate'
    : sameStateOrder.length > 0
      ? 'stable_tiebreak_fix_candidate'
      : missingReplay.length > 0
        ? 'diagnostic_only'
        : 'move_to_real_fixer';
  const recommendedNext = status === 'acceptance_determinism_fix_candidate'
    ? 'Stage 55 should fix same-state acceptance determinism only.'
    : status === 'stable_tiebreak_fix_candidate'
      ? 'Stage 55 should add stable candidate tie-breaking only.'
      : status === 'move_to_real_fixer'
        ? 'Stage 55 should stop guard work and implement a narrow real fixer, preferably v1-4683 mixed figure/table/alt tail.'
        : 'Collect complete replay state before behavior changes.';
  const reasons = status === 'move_to_real_fixer'
    ? ['fully instrumented focus rows show no same-state decision or ordering bug']
    : status === 'diagnostic_only'
      ? [`${missingReplay.length} focus pair(s) still lack replay state`]
      : status === 'acceptance_determinism_fix_candidate'
        ? [`${sameStateDecision.length} focus same-state decision divergence(s) found`]
        : [`${sameStateOrder.length} focus same-state next-tool divergence(s) found`];
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runs: input.runs.map(run => ({ label: run.label, runDir: run.runDir })),
    focusIds,
    controlIds,
    rows,
    decision: { status, recommendedNext, reasons },
  };
}

function renderEntry(entry: Stage54cTimelineEntry | null): string {
  if (!entry) return 'missing';
  return [
    `${entry.toolName}/${entry.outcome}`,
    `stage=${entry.stage ?? 'n/a'}`,
    `round=${entry.round ?? 'n/a'}`,
    `score=${entry.scoreBefore ?? 'n/a'}->${entry.scoreAfter ?? 'n/a'}`,
    entry.note ? `note=${entry.note}` : null,
    entry.targetRef ? `target=${entry.targetRef}` : null,
    entry.stateSignatureBefore ? `before=${entry.stateSignatureBefore}` : 'before=missing',
    entry.stateSignatureAfter ? `after=${entry.stateSignatureAfter}` : 'after=missing',
  ].filter(Boolean).join(' ');
}

function markdown(report: Stage54cReport): string {
  const lines = ['# Stage 54C Fully Instrumented Repeat Replay', ''];
  lines.push(`Decision: **${report.decision.status}**`);
  lines.push(`Recommended next: ${report.decision.recommendedNext}`);
  lines.push(`Reasons: ${report.decision.reasons.join('; ')}`, '');
  lines.push('Runs:');
  for (const run of report.runs) lines.push(`- ${run.label}: \`${run.runDir}\``);
  lines.push('', '| row | role | scores | first classes |', '| --- | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push(`| ${row.rowId} | ${row.role} | ${JSON.stringify(row.scoresByRun)} | ${row.pairSummaries.map(pair => `${pair.baselineLabel}->${pair.candidateLabel}:${pair.divergenceClass}/${pair.divergenceFamily}`).join(', ')} |`);
  }
  lines.push('');
  for (const row of report.rows) {
    lines.push(`## ${row.rowId}`, '', `- File: ${row.file ?? 'n/a'}`);
    for (const pair of row.pairSummaries) {
      lines.push(`- ${pair.baselineLabel} -> ${pair.candidateLabel}: ${pair.baselineScore ?? 'n/a'} -> ${pair.candidateScore ?? 'n/a'}; class=${pair.divergenceClass}; family=${pair.divergenceFamily}; reason=${pair.reason}; index=${pair.firstDivergentIndex ?? 'n/a'}`);
      lines.push(`  - baseline: ${renderEntry(pair.baselineEntry)}`);
      lines.push(`  - candidate: ${renderEntry(pair.candidateEntry)}`);
      lines.push(`  - category-before delta: \`${JSON.stringify(pair.categoryBeforeDelta)}\``);
      lines.push(`  - detection-before delta: \`${JSON.stringify(pair.detectionBeforeDelta)}\``);
      lines.push(`  - final parity: \`${JSON.stringify(pair.finalParity)}\``);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv: string[]): { runs: Array<[string, string]>; outDir: string; focusIds: string[]; controlIds: string[] } {
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
  const report = buildStage54cReport({ runs, focusIds: args.focusIds, controlIds: args.controlIds });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage54c-instrumented-replay.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.outDir, 'stage54c-instrumented-replay.md'), markdown(report), 'utf8');
  console.log(`Wrote Stage 54C instrumented replay report to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
  console.log(report.decision.recommendedNext);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
