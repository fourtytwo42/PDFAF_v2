#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const DEFAULT_TARGET_SCORE = 93;

export type FinalReanalysisVarianceClass =
  | 'gate_clear'
  | 'after_to_reanalysis_score_drop'
  | 'after_to_reanalysis_profile_drift'
  | 'repeat_reanalysis_variance'
  | 'stable_low_reanalysis_verified'
  | 'missing_required_payload'
  | 'no_behavior_ready';

export type FinalReanalysisVarianceDecision =
  | 'original50_route_ready_for_table_reopen'
  | 'diagnose_final_reanalysis_analyzer_variance_before_behavior'
  | 'move_to_row_failure_shape_or_park'
  | 'collect_reanalysis_payload'
  | 'no_behavior_ready';

interface CategoryScore {
  key?: string;
  score?: number | null;
  applicable?: boolean;
}

interface AppliedTool {
  toolName?: string;
  tool?: string;
  outcome?: string;
  status?: string;
  stage?: number | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  details?: unknown;
  pacRegressionReason?: string | null;
}

interface RemediateRow {
  id?: string;
  file?: string;
  filename?: string;
  beforeScore?: number | null;
  beforeGrade?: string | null;
  afterScore?: number | null;
  afterGrade?: string | null;
  reanalyzedScore?: number | null;
  reanalyzedGrade?: string | null;
  wallRemediateMs?: number | null;
  totalPipelineMs?: number | null;
  falsePositiveApplied?: number | null;
  falsePositiveAppliedCount?: number | null;
  afterCategories?: CategoryScore[];
  reanalyzedCategories?: CategoryScore[];
  afterDetectionProfile?: Record<string, unknown>;
  reanalyzedDetectionProfile?: Record<string, unknown>;
  afterManualReviewReasons?: string[];
  reanalyzedManualReviewReasons?: string[];
  appliedTools?: AppliedTool[] | null;
}

interface NormalizedTool {
  index: number;
  stage: number | null;
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  pacRegressions: string[];
}

interface NormalizedRow {
  key: string;
  file: string;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  wallMs: number | null;
  falsePositiveApplied: number;
  afterCategories: Record<string, number>;
  reanalyzedCategories: Record<string, number>;
  afterSignals: Record<string, number | boolean | string | null>;
  reanalyzedSignals: Record<string, number | boolean | string | null>;
  afterManualReviewReasons: string[];
  reanalyzedManualReviewReasons: string[];
  toolTimeline: NormalizedTool[];
}

interface RunInput {
  label: string;
  runDir: string;
  remediatePath: string;
  rows: Map<string, NormalizedRow>;
}

export interface DeltaValue {
  key: string;
  left: number | boolean | string | null;
  right: number | boolean | string | null;
  delta: number | null;
}

export interface ReanalysisRunSummary {
  label: string;
  runDir: string;
  present: boolean;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  wallMs: number | null;
  falsePositiveApplied: number;
  afterCategories: Record<string, number>;
  reanalyzedCategories: Record<string, number>;
  afterSignals: Record<string, number | boolean | string | null>;
  reanalyzedSignals: Record<string, number | boolean | string | null>;
  categoryDeltasAfterToReanalysis: DeltaValue[];
  signalDeltasAfterToReanalysis: DeltaValue[];
  manualReviewAddedAtReanalysis: string[];
  manualReviewRemovedAtReanalysis: string[];
  pacRegressionFamilies: string[];
  firstTools: NormalizedTool[];
}

export interface FinalReanalysisVarianceRow {
  key: string;
  file: string;
  runs: ReanalysisRunSummary[];
  classification: FinalReanalysisVarianceClass;
  reasons: string[];
  recommendedNext: string;
  repeatReanalysisScoreDelta: number | null;
  repeatReanalysisCategoryDeltas: DeltaValue[];
  repeatReanalysisSignalDeltas: DeltaValue[];
}

export interface FinalReanalysisVarianceDiagnostic {
  generatedAt: string;
  outDir: string;
  targetScore: number;
  inputs: Array<{ label: string; runDir: string; remediatePath: string }>;
  summary: {
    rowCount: number;
    blockerCount: number;
    byClass: Record<FinalReanalysisVarianceClass, number>;
  };
  decision: {
    status: FinalReanalysisVarianceDecision;
    reasons: string[];
    nextLane: string;
  };
  rows: FinalReanalysisVarianceRow[];
}

interface Args {
  runs: Array<{ label: string; path: string }>;
  rows: string[];
  outDir: string;
  targetScore: number;
}

const CLASSES: FinalReanalysisVarianceClass[] = [
  'gate_clear',
  'after_to_reanalysis_score_drop',
  'after_to_reanalysis_profile_drift',
  'repeat_reanalysis_variance',
  'stable_low_reanalysis_verified',
  'missing_required_payload',
  'no_behavior_ready',
];

const SIGNAL_PATHS: Array<{ key: string; path: string[] }> = [
  { key: 'heading.extractedHeadingCount', path: ['headingSignals', 'extractedHeadingCount'] },
  { key: 'heading.treeHeadingCount', path: ['headingSignals', 'treeHeadingCount'] },
  { key: 'heading.headingTreeDepth', path: ['headingSignals', 'headingTreeDepth'] },
  { key: 'figure.extractedFigureCount', path: ['figureSignals', 'extractedFigureCount'] },
  { key: 'figure.treeFigureCount', path: ['figureSignals', 'treeFigureCount'] },
  { key: 'figure.checkerVisibleFigureCount', path: ['figureSignals', 'checkerVisibleFigureCount'] },
  { key: 'table.tableCount', path: ['tableSignals', 'tableCount'] },
  { key: 'table.irregularTableCount', path: ['tableSignals', 'irregularTableCount'] },
  { key: 'table.stronglyIrregularTableCount', path: ['tableSignals', 'stronglyIrregularTableCount'] },
  { key: 'table.headerlessTableCount', path: ['tableSignals', 'headerlessTableCount'] },
  { key: 'pdfua.orphanMcidCount', path: ['pdfUaSignals', 'orphanMcidCount'] },
  { key: 'reading.sampledStructurePageOrderDriftCount', path: ['readingOrderSignals', 'sampledStructurePageOrderDriftCount'] },
  { key: 'reading.multiColumnOrderRiskPages', path: ['readingOrderSignals', 'multiColumnOrderRiskPages'] },
];

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original50-final-reanalysis-variance-diagnostic.ts --run <label=runDir> [options]

Options:
  --run <label=runDir>               Run directory with remediate.results.json. Repeatable.
  --row <id-or-substring>            Row key to include. Repeatable. Defaults to rows in runs.
  --out <dir>                        Output directory.
  --target-score <n>                 Gate target score. Default: ${DEFAULT_TARGET_SCORE}.
  --help                             Show this help.

This script reads existing JSON only. It does not analyze PDFs, remediate PDFs, write remediated PDFs, or call ODL/PAC/POC/Java/LLM.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  const runs: Array<{ label: string; path: string }> = [];
  const rows: string[] = [];
  let outDir = join(DEFAULT_OUT_ROOT, `original50-final-reanalysis-variance-${timestampSlug(now)}`);
  let targetScore = DEFAULT_TARGET_SCORE;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--run') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --run value\n${usage()}`);
      runs.push(parseLabelPath(value));
      continue;
    }
    if (arg === '--row') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --row value\n${usage()}`);
      rows.push(value);
      continue;
    }
    if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --out value\n${usage()}`);
      outDir = resolve(value);
      continue;
    }
    if (arg === '--target-score') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value)) throw new Error(`Invalid --target-score value\n${usage()}`);
      targetScore = value;
      continue;
    }
    throw new Error(`Unknown argument ${arg}\n${usage()}`);
  }

  if (runs.length === 0) throw new Error(`At least one --run is required\n${usage()}`);
  return { runs, rows, outDir, targetScore };
}

function parseLabelPath(value: string): { label: string; path: string } {
  const index = value.indexOf('=');
  if (index === -1) return { label: basename(value), path: value };
  return { label: value.slice(0, index), path: value.slice(index + 1) };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function rowKey(row: { id?: string; file?: string; filename?: string }): string {
  if (row.id) return row.id;
  const file = row.file ?? row.filename ?? 'unknown';
  return basename(file).replace(/\.pdf$/i, '');
}

function rowMatches(key: string, file: string, selectors: string[]): boolean {
  if (selectors.length === 0) return true;
  const text = `${key} ${file}`.toLowerCase();
  return selectors.some(selector => text.includes(selector.toLowerCase()));
}

function categoryMap(categories: CategoryScore[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const category of categories ?? []) {
    if (!category.key || typeof category.score !== 'number') continue;
    if (category.applicable === false) continue;
    out[category.key] = category.score;
  }
  return out;
}

function getPath(root: Record<string, unknown> | undefined, path: string[]): number | boolean | string | null {
  let current: unknown = root;
  for (const part of path) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current === 'number' || typeof current === 'boolean' || typeof current === 'string') return current;
  return null;
}

function signalMap(profile: Record<string, unknown> | undefined): Record<string, number | boolean | string | null> {
  const out: Record<string, number | boolean | string | null> = {};
  for (const item of SIGNAL_PATHS) {
    const value = getPath(profile, item.path);
    if (value !== null) out[item.key] = value;
  }
  return out;
}

function parseDetails(details: unknown): Record<string, unknown> {
  if (!details) return {};
  if (typeof details === 'object') return details as Record<string, unknown>;
  if (typeof details !== 'string') return {};
  try {
    const parsed = JSON.parse(details) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeTool(tool: AppliedTool, index: number): NormalizedTool {
  const details = parseDetails(tool.details);
  const debug = details.debug && typeof details.debug === 'object' ? details.debug as Record<string, unknown> : {};
  const replayState = debug.replayState && typeof debug.replayState === 'object' ? debug.replayState as Record<string, unknown> : {};
  const pacRegressions = [
    ...stringArray(replayState.pacRegressions),
    ...(tool.pacRegressionReason ? [tool.pacRegressionReason] : []),
  ];
  return {
    index,
    stage: typeof tool.stage === 'number' ? tool.stage : null,
    toolName: tool.toolName ?? tool.tool ?? 'unknown',
    outcome: tool.outcome ?? tool.status ?? 'unknown',
    scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
    scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
    pacRegressions,
  };
}

function normalizeRow(row: RemediateRow): NormalizedRow {
  const file = row.file ?? row.filename ?? rowKey(row);
  return {
    key: rowKey(row),
    file,
    beforeScore: typeof row.beforeScore === 'number' ? row.beforeScore : null,
    afterScore: typeof row.afterScore === 'number' ? row.afterScore : null,
    afterGrade: row.afterGrade ?? null,
    reanalyzedScore: typeof row.reanalyzedScore === 'number' ? row.reanalyzedScore : null,
    reanalyzedGrade: row.reanalyzedGrade ?? null,
    wallMs: typeof row.wallRemediateMs === 'number' ? row.wallRemediateMs : typeof row.totalPipelineMs === 'number' ? row.totalPipelineMs : null,
    falsePositiveApplied: Math.max(row.falsePositiveApplied ?? 0, row.falsePositiveAppliedCount ?? 0),
    afterCategories: categoryMap(row.afterCategories),
    reanalyzedCategories: categoryMap(row.reanalyzedCategories),
    afterSignals: signalMap(row.afterDetectionProfile),
    reanalyzedSignals: signalMap(row.reanalyzedDetectionProfile),
    afterManualReviewReasons: row.afterManualReviewReasons ?? [],
    reanalyzedManualReviewReasons: row.reanalyzedManualReviewReasons ?? [],
    toolTimeline: (row.appliedTools ?? []).map(normalizeTool),
  };
}

function mapRows(rows: NormalizedRow[]): Map<string, NormalizedRow> {
  const out = new Map<string, NormalizedRow>();
  for (const row of rows) out.set(row.key, row);
  return out;
}

function compareMaps<T extends number | boolean | string | null>(
  left: Record<string, T>,
  right: Record<string, T>,
  numericThreshold: number,
): DeltaValue[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const out: DeltaValue[] = [];
  for (const key of [...keys].sort()) {
    const l = left[key] ?? null;
    const r = right[key] ?? null;
    if (l === r) continue;
    const delta = typeof l === 'number' && typeof r === 'number' ? r - l : null;
    if (delta !== null && Math.abs(delta) < numericThreshold) continue;
    out.push({ key, left: l, right: r, delta });
  }
  return out;
}

function repeatDeltas(runs: ReanalysisRunSummary[], pick: (run: ReanalysisRunSummary) => Record<string, number | boolean | string | null>, threshold: number): DeltaValue[] {
  const present = runs.filter(run => run.present);
  if (present.length < 2) return [];
  const keys = new Set<string>();
  for (const run of present) {
    for (const key of Object.keys(pick(run))) keys.add(key);
  }
  const out: DeltaValue[] = [];
  for (const key of [...keys].sort()) {
    const values = present.map(run => pick(run)[key] ?? null);
    const first = values[0] ?? null;
    const changed = values.some(value => value !== first);
    if (!changed) continue;
    const numericValues = values.filter((value): value is number => typeof value === 'number');
    if (numericValues.length === values.length) {
      const min = Math.min(...numericValues);
      const max = Math.max(...numericValues);
      if (max - min < threshold) continue;
      out.push({ key, left: min, right: max, delta: max - min });
      continue;
    }
    out.push({ key, left: first, right: values.find(value => value !== first) ?? null, delta: null });
  }
  return out;
}

function setDiff(left: string[], right: string[]): string[] {
  const source = new Set(left);
  return [...new Set(right)].filter(item => !source.has(item)).sort();
}

function pacFamilies(tools: NormalizedTool[]): string[] {
  const families = new Set<string>();
  for (const tool of tools) {
    for (const regression of tool.pacRegressions) {
      if (regression.includes('table.')) families.add('table/header');
      else if (regression.includes('figure.')) families.add('figure/alt');
      else if (regression.includes('content.orphan')) families.add('orphan_mcid');
      else if (regression.includes('annotation') || regression.includes('link')) families.add('link/annotation');
      else if (regression.includes('reading') || regression.includes('heading')) families.add('reading/heading');
      else families.add('unknown');
    }
  }
  return [...families].sort();
}

function summarizeRun(run: RunInput, key: string): ReanalysisRunSummary {
  const row = run.rows.get(key);
  if (!row) {
    return {
      label: run.label,
      runDir: run.runDir,
      present: false,
      beforeScore: null,
      afterScore: null,
      afterGrade: null,
      reanalyzedScore: null,
      reanalyzedGrade: null,
      wallMs: null,
      falsePositiveApplied: 0,
      afterCategories: {},
      reanalyzedCategories: {},
      afterSignals: {},
      reanalyzedSignals: {},
      categoryDeltasAfterToReanalysis: [],
      signalDeltasAfterToReanalysis: [],
      manualReviewAddedAtReanalysis: [],
      manualReviewRemovedAtReanalysis: [],
      pacRegressionFamilies: [],
      firstTools: [],
    };
  }
  return {
    label: run.label,
    runDir: run.runDir,
    present: true,
    beforeScore: row.beforeScore,
    afterScore: row.afterScore,
    afterGrade: row.afterGrade,
    reanalyzedScore: row.reanalyzedScore,
    reanalyzedGrade: row.reanalyzedGrade,
    wallMs: row.wallMs,
    falsePositiveApplied: row.falsePositiveApplied,
    afterCategories: row.afterCategories,
    reanalyzedCategories: row.reanalyzedCategories,
    afterSignals: row.afterSignals,
    reanalyzedSignals: row.reanalyzedSignals,
    categoryDeltasAfterToReanalysis: compareMaps(row.afterCategories, row.reanalyzedCategories, 4),
    signalDeltasAfterToReanalysis: compareMaps(row.afterSignals, row.reanalyzedSignals, 1),
    manualReviewAddedAtReanalysis: setDiff(row.afterManualReviewReasons, row.reanalyzedManualReviewReasons),
    manualReviewRemovedAtReanalysis: setDiff(row.reanalyzedManualReviewReasons, row.afterManualReviewReasons),
    pacRegressionFamilies: pacFamilies(row.toolTimeline),
    firstTools: row.toolTimeline.slice(0, 8),
  };
}

function classifyRow(input: {
  runs: ReanalysisRunSummary[];
  repeatReanalysisScoreDelta: number | null;
  repeatReanalysisCategoryDeltas: DeltaValue[];
  repeatReanalysisSignalDeltas: DeltaValue[];
  targetScore: number;
}): Pick<FinalReanalysisVarianceRow, 'classification' | 'reasons' | 'recommendedNext'> {
  const present = input.runs.filter(run => run.present);
  if (present.length === 0) {
    return {
      classification: 'missing_required_payload',
      reasons: ['row was not present in any input run'],
      recommendedNext: 'collect a focused deterministic run with remediate.results.json',
    };
  }
  if (present.every(run => (run.reanalyzedScore ?? run.afterScore ?? 0) >= input.targetScore)) {
    return {
      classification: 'gate_clear',
      reasons: ['all present final/reanalyzed scores meet the target'],
      recommendedNext: 'no blocker for this row',
    };
  }

  const scoreDropRuns = present.filter(run => {
    if (typeof run.afterScore !== 'number' || typeof run.reanalyzedScore !== 'number') return false;
    return run.afterScore - run.reanalyzedScore >= 5 || (run.afterScore >= input.targetScore && run.reanalyzedScore < input.targetScore);
  });
  if (scoreDropRuns.length > 0) {
    return {
      classification: 'after_to_reanalysis_score_drop',
      reasons: scoreDropRuns.map(run => `${run.label} after ${run.afterScore} reanalyzed ${run.reanalyzedScore}`),
      recommendedNext: 'diagnose final analyzer/reanalysis variance before accepting behavior',
    };
  }

  if ((input.repeatReanalysisScoreDelta ?? 0) >= 10 || input.repeatReanalysisCategoryDeltas.length > 0 || input.repeatReanalysisSignalDeltas.length > 0) {
    return {
      classification: 'repeat_reanalysis_variance',
      reasons: [`reanalyzed repeat score/category/signal profile varies across ${present.length} run(s)`],
      recommendedNext: 'run bounded analyzer-repeat attribution or park as analyzer volatility',
    };
  }

  const driftRuns = present.filter(run => run.categoryDeltasAfterToReanalysis.length > 0 || run.signalDeltasAfterToReanalysis.length > 0);
  if (driftRuns.length > 0) {
    return {
      classification: 'after_to_reanalysis_profile_drift',
      reasons: driftRuns.map(run => `${run.label} after/reanalysis profile differs without a large score drop`),
      recommendedNext: 'attribute profile drift before behavior promotion',
    };
  }

  if (present.some(run => (run.reanalyzedScore ?? run.afterScore ?? 0) < input.targetScore)) {
    return {
      classification: 'stable_low_reanalysis_verified',
      reasons: ['selected row remains low and after/reanalysis profiles are stable enough in provided runs'],
      recommendedNext: 'move to row failure-shape diagnostic with controls or park no-safe-general-fix',
    };
  }

  return {
    classification: 'no_behavior_ready',
    reasons: ['no behavior-ready final-reanalysis evidence found'],
    recommendedNext: 'park or collect more evidence',
  };
}

function countClasses(rows: FinalReanalysisVarianceRow[]): Record<FinalReanalysisVarianceClass, number> {
  const out = Object.fromEntries(CLASSES.map(item => [item, 0])) as Record<FinalReanalysisVarianceClass, number>;
  for (const row of rows) out[row.classification] = (out[row.classification] ?? 0) + 1;
  return out;
}

function decide(rows: FinalReanalysisVarianceRow[]): FinalReanalysisVarianceDiagnostic['decision'] {
  const counts = countClasses(rows);
  if (rows.length > 0 && rows.every(row => row.classification === 'gate_clear')) {
    return {
      status: 'original50_route_ready_for_table_reopen',
      reasons: ['all selected rows are clear'],
      nextLane: 'reopen_strict_object_backed_table_lanes',
    };
  }
  const variance = counts.after_to_reanalysis_score_drop + counts.after_to_reanalysis_profile_drift + counts.repeat_reanalysis_variance;
  if (variance > 0) {
    return {
      status: 'diagnose_final_reanalysis_analyzer_variance_before_behavior',
      reasons: [`${variance} selected row(s) have final reanalysis/analyzer variance`],
      nextLane: 'native_final_reanalysis_or_analyzer_repeat_stability',
    };
  }
  if (counts.missing_required_payload > 0) {
    return {
      status: 'collect_reanalysis_payload',
      reasons: ['selected rows need existing remediation JSON with reanalysis payloads'],
      nextLane: 'focused_deterministic_repeat_no_semantic_no_pdfs',
    };
  }
  if (counts.stable_low_reanalysis_verified > 0) {
    return {
      status: 'move_to_row_failure_shape_or_park',
      reasons: ['selected rows are low without final analyzer variance in provided runs'],
      nextLane: 'row_failure_shape_diagnostic_with_controls',
    };
  }
  return {
    status: 'no_behavior_ready',
    reasons: ['no selected row has behavior-ready evidence'],
    nextLane: 'park_or_collect_more_evidence',
  };
}

export async function loadRun(input: { label: string; path: string }): Promise<RunInput> {
  const runDir = resolve(input.path);
  const remediatePath = join(runDir, 'remediate.results.json');
  const rows = await readJson<RemediateRow[]>(remediatePath);
  return {
    label: input.label,
    runDir,
    remediatePath,
    rows: mapRows(rows.map(normalizeRow)),
  };
}

export function buildFinalReanalysisVarianceDiagnostic(input: {
  generatedAt?: string;
  outDir: string;
  runs: RunInput[];
  rows?: string[];
  targetScore?: number;
}): FinalReanalysisVarianceDiagnostic {
  const targetScore = input.targetScore ?? DEFAULT_TARGET_SCORE;
  const selectors = input.rows ?? [];
  const keys = new Set<string>();
  for (const run of input.runs) {
    for (const row of run.rows.values()) {
      if (rowMatches(row.key, row.file, selectors)) keys.add(row.key);
    }
  }

  const rows = [...keys].sort((a, b) => a.localeCompare(b)).map(key => {
    const runSummaries = input.runs.map(run => summarizeRun(run, key));
    const present = runSummaries.filter(run => run.present && typeof run.reanalyzedScore === 'number');
    const scores = present.map(run => run.reanalyzedScore as number);
    const repeatReanalysisScoreDelta = scores.length >= 2 ? Math.max(...scores) - Math.min(...scores) : null;
    const repeatReanalysisCategoryDeltas = repeatDeltas(runSummaries, run => run.reanalyzedCategories, 4);
    const repeatReanalysisSignalDeltas = repeatDeltas(runSummaries, run => run.reanalyzedSignals, 1);
    const classified = classifyRow({
      runs: runSummaries,
      repeatReanalysisScoreDelta,
      repeatReanalysisCategoryDeltas,
      repeatReanalysisSignalDeltas,
      targetScore,
    });
    return {
      key,
      file: input.runs.find(run => run.rows.get(key))?.rows.get(key)?.file ?? key,
      runs: runSummaries,
      repeatReanalysisScoreDelta,
      repeatReanalysisCategoryDeltas,
      repeatReanalysisSignalDeltas,
      ...classified,
    };
  });

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    outDir: input.outDir,
    targetScore,
    inputs: input.runs.map(run => ({ label: run.label, runDir: run.runDir, remediatePath: run.remediatePath })),
    summary: {
      rowCount: rows.length,
      blockerCount: rows.filter(row => row.classification !== 'gate_clear').length,
      byClass: countClasses(rows),
    },
    decision: decide(rows),
    rows,
  };
}

function formatScore(score: number | null, grade: string | null): string {
  return `${score ?? 'n/a'}${grade ? `/${grade}` : ''}`;
}

function formatDeltaSummary(deltas: DeltaValue[], limit = 5): string {
  if (deltas.length === 0) return 'none';
  return deltas.slice(0, limit).map(delta => `${delta.key} ${delta.left}->${delta.right}`).join(', ');
}

function formatTools(tools: NormalizedTool[]): string {
  if (tools.length === 0) return 'none';
  return tools.map(tool => `${tool.stage ?? '?'}:${tool.toolName}:${tool.outcome}${tool.pacRegressions.length ? `[${tool.pacRegressions.join(';')}]` : ''}`).join('<br>');
}

export function renderFinalReanalysisVarianceMarkdown(diagnostic: FinalReanalysisVarianceDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Original-50 Final Reanalysis Variance Diagnostic');
  lines.push('');
  lines.push(`Generated: ${diagnostic.generatedAt}`);
  lines.push(`Target score: ${diagnostic.targetScore}`);
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  lines.push(`Decision: \`${diagnostic.decision.status}\``);
  lines.push(`Next lane: \`${diagnostic.decision.nextLane}\``);
  for (const reason of diagnostic.decision.reasons) lines.push(`- ${reason}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`Rows: ${diagnostic.summary.rowCount}`);
  lines.push(`Blockers: ${diagnostic.summary.blockerCount}`);
  lines.push('');
  lines.push('| Class | Count |');
  lines.push('| --- | ---: |');
  for (const klass of CLASSES) lines.push(`| \`${klass}\` | ${diagnostic.summary.byClass[klass]} |`);
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push('| Row | Runs | Class | Repeat Final Delta | Final Category Deltas | Final Signal Deltas |');
  lines.push('| --- | --- | --- | ---: | --- | --- |');
  for (const row of diagnostic.rows) {
    const runs = row.runs.filter(run => run.present).map(run => `${run.label}:${formatScore(run.afterScore, run.afterGrade)}->${formatScore(run.reanalyzedScore, run.reanalyzedGrade)}`).join(', ');
    lines.push(`| \`${row.key}\` | ${runs || 'missing'} | \`${row.classification}\` | ${row.repeatReanalysisScoreDelta ?? 'n/a'} | ${formatDeltaSummary(row.repeatReanalysisCategoryDeltas, 3)} | ${formatDeltaSummary(row.repeatReanalysisSignalDeltas, 3)} |`);
  }

  for (const row of diagnostic.rows) {
    lines.push('');
    lines.push(`### ${row.key}`);
    lines.push('');
    lines.push(`File: \`${row.file}\``);
    lines.push(`Classification: \`${row.classification}\``);
    lines.push(`Recommended next: \`${row.recommendedNext}\``);
    for (const reason of row.reasons) lines.push(`- ${reason}`);
    lines.push('');
    lines.push('| Run | Before | After | Reanalyzed | Runtime ms | After->Reanalysis Categories | After->Reanalysis Signals | PAC Families | First Tools |');
    lines.push('| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |');
    for (const run of row.runs.filter(item => item.present)) {
      lines.push(`| ${run.label} | ${run.beforeScore ?? 'n/a'} | ${formatScore(run.afterScore, run.afterGrade)} | ${formatScore(run.reanalyzedScore, run.reanalyzedGrade)} | ${run.wallMs ?? 'n/a'} | ${formatDeltaSummary(run.categoryDeltasAfterToReanalysis)} | ${formatDeltaSummary(run.signalDeltasAfterToReanalysis)} | ${run.pacRegressionFamilies.join(', ') || 'none'} | ${formatTools(run.firstTools)} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function writeFinalReanalysisVarianceDiagnostic(args: Args): Promise<FinalReanalysisVarianceDiagnostic> {
  const runs = await Promise.all(args.runs.map(loadRun));
  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const diagnostic = buildFinalReanalysisVarianceDiagnostic({
    outDir,
    runs,
    rows: args.rows,
    targetScore: args.targetScore,
  });
  await writeFile(join(outDir, 'original50-final-reanalysis-variance-diagnostic.json'), JSON.stringify(diagnostic, null, 2), 'utf8');
  await writeFile(join(outDir, 'original50-final-reanalysis-variance-diagnostic.md'), renderFinalReanalysisVarianceMarkdown(diagnostic), 'utf8');
  return diagnostic;
}

async function main() {
  const args = parseArgs();
  const diagnostic = await writeFinalReanalysisVarianceDiagnostic(args);
  console.log(`Wrote ${join(resolve(args.outDir), 'original50-final-reanalysis-variance-diagnostic.md')}`);
  console.log(`Decision: ${diagnostic.decision.status}`);
  console.log(`Rows: ${diagnostic.summary.rowCount}; blockers: ${diagnostic.summary.blockerCount}`);
}

const isMain = process.argv[1] ? basename(process.argv[1]) === 'original50-final-reanalysis-variance-diagnostic.ts' : false;
if (isMain) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
