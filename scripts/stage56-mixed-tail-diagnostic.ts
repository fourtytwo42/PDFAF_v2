#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;
type NumberRecord = Record<string, number>;

interface CategoryRow {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface ToolRow {
  toolName?: string;
  name?: string;
  outcome?: string;
  stage?: number;
  round?: number;
  source?: string;
  details?: unknown;
}

interface FinalAdjustment {
  kind?: string;
  status?: string;
  reason?: string;
}

interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  file?: string;
  localFile?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: CategoryRow[];
  afterDetectionProfile?: JsonRecord;
  afterScoreCapsApplied?: unknown[];
  appliedTools?: ToolRow[];
  finalAdjustments?: FinalAdjustment[];
}

interface RunData {
  label: string;
  runDir: string;
  rows: Map<string, BenchmarkRow>;
}

export type Stage56Classification =
  | 'initial_analysis_variance'
  | 'deterministic_candidate_ordering_drift'
  | 'same_state_acceptance_drift'
  | 'figure_alt_ownership_debt'
  | 'table_structure_debt'
  | 'mixed_unresolved_structural_debt'
  | 'final_parity_only'
  | 'no_divergence'
  | 'inconclusive_missing_replay_state';

export interface Stage56TimelineEntry {
  index: number;
  toolName: string;
  outcome: string;
  stage: number | null;
  round: number | null;
  source: string | null;
  note: string | null;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  categoryScoresBefore: NumberRecord;
  categoryScoresAfter: NumberRecord;
  detectionSignalsBefore: JsonRecord;
  detectionSignalsAfter: JsonRecord;
}

export interface Stage56PairSummary {
  baselineLabel: string;
  candidateLabel: string;
  baselineScore: number | null;
  candidateScore: number | null;
  firstDivergentIndex: number | null;
  classification: Stage56Classification;
  structuralFamily: string;
  reason: string;
  baselineEntry: Stage56TimelineEntry | null;
  candidateEntry: Stage56TimelineEntry | null;
  categoryBeforeDelta: Record<string, { baseline: number | null; candidate: number | null; delta: number | null }>;
  signalBeforeDelta: Record<string, { baseline: unknown; candidate: unknown }>;
  finalParityChanged: boolean;
}

export interface Stage56RowSummary {
  rowId: string;
  role: 'focus' | 'control';
  file: string | null;
  scoresByRun: Record<string, number | null>;
  gradesByRun: Record<string, string | null>;
  finalCategoriesByRun: Record<string, NumberRecord>;
  finalResidualFamiliesByRun: Record<string, string[]>;
  pairSummaries: Stage56PairSummary[];
}

export interface Stage56Report {
  generatedAt: string;
  runs: Array<{ label: string; runDir: string }>;
  focusIds: string[];
  controlIds: string[];
  rows: Stage56RowSummary[];
  decision: {
    status: 'diagnostic_only' | 'analysis_determinism_candidate' | 'candidate_ordering_candidate' | 'acceptance_determinism_candidate' | 'figure_alt_fixer_candidate' | 'table_fixer_candidate' | 'mixed_tail_fixer_candidate';
    recommendedNext: string;
    reasons: string[];
  };
}

const DEFAULT_RUNS = [
  ['stage55-r6', 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage55-edge-mix-r6'],
  ['stage55-r7', 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage55-edge-mix-r7'],
] as const;
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix/stage56-mixed-tail-diagnostic-2026-04-24-r1';
const DEFAULT_FOCUS_IDS = ['v1-4683', 'v1-4139', 'v1-4567'];
const DEFAULT_CONTROL_IDS = ['v1-4215', 'v1-4122', 'v1-4751', 'v1-4627'];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage56-mixed-tail-diagnostic.ts [options]',
    '  --run <label=run-dir>  Repeat to override default Stage 55 repeats',
    `  --out <dir>            Default: ${DEFAULT_OUT}`,
    '  --id <row-id>          Repeat to override focus ids',
    '  --control <row-id>     Repeat to override control ids',
  ].join('\n');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as JsonRecord;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function rowKey(row: BenchmarkRow): string {
  return String(row.id ?? row.publicationId ?? '');
}

async function loadRun(label: string, runDir: string): Promise<RunData> {
  const absolute = resolve(runDir);
  const raw = JSON.parse(await readFile(join(absolute, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(raw)
    ? raw as BenchmarkRow[]
    : raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown[] }).rows)
      ? (raw as { rows: BenchmarkRow[] }).rows
      : null;
  if (!rows) throw new Error(`No remediate rows found in ${absolute}`);
  return {
    label,
    runDir: absolute,
    rows: new Map(rows.map(row => [rowKey(row), row]).filter(([key]) => key.length > 0)),
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

function numberRecord(value: unknown): NumberRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: NumberRecord = {};
  for (const [key, raw] of Object.entries(value as JsonRecord)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
  }
  return out;
}

function noteFromDetails(details: JsonRecord): string | null {
  const note = details['note'];
  if (typeof note === 'string') return note;
  const raw = details['raw'];
  return typeof raw === 'string' ? raw : null;
}

function timelineEntry(tool: ToolRow, index: number): Stage56TimelineEntry {
  const details = parseDetails(tool.details);
  const debug = nestedRecord(details, 'debug');
  const replayState = nestedRecord(debug, 'replayState');
  return {
    index,
    toolName: tool.toolName ?? tool.name ?? 'unknown',
    outcome: tool.outcome ?? 'unknown',
    stage: typeof tool.stage === 'number' ? tool.stage : null,
    round: typeof tool.round === 'number' ? tool.round : null,
    source: typeof tool.source === 'string' ? tool.source : null,
    note: noteFromDetails(details),
    stateSignatureBefore: typeof replayState['stateSignatureBefore'] === 'string' ? replayState['stateSignatureBefore'] : null,
    stateSignatureAfter: typeof replayState['stateSignatureAfter'] === 'string' ? replayState['stateSignatureAfter'] : null,
    categoryScoresBefore: numberRecord(replayState['categoryScoresBefore']),
    categoryScoresAfter: numberRecord(replayState['categoryScoresAfter']),
    detectionSignalsBefore: nestedRecord(replayState, 'detectionSignalsBefore'),
    detectionSignalsAfter: nestedRecord(replayState, 'detectionSignalsAfter'),
  };
}

function timeline(row?: BenchmarkRow): Stage56TimelineEntry[] {
  return (row?.appliedTools ?? []).map((tool, index) => timelineEntry(tool, index));
}

function comparableEntry(entry: Stage56TimelineEntry | undefined): string {
  if (!entry) return 'missing';
  return stableStringify({
    toolName: entry.toolName,
    outcome: entry.outcome,
    stage: entry.stage,
    round: entry.round,
    source: entry.source,
    note: entry.note,
    stateSignatureBefore: entry.stateSignatureBefore,
  });
}

function firstDivergence(
  baselineTimeline: Stage56TimelineEntry[],
  candidateTimeline: Stage56TimelineEntry[],
): { index: number | null; baseline: Stage56TimelineEntry | null; candidate: Stage56TimelineEntry | null } {
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

function finalParityKey(row?: BenchmarkRow): string {
  const adjustment = row?.finalAdjustments?.find(item => item.kind === 'final_hidden_heading_parity');
  return stableStringify(adjustment ?? null);
}

function categoryMap(row?: BenchmarkRow): NumberRecord {
  const out: NumberRecord = {};
  for (const item of row?.afterCategories ?? []) {
    if (typeof item.key === 'string' && typeof item.score === 'number' && Number.isFinite(item.score)) {
      out[item.key] = item.score;
    }
  }
  return out;
}

function compactFinalSignals(row?: BenchmarkRow): JsonRecord {
  const profile = row?.afterDetectionProfile ?? {};
  return {
    ...nestedRecord(profile, 'headingSignals'),
    ...nestedRecord(profile, 'figureSignals'),
    ...nestedRecord(profile, 'tableSignals'),
    ...nestedRecord(profile, 'readingOrderSignals'),
    ...nestedRecord(profile, 'pdfUaSignals'),
    ...nestedRecord(profile, 'annotationSignals'),
  };
}

function residualFamilies(categories: NumberRecord, signals: JsonRecord): string[] {
  const families: string[] = [];
  if ((categories['heading_structure'] ?? 100) < 70) families.push('zero_or_weak_heading_tail');
  const figureSignalsPresent = Number(signals['checkerVisibleFigureCount'] ?? signals['treeFigureCount'] ?? signals['extractedFigureCount'] ?? 0) > 0;
  if ((categories['alt_text'] ?? 100) < 70 && figureSignalsPresent) families.push('figure_alt_tail');
  const tableSignalsPresent = Number(signals['directCellUnderTableCount'] ?? 0) > 0
    || Number(signals['malformedTableCount'] ?? 0) > 0
    || Number(signals['misplacedCellCount'] ?? 0) > 0
    || Number(signals['stronglyIrregularTableCount'] ?? 0) > 0;
  if ((categories['table_markup'] ?? 100) < 70 || tableSignalsPresent) families.push('table_tail');
  if ((categories['reading_order'] ?? 100) < 70) families.push('reading_order_tail');
  if ((categories['title_language'] ?? 100) < 70 || (categories['pdf_ua_compliance'] ?? 100) < 70) families.push('metadata_pdfua_tail');
  if (families.length > 1) return ['mixed_tail', ...families];
  return families;
}

function categoryDelta(
  baseline: Stage56TimelineEntry | null,
  candidate: Stage56TimelineEntry | null,
): Stage56PairSummary['categoryBeforeDelta'] {
  const keys = new Set([
    ...Object.keys(baseline?.categoryScoresBefore ?? {}),
    ...Object.keys(candidate?.categoryScoresBefore ?? {}),
  ]);
  const out: Stage56PairSummary['categoryBeforeDelta'] = {};
  for (const key of keys) {
    const left = baseline?.categoryScoresBefore[key] ?? null;
    const right = candidate?.categoryScoresBefore[key] ?? null;
    out[key] = { baseline: left, candidate: right, delta: left != null && right != null ? right - left : null };
  }
  return out;
}

function signalDelta(
  baseline: Stage56TimelineEntry | null,
  candidate: Stage56TimelineEntry | null,
): Stage56PairSummary['signalBeforeDelta'] {
  const keys = new Set([
    ...Object.keys(baseline?.detectionSignalsBefore ?? {}),
    ...Object.keys(candidate?.detectionSignalsBefore ?? {}),
  ]);
  const out: Stage56PairSummary['signalBeforeDelta'] = {};
  for (const key of keys) {
    const left = baseline?.detectionSignalsBefore[key];
    const right = candidate?.detectionSignalsBefore[key];
    if (stableStringify(left) !== stableStringify(right)) out[key] = { baseline: left ?? null, candidate: right ?? null };
  }
  return out;
}

function structuralFamilyFromEvidence(
  baseline: Stage56TimelineEntry | null,
  candidate: Stage56TimelineEntry | null,
  baselineRow?: BenchmarkRow,
  candidateRow?: BenchmarkRow,
): string {
  const categories = {
    ...categoryMap(baselineRow),
    ...categoryMap(candidateRow),
    ...baseline?.categoryScoresBefore,
    ...candidate?.categoryScoresBefore,
  };
  const signals = {
    ...compactFinalSignals(baselineRow),
    ...compactFinalSignals(candidateRow),
    ...baseline?.detectionSignalsBefore,
    ...candidate?.detectionSignalsBefore,
  };
  const families = residualFamilies(categories, signals);
  if (families.includes('mixed_tail')) return 'mixed_figure_table_alt_or_metadata';
  if (families.includes('figure_alt_tail')) return 'figure_alt';
  if (families.includes('table_tail')) return 'table';
  if (families.includes('zero_or_weak_heading_tail')) return 'heading';
  if (families.includes('reading_order_tail')) return 'reading_order';
  if (families.includes('metadata_pdfua_tail')) return 'metadata_pdfua';
  return 'none';
}

export function classifyStage56Pair(input: {
  firstDivergentIndex: number | null;
  baselineEntry: Stage56TimelineEntry | null;
  candidateEntry: Stage56TimelineEntry | null;
  baselineFinalParityKey?: string;
  candidateFinalParityKey?: string;
  structuralFamily?: string;
}): { classification: Stage56Classification; reason: string } {
  const { baselineEntry, candidateEntry } = input;
  if (!baselineEntry && !candidateEntry) {
    if ((input.baselineFinalParityKey ?? 'missing') !== (input.candidateFinalParityKey ?? 'missing')) {
      return { classification: 'final_parity_only', reason: 'tool_timeline_equal_final_parity_differs' };
    }
    return { classification: 'no_divergence', reason: 'tool_timeline_and_final_parity_equal' };
  }
  if (!baselineEntry || !candidateEntry) {
    return { classification: 'mixed_unresolved_structural_debt', reason: 'tool_present_in_only_one_run' };
  }
  if (!baselineEntry.stateSignatureBefore || !candidateEntry.stateSignatureBefore) {
    return { classification: 'inconclusive_missing_replay_state', reason: 'replay_state_signature_missing' };
  }
  if (baselineEntry.stateSignatureBefore === candidateEntry.stateSignatureBefore) {
    if (baselineEntry.toolName !== candidateEntry.toolName) {
      return { classification: 'deterministic_candidate_ordering_drift', reason: 'same_state_different_next_tool' };
    }
    if (baselineEntry.outcome !== candidateEntry.outcome) {
      return { classification: 'same_state_acceptance_drift', reason: 'same_state_same_tool_different_outcome' };
    }
    return { classification: 'no_divergence', reason: 'same_state_same_tool_same_outcome' };
  }
  if (input.firstDivergentIndex === 0) {
    return { classification: 'initial_analysis_variance', reason: 'first_tool_starts_from_different_replay_state' };
  }
  if (input.structuralFamily === 'figure_alt') return { classification: 'figure_alt_ownership_debt', reason: 'different_upstream_state_with_figure_alt_debt' };
  if (input.structuralFamily === 'table') return { classification: 'table_structure_debt', reason: 'different_upstream_state_with_table_debt' };
  return { classification: 'mixed_unresolved_structural_debt', reason: 'different_upstream_state_with_mixed_or_unclear_structural_debt' };
}

function compareRows(baselineRun: RunData, candidateRun: RunData, rowId: string): Stage56PairSummary {
  const baselineRow = baselineRun.rows.get(rowId);
  const candidateRow = candidateRun.rows.get(rowId);
  const divergence = firstDivergence(timeline(baselineRow), timeline(candidateRow));
  const structuralFamily = structuralFamilyFromEvidence(divergence.baseline, divergence.candidate, baselineRow, candidateRow);
  const classified = classifyStage56Pair({
    firstDivergentIndex: divergence.index,
    baselineEntry: divergence.baseline,
    candidateEntry: divergence.candidate,
    baselineFinalParityKey: finalParityKey(baselineRow),
    candidateFinalParityKey: finalParityKey(candidateRow),
    structuralFamily,
  });
  return {
    baselineLabel: baselineRun.label,
    candidateLabel: candidateRun.label,
    baselineScore: baselineRow?.afterScore ?? null,
    candidateScore: candidateRow?.afterScore ?? null,
    firstDivergentIndex: divergence.index,
    classification: classified.classification,
    structuralFamily,
    reason: classified.reason,
    baselineEntry: divergence.baseline,
    candidateEntry: divergence.candidate,
    categoryBeforeDelta: categoryDelta(divergence.baseline, divergence.candidate),
    signalBeforeDelta: signalDelta(divergence.baseline, divergence.candidate),
    finalParityChanged: finalParityKey(baselineRow) !== finalParityKey(candidateRow),
  };
}

function comparisonPairs(runs: RunData[]): Array<[RunData, RunData]> {
  const out: Array<[RunData, RunData]> = [];
  for (let index = 0; index < runs.length - 1; index += 1) out.push([runs[index]!, runs[index + 1]!]);
  if (runs.length > 2) out.push([runs[0]!, runs[runs.length - 1]!]);
  return out;
}

export function buildStage56Report(input: {
  runs: RunData[];
  focusIds?: string[];
  controlIds?: string[];
  generatedAt?: string;
}): Stage56Report {
  const focusIds = input.focusIds ?? DEFAULT_FOCUS_IDS;
  const controlIds = input.controlIds ?? DEFAULT_CONTROL_IDS;
  const ids = [...new Set([...focusIds, ...controlIds])];
  const pairs = comparisonPairs(input.runs);
  const rows = ids.map(rowId => {
    const firstRow = input.runs.find(run => run.rows.has(rowId))?.rows.get(rowId);
    return {
      rowId,
      role: focusIds.includes(rowId) ? 'focus' as const : 'control' as const,
      file: firstRow?.file ?? firstRow?.localFile ?? null,
      scoresByRun: Object.fromEntries(input.runs.map(run => [run.label, run.rows.get(rowId)?.afterScore ?? null])),
      gradesByRun: Object.fromEntries(input.runs.map(run => [run.label, run.rows.get(rowId)?.afterGrade ?? null])),
      finalCategoriesByRun: Object.fromEntries(input.runs.map(run => [run.label, categoryMap(run.rows.get(rowId))])),
      finalResidualFamiliesByRun: Object.fromEntries(input.runs.map(run => {
        const row = run.rows.get(rowId);
        return [run.label, residualFamilies(categoryMap(row), compactFinalSignals(row))];
      })),
      pairSummaries: pairs.map(([baseline, candidate]) => compareRows(baseline, candidate, rowId)),
    };
  });

  const focusPairs = rows.filter(row => row.role === 'focus').flatMap(row => row.pairSummaries);
  const harmfulFocusPairs = focusPairs.filter(pair => {
    const delta = pair.baselineScore != null && pair.candidateScore != null ? Math.abs(pair.candidateScore - pair.baselineScore) : null;
    return delta == null
      || delta > 2
      || pair.classification === 'same_state_acceptance_drift'
      || pair.classification === 'deterministic_candidate_ordering_drift';
  });
  const counts = (classification: Stage56Classification): number => focusPairs.filter(pair => pair.classification === classification).length;
  const harmfulCounts = (classification: Stage56Classification): number => harmfulFocusPairs.filter(pair => pair.classification === classification).length;
  const status = harmfulCounts('same_state_acceptance_drift') > 0
    ? 'acceptance_determinism_candidate'
    : harmfulCounts('deterministic_candidate_ordering_drift') > 0
      ? 'candidate_ordering_candidate'
      : harmfulCounts('initial_analysis_variance') > 0
        ? 'analysis_determinism_candidate'
        : harmfulFocusPairs.some(pair => pair.classification === 'figure_alt_ownership_debt')
          ? 'figure_alt_fixer_candidate'
          : harmfulFocusPairs.some(pair => pair.classification === 'table_structure_debt')
            ? 'table_fixer_candidate'
            : harmfulFocusPairs.some(pair => pair.classification === 'mixed_unresolved_structural_debt')
              ? 'mixed_tail_fixer_candidate'
              : 'diagnostic_only';
  const recommendedNext = status === 'analysis_determinism_candidate'
    ? 'Stage 56B should stabilize initial analysis/runner determinism before mutator changes.'
    : status === 'candidate_ordering_candidate'
      ? 'Stage 56B should add stable tie-breaking only for the proven same-state candidate ordering path.'
      : status === 'acceptance_determinism_candidate'
        ? 'Stage 56B should fix same-state acceptance determinism only.'
        : status === 'figure_alt_fixer_candidate'
          ? 'Stage 56B should implement a narrow general Figure/Alt Mixed Tail fixer.'
          : status === 'table_fixer_candidate'
            ? 'Stage 56B should implement a narrow general Table Mixed Tail follow-up.'
            : status === 'mixed_tail_fixer_candidate'
              ? 'Stage 56B should target one proven mixed structural family, not add guards.'
              : 'Stage 56 can remain diagnostic-only; no safe implementation candidate was proven.';
  const reasons: string[] = [];
  for (const classification of [
    'initial_analysis_variance',
    'deterministic_candidate_ordering_drift',
    'same_state_acceptance_drift',
    'figure_alt_ownership_debt',
    'table_structure_debt',
    'mixed_unresolved_structural_debt',
    'inconclusive_missing_replay_state',
  ] as const) {
    const count = counts(classification);
    const harmfulCount = harmfulCounts(classification);
    if (count > 0) reasons.push(`${harmfulCount}/${count} harmful focus pair(s): ${classification}`);
  }
  if (reasons.length === 0) reasons.push('no focus divergence requiring behavior change');

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runs: input.runs.map(run => ({ label: run.label, runDir: run.runDir })),
    focusIds,
    controlIds,
    rows,
    decision: { status, recommendedNext, reasons },
  };
}

function renderEntry(entry: Stage56TimelineEntry | null): string {
  if (!entry) return 'missing';
  return [
    `${entry.toolName}/${entry.outcome}`,
    `stage=${entry.stage ?? 'n/a'}`,
    `round=${entry.round ?? 'n/a'}`,
    entry.note ? `note=${entry.note}` : null,
    entry.stateSignatureBefore ? `before=${entry.stateSignatureBefore}` : 'before=missing',
  ].filter(Boolean).join(' ');
}

function markdown(report: Stage56Report): string {
  const lines = ['# Stage 56 Mixed Figure/Table/Alt Tail Diagnostic', ''];
  lines.push(`Decision: **${report.decision.status}**`);
  lines.push(`Recommended next: ${report.decision.recommendedNext}`);
  lines.push(`Reasons: ${report.decision.reasons.join('; ')}`, '');
  lines.push('Runs:');
  for (const run of report.runs) lines.push(`- ${run.label}: \`${run.runDir}\``);
  lines.push('', '| row | role | scores | residuals | classifications |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push(`| ${row.rowId} | ${row.role} | ${JSON.stringify(row.scoresByRun)} | ${JSON.stringify(row.finalResidualFamiliesByRun)} | ${row.pairSummaries.map(pair => `${pair.baselineLabel}->${pair.candidateLabel}:${pair.classification}/${pair.structuralFamily}`).join(', ')} |`);
  }
  lines.push('');
  for (const row of report.rows) {
    lines.push(`## ${row.rowId}`, '', `- File: ${row.file ?? 'n/a'}`);
    lines.push(`- Final categories: \`${JSON.stringify(row.finalCategoriesByRun)}\``);
    for (const pair of row.pairSummaries) {
      lines.push(`- ${pair.baselineLabel} -> ${pair.candidateLabel}: ${pair.baselineScore ?? 'n/a'} -> ${pair.candidateScore ?? 'n/a'}; class=${pair.classification}; family=${pair.structuralFamily}; reason=${pair.reason}; index=${pair.firstDivergentIndex ?? 'n/a'}`);
      lines.push(`  - baseline: ${renderEntry(pair.baselineEntry)}`);
      lines.push(`  - candidate: ${renderEntry(pair.candidateEntry)}`);
      lines.push(`  - category-before delta: \`${JSON.stringify(pair.categoryBeforeDelta)}\``);
      lines.push(`  - signal-before delta: \`${JSON.stringify(pair.signalBeforeDelta)}\``);
      lines.push(`  - final parity changed: ${pair.finalParityChanged ? 'yes' : 'no'}`);
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
  const report = buildStage56Report({ runs, focusIds: args.focusIds, controlIds: args.controlIds });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage56-mixed-tail-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.outDir, 'stage56-mixed-tail-diagnostic.md'), markdown(report), 'utf8');
  console.log(`Wrote Stage 56 mixed-tail diagnostic report to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
  console.log(report.decision.recommendedNext);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
