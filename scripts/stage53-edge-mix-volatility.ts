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
  gradeBefore?: string | null;
  gradeAfter?: string | null;
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
  falsePositiveAppliedCount?: number;
  wallRemediateMs?: number;
}

interface RunData {
  label: string;
  runDir: string;
  rows: Map<string, BenchmarkRow>;
}

interface ToolFingerprint {
  toolName: string;
  outcome: string;
  stage: number | null;
  round: number | null;
  source: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  note: string | null;
  detailFacts: Record<string, unknown>;
}

interface DivergentTool {
  index: number;
  baseline: ToolFingerprint | null;
  candidate: ToolFingerprint | null;
}

interface CategoryDelta {
  key: string;
  baseline: number;
  candidate: number;
  delta: number;
}

export type Stage53DivergencePhase =
  | 'none'
  | 'remediation_tool_sequence'
  | 'final_hidden_heading_parity'
  | 'score_or_category_without_tool_divergence'
  | 'missing_row';

export interface Stage53PairComparison {
  baselineLabel: string;
  candidateLabel: string;
  baselineScore: number | null;
  candidateScore: number | null;
  scoreDelta: number | null;
  categoryDeltas: CategoryDelta[];
  firstDivergentAcceptedTool: DivergentTool | null;
  firstDivergentRejectedTool: DivergentTool | null;
  finalParity: {
    baseline: FinalAdjustment | null;
    candidate: FinalAdjustment | null;
  };
  divergencePhase: Stage53DivergencePhase;
}

export interface Stage53RowReport {
  rowId: string;
  file: string | null;
  role: 'focus' | 'control' | 'other';
  scoreRange: number | null;
  scoresByRun: Record<string, number | null>;
  gradesByRun: Record<string, string | null>;
  finalParityByRun: Record<string, FinalAdjustment | null>;
  pairComparisons: Stage53PairComparison[];
  likelyCause: string;
}

export interface Stage53Report {
  generatedAt: string;
  runs: Array<{ label: string; runDir: string }>;
  focusIds: string[];
  controlIds: string[];
  rows: Stage53RowReport[];
  decision: {
    status: 'diagnostic_only' | 'deterministic_fix_candidate';
    reasons: string[];
    commonDivergenceSignatures: DivergenceSignatureSummary[];
  };
}

interface DivergenceSignatureSummary {
  signature: string;
  count: number;
  improved: number;
  regressed: number;
  stable: number;
}

const DEFAULT_RUNS = [
  ['stage50', 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage50-target-edge-mix-2026-04-24-r3'],
  ['stage52b-r2', 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage52b-target-edge-mix-2026-04-24-r2'],
  ['stage52b-r3', 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage52b-target-edge-mix-2026-04-24-r3'],
] as const;
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix/stage53-edge-mix-volatility-2026-04-24-r1';
const DEFAULT_FOCUS_IDS = ['v1-4683', 'v1-4139', 'v1-4567'];
const DEFAULT_CONTROL_IDS = ['v1-4215', 'v1-4122', 'v1-4751', 'v1-4627'];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage53-edge-mix-volatility.ts [options]',
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

function categories(row?: BenchmarkRow): CategoryScores {
  return Object.fromEntries((row?.afterCategories ?? []).map(category => [category.key, category.score]));
}

function categoryDeltas(baseline: CategoryScores, candidate: CategoryScores): CategoryDelta[] {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(candidate)]);
  return [...keys]
    .map(key => ({
      key,
      baseline: baseline[key] ?? 0,
      candidate: candidate[key] ?? 0,
      delta: (candidate[key] ?? 0) - (baseline[key] ?? 0),
    }))
    .filter(delta => delta.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.key.localeCompare(b.key));
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

function selectedFacts(details: Record<string, unknown>): Record<string, unknown> {
  const invariants = nestedRecord(details, 'invariants');
  const debug = nestedRecord(details, 'debug');
  const out: Record<string, unknown> = {};
  for (const key of [
    'targetRef',
    'targetReachable',
    'targetIsFigureAfter',
    'targetHasAltAfter',
    'rootReachableHeadingCountAfter',
    'tableTreeValidAfter',
    'visibleAnnotationsMissingStructureAfter',
    'visibleAnnotationsMissingStructParentAfter',
  ]) {
    if (invariants[key] !== undefined) out[key] = invariants[key];
  }
  for (const key of ['targetRef', 'rootReachableHeadingCount', 'checkerVisibleFigureCountAfter']) {
    if (debug[key] !== undefined) out[`debug.${key}`] = debug[key];
  }
  return out;
}

function fingerprint(tool: ToolRow | undefined): ToolFingerprint | null {
  if (!tool) return null;
  const details = parseDetails(tool.details);
  return {
    toolName: tool.toolName ?? tool.name ?? 'unknown',
    outcome: tool.outcome ?? 'unknown',
    stage: typeof tool.stage === 'number' ? tool.stage : null,
    round: typeof tool.round === 'number' ? tool.round : null,
    source: typeof tool.source === 'string' ? tool.source : null,
    scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
    scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
    note: noteFromDetails(details),
    detailFacts: selectedFacts(details),
  };
}

function comparableKey(tool: ToolRow | undefined): string {
  const fp = fingerprint(tool);
  if (!fp) return 'missing';
  return JSON.stringify({
    toolName: fp.toolName,
    outcome: fp.outcome,
    stage: fp.stage,
    round: fp.round,
    source: fp.source,
    note: fp.note,
    detailFacts: fp.detailFacts,
  });
}

function firstDivergentTool(
  baselineTools: ToolRow[],
  candidateTools: ToolRow[],
  predicate: (tool: ToolRow | undefined) => boolean,
): DivergentTool | null {
  const max = Math.max(baselineTools.length, candidateTools.length);
  for (let index = 0; index < max; index += 1) {
    const baseline = baselineTools[index];
    const candidate = candidateTools[index];
    if (!predicate(baseline) && !predicate(candidate)) continue;
    if (comparableKey(baseline) !== comparableKey(candidate)) {
      return {
        index,
        baseline: predicate(baseline) ? fingerprint(baseline) : null,
        candidate: predicate(candidate) ? fingerprint(candidate) : null,
      };
    }
  }
  return null;
}

function isAccepted(tool: ToolRow | undefined): boolean {
  return tool?.outcome === 'applied';
}

function isTerminalNonSuccess(tool: ToolRow | undefined): boolean {
  return tool?.outcome === 'rejected' || tool?.outcome === 'no_effect' || tool?.outcome === 'failed';
}

function finalParity(row?: BenchmarkRow): FinalAdjustment | null {
  return row?.finalAdjustments?.find(adjustment => adjustment.kind === 'final_hidden_heading_parity') ?? null;
}

function parityKey(adjustment: FinalAdjustment | null): string {
  if (!adjustment) return 'missing';
  return JSON.stringify({
    status: adjustment.status ?? null,
    reason: adjustment.reason ?? null,
    evidenceCount: adjustment.evidenceCount ?? null,
    sourceTool: adjustment.sourceTool ?? null,
    scoreBefore: adjustment.scoreBefore ?? null,
    scoreAfter: adjustment.scoreAfter ?? null,
  });
}

function compareRows(
  baselineLabel: string,
  candidateLabel: string,
  baseline: BenchmarkRow | undefined,
  candidate: BenchmarkRow | undefined,
): Stage53PairComparison {
  if (!baseline || !candidate) {
    return {
      baselineLabel,
      candidateLabel,
      baselineScore: baseline?.afterScore ?? null,
      candidateScore: candidate?.afterScore ?? null,
      scoreDelta: null,
      categoryDeltas: [],
      firstDivergentAcceptedTool: null,
      firstDivergentRejectedTool: null,
      finalParity: { baseline: finalParity(baseline), candidate: finalParity(candidate) },
      divergencePhase: 'missing_row',
    };
  }
  const accepted = firstDivergentTool(baseline.appliedTools ?? [], candidate.appliedTools ?? [], isAccepted);
  const rejected = firstDivergentTool(baseline.appliedTools ?? [], candidate.appliedTools ?? [], isTerminalNonSuccess);
  const deltas = categoryDeltas(categories(baseline), categories(candidate));
  const scoreDelta = typeof baseline.afterScore === 'number' && typeof candidate.afterScore === 'number'
    ? candidate.afterScore - baseline.afterScore
    : null;
  const baselineParity = finalParity(baseline);
  const candidateParity = finalParity(candidate);
  const parityChanged = parityKey(baselineParity) !== parityKey(candidateParity);
  const scoreOrCategoriesChanged = scoreDelta !== 0 || deltas.length > 0;
  const divergencePhase: Stage53DivergencePhase =
    accepted || rejected
      ? 'remediation_tool_sequence'
      : parityChanged
        ? 'final_hidden_heading_parity'
        : scoreOrCategoriesChanged
          ? 'score_or_category_without_tool_divergence'
          : 'none';
  return {
    baselineLabel,
    candidateLabel,
    baselineScore: baseline.afterScore ?? null,
    candidateScore: candidate.afterScore ?? null,
    scoreDelta,
    categoryDeltas: deltas,
    firstDivergentAcceptedTool: accepted,
    firstDivergentRejectedTool: rejected,
    finalParity: { baseline: baselineParity, candidate: candidateParity },
    divergencePhase,
  };
}

function scoreRange(rows: Array<BenchmarkRow | undefined>): number | null {
  const scores = rows.map(row => row?.afterScore).filter((score): score is number => typeof score === 'number');
  if (scores.length === 0) return null;
  return Math.max(...scores) - Math.min(...scores);
}

function likelyCause(comparisons: Stage53PairComparison[], range: number | null): string {
  if (comparisons.some(comparison => comparison.divergencePhase === 'remediation_tool_sequence')) {
    return 'remediation_path_volatility';
  }
  if (comparisons.some(comparison => comparison.divergencePhase === 'final_hidden_heading_parity')) {
    return 'final_parity_only_difference';
  }
  if ((range ?? 0) > 2) return 'analysis_or_score_volatility_without_tool_sequence_change';
  return 'stable';
}

export function buildStage53Report(input: {
  runs: RunData[];
  focusIds?: string[];
  controlIds?: string[];
  generatedAt?: string;
}): Stage53Report {
  const focusIds = input.focusIds ?? DEFAULT_FOCUS_IDS;
  const controlIds = input.controlIds ?? DEFAULT_CONTROL_IDS;
  const ids = [...new Set([...focusIds, ...controlIds])];
  const rows = ids.map(id => {
    const runRows = input.runs.map(run => run.rows.get(id));
    const comparisons = comparisonPairs(input.runs).map(([baselineRun, candidateRun]) =>
      compareRows(baselineRun.label, candidateRun.label, baselineRun.rows.get(id), candidateRun.rows.get(id)));
    const range = scoreRange(runRows);
    const row = input.runs.find(run => run.rows.has(id))?.rows.get(id);
    return {
      rowId: id,
      file: row?.file ?? row?.localFile ?? null,
      role: focusIds.includes(id) ? 'focus' as const : controlIds.includes(id) ? 'control' as const : 'other' as const,
      scoreRange: range,
      scoresByRun: Object.fromEntries(input.runs.map(run => [run.label, run.rows.get(id)?.afterScore ?? null])),
      gradesByRun: Object.fromEntries(input.runs.map(run => [run.label, run.rows.get(id)?.afterGrade ?? null])),
      finalParityByRun: Object.fromEntries(input.runs.map(run => [run.label, finalParity(run.rows.get(id))])),
      pairComparisons: comparisons,
      likelyCause: likelyCause(comparisons, range),
    };
  });
  const remediationVolatile = rows.filter(row => row.likelyCause === 'remediation_path_volatility');
  const signatures = commonDivergenceSignatures(remediationVolatile);
  const dominant = signatures[0];
  const deterministicCandidate = Boolean(
    dominant &&
    dominant.count >= Math.max(2, Math.ceil(remediationVolatile.length / 2)) &&
    dominant.regressed > 0 &&
    dominant.improved === 0,
  );
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runs: input.runs.map(run => ({ label: run.label, runDir: run.runDir })),
    focusIds,
    controlIds,
    rows,
    decision: {
      status: deterministicCandidate ? 'deterministic_fix_candidate' : 'diagnostic_only',
      reasons: remediationVolatile.length > 0
        ? [
            `${remediationVolatile.length} row(s) diverge before final parity in remediation tool sequence`,
            deterministicCandidate
              ? `dominant divergence signature: ${dominant!.signature}`
              : dominant && dominant.improved > 0 && dominant.regressed > 0
                ? `dominant divergence signature has mixed score direction: ${dominant.signature}`
                : 'no single regression-only divergence signature covers enough rows for a safe Stage 53 behavior change',
          ]
        : ['no remediation-sequence volatility detected in configured rows'],
      commonDivergenceSignatures: signatures,
    },
  };
}

function comparisonPairs(runs: RunData[]): Array<[RunData, RunData]> {
  if (runs.length < 2) return [];
  const out: Array<[RunData, RunData]> = [];
  for (let index = 1; index < runs.length; index += 1) {
    out.push([runs[0]!, runs[index]!]);
  }
  for (let index = 1; index < runs.length - 1; index += 1) {
    out.push([runs[index]!, runs[index + 1]!]);
  }
  return out;
}

function divergenceSignature(comparison: Stage53PairComparison): string | null {
  if (comparison.divergencePhase !== 'remediation_tool_sequence') return null;
  const accepted = comparison.firstDivergentAcceptedTool;
  if (accepted) {
    return `accepted:${accepted.baseline?.toolName ?? 'missing'}:${accepted.baseline?.outcome ?? 'missing'}->${accepted.candidate?.toolName ?? 'missing'}:${accepted.candidate?.outcome ?? 'missing'}`;
  }
  const rejected = comparison.firstDivergentRejectedTool;
  if (rejected) {
    return `terminal:${rejected.baseline?.toolName ?? 'missing'}:${rejected.baseline?.outcome ?? 'missing'}->${rejected.candidate?.toolName ?? 'missing'}:${rejected.candidate?.outcome ?? 'missing'}`;
  }
  return null;
}

function commonDivergenceSignatures(rows: Stage53RowReport[]): DivergenceSignatureSummary[] {
  const counts = new Map<string, DivergenceSignatureSummary>();
  for (const row of rows) {
    const rowSignatures = new Map<string, number>();
    for (const comparison of row.pairComparisons) {
      const signature = divergenceSignature(comparison);
      if (!signature) continue;
      const delta = comparison.scoreDelta ?? 0;
      const prior = rowSignatures.get(signature);
      if (prior === undefined || Math.abs(delta) > Math.abs(prior)) rowSignatures.set(signature, delta);
    }
    for (const [signature, delta] of rowSignatures) {
      const current = counts.get(signature) ?? { signature, count: 0, improved: 0, regressed: 0, stable: 0 };
      current.count += 1;
      if (delta > 2) current.improved += 1;
      else if (delta < -2) current.regressed += 1;
      else current.stable += 1;
      counts.set(signature, current);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));
}

function renderTool(tool: ToolFingerprint | null): string {
  if (!tool) return 'missing';
  const facts = Object.keys(tool.detailFacts).length > 0 ? ` ${JSON.stringify(tool.detailFacts)}` : '';
  return `${tool.toolName}:${tool.outcome}${tool.note ? `:${tool.note}` : ''}${facts}`;
}

function markdown(report: Stage53Report): string {
  const lines = ['# Stage 53 Edge-Mix Volatility Isolation', ''];
  lines.push(`Decision: **${report.decision.status}**`);
  lines.push(`Reasons: ${report.decision.reasons.join('; ')}`, '');
  lines.push(`Common divergence signatures: \`${JSON.stringify(report.decision.commonDivergenceSignatures)}\``, '');
  lines.push('Runs:');
  for (const run of report.runs) lines.push(`- ${run.label}: \`${run.runDir}\``);
  lines.push('');
  lines.push('| row | role | scores | range | likely cause |');
  lines.push('| --- | --- | --- | ---: | --- |');
  for (const row of report.rows) {
    lines.push(`| ${row.rowId} | ${row.role} | ${JSON.stringify(row.scoresByRun)} | ${row.scoreRange ?? 'n/a'} | ${row.likelyCause} |`);
  }
  lines.push('');
  for (const row of report.rows) {
    lines.push(`## ${row.rowId}`, '');
    lines.push(`- File: ${row.file ?? 'n/a'}`);
    lines.push(`- Final parity by run: \`${JSON.stringify(row.finalParityByRun)}\``);
    for (const comparison of row.pairComparisons) {
      lines.push(`- ${comparison.baselineLabel} -> ${comparison.candidateLabel}: score ${comparison.baselineScore ?? 'n/a'} -> ${comparison.candidateScore ?? 'n/a'} (${comparison.scoreDelta ?? 'n/a'}), phase=${comparison.divergencePhase}`);
      const deltas = comparison.categoryDeltas.slice(0, 4).map(delta => `${delta.key}:${delta.baseline}->${delta.candidate}`).join(', ');
      if (deltas) lines.push(`  - Category deltas: ${deltas}`);
      if (comparison.firstDivergentAcceptedTool) {
        lines.push(`  - First accepted divergence @${comparison.firstDivergentAcceptedTool.index}: baseline=${renderTool(comparison.firstDivergentAcceptedTool.baseline)} candidate=${renderTool(comparison.firstDivergentAcceptedTool.candidate)}`);
      }
      if (comparison.firstDivergentRejectedTool) {
        lines.push(`  - First rejected/no-effect divergence @${comparison.firstDivergentRejectedTool.index}: baseline=${renderTool(comparison.firstDivergentRejectedTool.baseline)} candidate=${renderTool(comparison.firstDivergentRejectedTool.candidate)}`);
      }
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
  const report = buildStage53Report({
    runs,
    focusIds: args.focusIds,
    controlIds: args.controlIds,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage53-edge-mix-volatility.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.outDir, 'stage53-edge-mix-volatility.md'), markdown(report), 'utf8');
  console.log(`Wrote Stage 53 edge-mix volatility report to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
