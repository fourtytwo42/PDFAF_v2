#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const DEFAULT_TARGET_SCORE = 93;

export type AnalysisRemediationProvenanceClass =
  | 'gate_clear'
  | 'analysis_to_remediation_initial_variance'
  | 'analysis_repeat_variance'
  | 'remediation_entry_variance'
  | 'stable_low_no_entry_variance'
  | 'missing_required_payload'
  | 'no_behavior_ready';

export type AnalysisRemediationProvenanceDecision =
  | 'original50_route_ready_for_table_reopen'
  | 'diagnose_analyzer_remediation_entry_variance_before_behavior'
  | 'collect_replay_instrumented_repeat_or_park'
  | 'no_behavior_ready';

interface CategoryScore {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface AnalysisRow {
  id?: string;
  file?: string;
  filename?: string;
  score?: number | null;
  grade?: string | null;
  categories?: CategoryScore[];
  detectionProfile?: Record<string, unknown>;
}

interface AppliedTool {
  toolName?: string;
  outcome?: string;
  stage?: number | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  details?: unknown;
}

interface RemediateRow {
  id?: string;
  file?: string;
  filename?: string;
  beforeScore?: number | null;
  beforeGrade?: string | null;
  afterScore?: number | null;
  afterGrade?: string | null;
  afterDeterministicScore?: number | null;
  afterDeterministicGrade?: string | null;
  reanalyzedScore?: number | null;
  reanalyzedGrade?: string | null;
  durationMs?: number | null;
  wallRemediateMs?: number | null;
  falsePositiveApplied?: number | null;
  falsePositiveAppliedCount?: number | null;
  appliedTools?: AppliedTool[] | null;
}

interface ReplayBefore {
  stage: number | null;
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  stateSignatureBefore: string | null;
  categoryScoresBefore: Record<string, number>;
  detectionSignalsBefore: Record<string, number | boolean | string | null>;
  pacRegressions: string[];
  stageRegressions: string[];
}

interface NormalizedAnalysis {
  key: string;
  file: string;
  score: number | null;
  grade: string | null;
  categories: Record<string, number>;
  signals: Record<string, number | boolean | string | null>;
}

interface NormalizedRemediate {
  key: string;
  file: string;
  beforeScore: number | null;
  finalScore: number | null;
  finalGrade: string | null;
  durationMs: number | null;
  falsePositiveApplied: number;
  firstReplayBefore: ReplayBefore | null;
}

interface RunInput {
  label: string;
  runDir: string;
  analyzePath: string;
  remediatePath: string;
  analyze: Map<string, NormalizedAnalysis>;
  remediate: Map<string, NormalizedRemediate>;
}

export interface DeltaValue {
  key: string;
  left: number | boolean | string | null;
  right: number | boolean | string | null;
  delta: number | null;
}

export interface ProvenanceRunSummary {
  label: string;
  runDir: string;
  present: boolean;
  analyzeScore: number | null;
  analyzeGrade: string | null;
  remediationBeforeScore: number | null;
  firstReplayScoreBefore: number | null;
  finalScore: number | null;
  finalGrade: string | null;
  firstTool: string | null;
  firstToolOutcome: string | null;
  firstStateSignatureBefore: string | null;
  falsePositiveApplied: number;
  categoryDeltasAnalyzeToReplay: DeltaValue[];
  signalDeltasAnalyzeToReplay: DeltaValue[];
  analyzeCategories: Record<string, number>;
  replayCategories: Record<string, number>;
  analyzeSignals: Record<string, number | boolean | string | null>;
  replaySignals: Record<string, number | boolean | string | null>;
}

export interface AnalysisRemediationProvenanceRow {
  key: string;
  file: string;
  runs: ProvenanceRunSummary[];
  classification: AnalysisRemediationProvenanceClass;
  reasons: string[];
  recommendedNext: string;
  analyzeRepeatCategoryDeltas: DeltaValue[];
  analyzeRepeatSignalDeltas: DeltaValue[];
  replayRepeatCategoryDeltas: DeltaValue[];
  replayRepeatSignalDeltas: DeltaValue[];
}

export interface AnalysisRemediationProvenanceDiagnostic {
  generatedAt: string;
  outDir: string;
  targetScore: number;
  inputs: Array<{ label: string; runDir: string; analyzePath: string; remediatePath: string }>;
  summary: {
    rowCount: number;
    blockerCount: number;
    byClass: Record<AnalysisRemediationProvenanceClass, number>;
  };
  decision: {
    status: AnalysisRemediationProvenanceDecision;
    reasons: string[];
    nextLane: string;
  };
  rows: AnalysisRemediationProvenanceRow[];
}

interface Args {
  runs: Array<{ label: string; path: string }>;
  rows: string[];
  outDir: string;
  targetScore: number;
}

const CLASSES: AnalysisRemediationProvenanceClass[] = [
  'gate_clear',
  'analysis_to_remediation_initial_variance',
  'analysis_repeat_variance',
  'remediation_entry_variance',
  'stable_low_no_entry_variance',
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
  { key: 'table.irregularTableCount', path: ['tableSignals', 'irregularTableCount'] },
  { key: 'table.stronglyIrregularTableCount', path: ['tableSignals', 'stronglyIrregularTableCount'] },
  { key: 'table.directCellUnderTableCount', path: ['tableSignals', 'directCellUnderTableCount'] },
  { key: 'pdfua.orphanMcidCount', path: ['pdfUaSignals', 'orphanMcidCount'] },
  { key: 'reading.sampledStructurePageOrderDriftCount', path: ['readingOrderSignals', 'sampledStructurePageOrderDriftCount'] },
  { key: 'reading.multiColumnOrderRiskPages', path: ['readingOrderSignals', 'multiColumnOrderRiskPages'] },
];

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original50-analysis-remediation-provenance-diagnostic.ts --run <label=runDir> [options]

Options:
  --run <label=runDir>               Run directory with analyze.results.json and remediate.results.json. Repeatable.
  --row <id-or-substring>            Row key to include. Repeatable. Defaults to rows in runs.
  --out <dir>                        Output directory.
  --target-score <n>                 Gate target score. Default: ${DEFAULT_TARGET_SCORE}.
  --help                             Show this help.

This script reads existing JSON only. It does not analyze PDFs, remediate PDFs, write remediated PDFs, or call ODL/PAC/POC/Java/LLM.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  const runs: Array<{ label: string; path: string }> = [];
  const rows: string[] = [];
  let outDir = join(DEFAULT_OUT_ROOT, `original50-analysis-remediation-provenance-${timestampSlug(now)}`);
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
      runs.push(parseLabelPath(value, '--run'));
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

function parseLabelPath(value: string, flag: string): { label: string; path: string } {
  const split = value.indexOf('=');
  if (split <= 0) throw new Error(`Invalid ${flag} "${value}", expected label=path`);
  return { label: value.slice(0, split), path: resolve(value.slice(split + 1)) };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function rowFile(row: { id?: string; file?: string; filename?: string }): string {
  return row.file ?? row.filename ?? row.id ?? '';
}

function rowKey(row: { id?: string; file?: string; filename?: string }): string {
  const file = rowFile(row);
  const match = file.match(/\b(\d{4})\b/);
  return match?.[1] ?? row.id ?? basename(file).replace(/\.pdf$/i, '');
}

function categoryMap(list: CategoryScore[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const category of list ?? []) {
    if (category.applicable === false) continue;
    if (typeof category.key === 'string' && typeof category.score === 'number') out[category.key] = category.score;
  }
  return out;
}

function getPath(input: unknown, path: string[]): unknown {
  let current = input;
  for (const part of path) {
    const record = asObject(current);
    if (!(part in record)) return null;
    current = record[part];
  }
  return current;
}

function compactSignals(profile: Record<string, unknown> | undefined): Record<string, number | boolean | string | null> {
  const out: Record<string, number | boolean | string | null> = {};
  for (const item of SIGNAL_PATHS) {
    const value = getPath(profile, item.path);
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') out[item.key] = value;
  }
  return out;
}

function parsedDetails(details: unknown): Record<string, unknown> {
  if (typeof details === 'string' && details.trim().startsWith('{')) {
    try {
      return asObject(JSON.parse(details) as unknown);
    } catch {
      return {};
    }
  }
  return asObject(details);
}

function detailsText(details: unknown): string {
  if (typeof details === 'string') return details;
  if (!details) return '';
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function numericLeafMap(value: unknown, prefix = ''): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(asObject(value))) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'number' && Number.isFinite(item)) out[path] = item;
    else if (item && typeof item === 'object' && !Array.isArray(item)) Object.assign(out, numericLeafMap(item, path));
  }
  return out;
}

function scalarLeafMap(value: unknown, prefix = ''): Record<string, number | boolean | string | null> {
  const out: Record<string, number | boolean | string | null> = {};
  for (const [key, item] of Object.entries(asObject(value))) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'number' && Number.isFinite(item)) out[path] = item;
    else if (typeof item === 'boolean' || typeof item === 'string' || item === null) out[path] = item;
    else if (item && typeof item === 'object' && !Array.isArray(item)) Object.assign(out, scalarLeafMap(item, path));
  }
  return out;
}

function pacRegressions(details: unknown): string[] {
  const out = new Set<string>();
  const parsed = parsedDetails(details);
  const single = asObject(parsed.pacRuleRegression);
  if (typeof single.ruleId === 'string') out.add(single.ruleId);
  const many = Array.isArray(parsed.pacRuleRegressions) ? parsed.pacRuleRegressions : [];
  for (const item of many) {
    const rule = asObject(item);
    if (typeof rule.ruleId === 'string') out.add(rule.ruleId);
  }
  for (const match of detailsText(details).matchAll(/pac_rule_regressed\(([^)]+)\)/g)) {
    if (match[1]) out.add(match[1]);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function stageRegressions(details: unknown): string[] {
  const out = new Set<string>();
  for (const match of detailsText(details).matchAll(/stage_regressed_category\(([^)]+)\)/g)) {
    for (const part of match[1]?.split(',') ?? []) {
      const trimmed = part.trim();
      if (trimmed) out.add(trimmed);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function firstReplayBefore(row: RemediateRow): ReplayBefore | null {
  for (const tool of row.appliedTools ?? []) {
    const parsed = parsedDetails(tool.details);
    const replay = asObject(asObject(parsed.debug).replayState);
    if (Object.keys(replay).length === 0) continue;
    return {
      stage: asNumber(tool.stage),
      toolName: tool.toolName ?? 'unknown',
      outcome: tool.outcome ?? 'unknown',
      scoreBefore: asNumber(replay.scoreBefore) ?? asNumber(tool.scoreBefore),
      stateSignatureBefore: asString(replay.stateSignatureBefore),
      categoryScoresBefore: numericLeafMap(replay.categoryScoresBefore),
      detectionSignalsBefore: scalarLeafMap(replay.detectionSignalsBefore),
      pacRegressions: pacRegressions(tool.details),
      stageRegressions: stageRegressions(tool.details),
    };
  }
  return null;
}

function normalizeAnalysis(row: AnalysisRow): NormalizedAnalysis {
  return {
    key: rowKey(row),
    file: rowFile(row),
    score: asNumber(row.score),
    grade: asString(row.grade),
    categories: categoryMap(row.categories),
    signals: compactSignals(row.detectionProfile),
  };
}

function normalizeRemediate(row: RemediateRow): NormalizedRemediate {
  return {
    key: rowKey(row),
    file: rowFile(row),
    beforeScore: asNumber(row.beforeScore),
    finalScore: asNumber(row.reanalyzedScore) ?? asNumber(row.afterScore) ?? asNumber(row.afterDeterministicScore),
    finalGrade: asString(row.reanalyzedGrade) ?? asString(row.afterGrade) ?? asString(row.afterDeterministicGrade),
    durationMs: asNumber(row.durationMs) ?? asNumber(row.wallRemediateMs),
    falsePositiveApplied: asNumber(row.falsePositiveAppliedCount) ?? asNumber(row.falsePositiveApplied) ?? 0,
    firstReplayBefore: firstReplayBefore(row),
  };
}

function mapRows<T extends { key: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map(row => [row.key, row]));
}

function replaySignalKeyToAnalyzeKey(key: string): string {
  const map: Record<string, string> = {
    extractedHeadingCount: 'heading.extractedHeadingCount',
    treeHeadingCount: 'heading.treeHeadingCount',
    headingTreeDepth: 'heading.headingTreeDepth',
    extractedFigureCount: 'figure.extractedFigureCount',
    treeFigureCount: 'figure.treeFigureCount',
    checkerVisibleFigureCount: 'figure.checkerVisibleFigureCount',
    directCellUnderTableCount: 'table.directCellUnderTableCount',
    orphanMcidCount: 'pdfua.orphanMcidCount',
  };
  return map[key] ?? key;
}

function compareMaps(
  left: Record<string, number | boolean | string | null>,
  right: Record<string, number | boolean | string | null>,
  options: { numericThreshold?: number; keyMapper?: (key: string) => string; commonOnly?: boolean } = {},
): DeltaValue[] {
  const numericThreshold = options.numericThreshold ?? 1;
  const remappedRight: Record<string, number | boolean | string | null> = {};
  for (const [key, value] of Object.entries(right)) remappedRight[options.keyMapper?.(key) ?? key] = value;
  const keys = options.commonOnly
    ? new Set(Object.keys(left).filter(key => key in remappedRight))
    : new Set([...Object.keys(left), ...Object.keys(remappedRight)]);
  const out: DeltaValue[] = [];
  for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
    const l = left[key] ?? null;
    const r = remappedRight[key] ?? null;
    if (l === r) continue;
    const numeric = typeof l === 'number' && typeof r === 'number';
    const delta = numeric ? Math.abs(l - r) : null;
    if (numeric && delta !== null && delta < numericThreshold) continue;
    out.push({ key, left: l, right: r, delta });
  }
  return out;
}

function repeatDeltas(
  runs: ProvenanceRunSummary[],
  selector: (run: ProvenanceRunSummary) => Record<string, number | boolean | string | null>,
  numericThreshold = 1,
): DeltaValue[] {
  const maps = runs.filter(run => run.present).map(selector);
  const keys = new Set(maps.flatMap(map => Object.keys(map)));
  const out: DeltaValue[] = [];
  for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
    const values = maps.map(map => map[key] ?? null);
    const unique = new Set(values.map(value => JSON.stringify(value)));
    if (unique.size <= 1) continue;
    const numeric = values.every(value => typeof value === 'number');
    if (numeric) {
      const nums = values as number[];
      const delta = Math.max(...nums) - Math.min(...nums);
      if (delta < numericThreshold) continue;
      out.push({ key, left: Math.min(...nums), right: Math.max(...nums), delta });
    } else {
      out.push({ key, left: values[0] ?? null, right: values.find(value => JSON.stringify(value) !== JSON.stringify(values[0] ?? null)) ?? null, delta: null });
    }
  }
  return out;
}

function summarizeRun(run: RunInput, key: string): ProvenanceRunSummary {
  const analysis = run.analyze.get(key);
  const remediate = run.remediate.get(key);
  const replay = remediate?.firstReplayBefore ?? null;
  return {
    label: run.label,
    runDir: run.runDir,
    present: Boolean(analysis || remediate),
    analyzeScore: analysis?.score ?? null,
    analyzeGrade: analysis?.grade ?? null,
    remediationBeforeScore: remediate?.beforeScore ?? null,
    firstReplayScoreBefore: replay?.scoreBefore ?? null,
    finalScore: remediate?.finalScore ?? null,
    finalGrade: remediate?.finalGrade ?? null,
    firstTool: replay?.toolName ?? null,
    firstToolOutcome: replay?.outcome ?? null,
    firstStateSignatureBefore: replay?.stateSignatureBefore ?? null,
    falsePositiveApplied: remediate?.falsePositiveApplied ?? 0,
    categoryDeltasAnalyzeToReplay: analysis && replay
      ? compareMaps(analysis.categories, replay.categoryScoresBefore, { numericThreshold: 1, commonOnly: true })
      : [],
    signalDeltasAnalyzeToReplay: analysis && replay
      ? compareMaps(analysis.signals, replay.detectionSignalsBefore, { numericThreshold: 1, keyMapper: replaySignalKeyToAnalyzeKey, commonOnly: true })
      : [],
    analyzeCategories: analysis?.categories ?? {},
    replayCategories: replay?.categoryScoresBefore ?? {},
    analyzeSignals: analysis?.signals ?? {},
    replaySignals: replay?.detectionSignalsBefore ?? {},
  };
}

function classifyRow(input: {
  runs: ProvenanceRunSummary[];
  analyzeRepeatCategoryDeltas: DeltaValue[];
  analyzeRepeatSignalDeltas: DeltaValue[];
  replayRepeatCategoryDeltas: DeltaValue[];
  replayRepeatSignalDeltas: DeltaValue[];
  targetScore: number;
}): { classification: AnalysisRemediationProvenanceClass; reasons: string[]; recommendedNext: string } {
  const present = input.runs.filter(run => run.present);
  const low = present.filter(run => (run.finalScore ?? -Infinity) < input.targetScore);
  const reasons: string[] = [];
  if (low.length === 0) {
    return { classification: 'gate_clear', reasons: ['all present runs are at or above target'], recommendedNext: 'use_as_control_for_future_table_validation' };
  }
  if (present.some(run => !run.analyzeScore || !run.firstReplayScoreBefore)) {
    return { classification: 'missing_required_payload', reasons: ['at least one run is missing analyze or first replay payload'], recommendedNext: 'collect complete analyze/remediation run before behavior' };
  }
  const sameRunCategory = present.flatMap(run => run.categoryDeltasAnalyzeToReplay);
  const sameRunSignal = present.flatMap(run => run.signalDeltasAnalyzeToReplay);
  if (sameRunCategory.length > 0) reasons.push(`same_run_category_deltas=${sameRunCategory.slice(0, 8).map(delta => `${delta.key}:${delta.left}->${delta.right}`).join(',')}`);
  if (sameRunSignal.length > 0) reasons.push(`same_run_signal_deltas=${sameRunSignal.slice(0, 8).map(delta => `${delta.key}:${delta.left}->${delta.right}`).join(',')}`);
  if (input.analyzeRepeatCategoryDeltas.length > 0) reasons.push(`analyze_repeat_category_deltas=${formatDeltas(input.analyzeRepeatCategoryDeltas)}`);
  if (input.analyzeRepeatSignalDeltas.length > 0) reasons.push(`analyze_repeat_signal_deltas=${formatDeltas(input.analyzeRepeatSignalDeltas)}`);
  if (input.replayRepeatCategoryDeltas.length > 0) reasons.push(`replay_repeat_category_deltas=${formatDeltas(input.replayRepeatCategoryDeltas)}`);
  if (input.replayRepeatSignalDeltas.length > 0) reasons.push(`replay_repeat_signal_deltas=${formatDeltas(input.replayRepeatSignalDeltas)}`);

  if (sameRunCategory.some(delta => (delta.delta ?? 99) >= 4) || sameRunSignal.length > 0) {
    return {
      classification: 'analysis_to_remediation_initial_variance',
      reasons,
      recommendedNext: 'diagnose why benchmark analyze snapshot and remediation entry snapshot disagree before behavior',
    };
  }
  if (input.analyzeRepeatCategoryDeltas.length > 0 || input.analyzeRepeatSignalDeltas.length > 0) {
    return {
      classification: 'analysis_repeat_variance',
      reasons,
      recommendedNext: 'diagnose native analyzer repeat variance before behavior',
    };
  }
  if (input.replayRepeatCategoryDeltas.length > 0 || input.replayRepeatSignalDeltas.length > 0) {
    return {
      classification: 'remediation_entry_variance',
      reasons,
      recommendedNext: 'diagnose remediation entry reanalysis variance before behavior',
    };
  }
  return {
    classification: 'stable_low_no_entry_variance',
    reasons: reasons.length > 0 ? reasons : ['low rows are stable at analyze/remediation entry'],
    recommendedNext: 'move to row-specific failure-shape diagnostic with controls',
  };
}

function formatDeltas(deltas: DeltaValue[]): string {
  return deltas.slice(0, 8).map(delta => `${delta.key}:${delta.left}->${delta.right}`).join(',');
}

function rowMatches(key: string, file: string, selectors: string[]): boolean {
  if (selectors.length === 0) return true;
  const text = `${key} ${file}`.toLowerCase();
  return selectors.some(selector => text.includes(selector.toLowerCase()));
}

function countClasses(rows: AnalysisRemediationProvenanceRow[]): Record<AnalysisRemediationProvenanceClass, number> {
  const out = Object.fromEntries(CLASSES.map(item => [item, 0])) as Record<AnalysisRemediationProvenanceClass, number>;
  for (const row of rows) out[row.classification] = (out[row.classification] ?? 0) + 1;
  return out;
}

function decide(rows: AnalysisRemediationProvenanceRow[]): AnalysisRemediationProvenanceDiagnostic['decision'] {
  const counts = countClasses(rows);
  if (rows.length > 0 && rows.every(row => row.classification === 'gate_clear')) {
    return { status: 'original50_route_ready_for_table_reopen', reasons: ['all selected rows are clear'], nextLane: 'reopen_strict_object_backed_table_lanes' };
  }
  const variance = counts.analysis_to_remediation_initial_variance + counts.analysis_repeat_variance + counts.remediation_entry_variance;
  if (variance > 0) {
    return {
      status: 'diagnose_analyzer_remediation_entry_variance_before_behavior',
      reasons: [`${variance} selected row(s) have analyzer/remediation entry variance`],
      nextLane: 'native_analyzer_or_remediation_entry_snapshot_stability',
    };
  }
  if (counts.missing_required_payload + counts.stable_low_no_entry_variance > 0) {
    return {
      status: 'collect_replay_instrumented_repeat_or_park',
      reasons: ['selected rows need complete payloads or row-specific parking evidence'],
      nextLane: 'focused_repeat_or_no_safe_general_fix_doc',
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
  const analyzePath = join(runDir, 'analyze.results.json');
  const remediatePath = join(runDir, 'remediate.results.json');
  const [analysisRows, remediateRows] = await Promise.all([
    readJson<AnalysisRow[]>(analyzePath),
    readJson<RemediateRow[]>(remediatePath),
  ]);
  return {
    label: input.label,
    runDir,
    analyzePath,
    remediatePath,
    analyze: mapRows(analysisRows.map(normalizeAnalysis)),
    remediate: mapRows(remediateRows.map(normalizeRemediate)),
  };
}

export function buildAnalysisRemediationProvenanceDiagnostic(input: {
  generatedAt?: string;
  outDir: string;
  runs: RunInput[];
  rows?: string[];
  targetScore?: number;
}): AnalysisRemediationProvenanceDiagnostic {
  const targetScore = input.targetScore ?? DEFAULT_TARGET_SCORE;
  const selectors = input.rows ?? [];
  const keys = new Set<string>();
  for (const run of input.runs) {
    for (const row of run.analyze.values()) {
      if (rowMatches(row.key, row.file, selectors)) keys.add(row.key);
    }
    for (const row of run.remediate.values()) {
      if (rowMatches(row.key, row.file, selectors)) keys.add(row.key);
    }
  }
  const rows = [...keys].sort((a, b) => a.localeCompare(b)).map(key => {
    const runSummaries = input.runs.map(run => summarizeRun(run, key));
    const analyzeRepeatCategoryDeltas = repeatDeltas(runSummaries, run => run.analyzeCategories, 4);
    const analyzeRepeatSignalDeltas = repeatDeltas(runSummaries, run => run.analyzeSignals, 1);
    const replayRepeatCategoryDeltas = repeatDeltas(runSummaries, run => run.replayCategories, 4);
    const replayRepeatSignalDeltas = repeatDeltas(runSummaries, run => {
      const remapped: Record<string, number | boolean | string | null> = {};
      for (const [signalKey, value] of Object.entries(run.replaySignals)) remapped[replaySignalKeyToAnalyzeKey(signalKey)] = value;
      return remapped;
    }, 1);
    const classified = classifyRow({
      runs: runSummaries,
      analyzeRepeatCategoryDeltas,
      analyzeRepeatSignalDeltas,
      replayRepeatCategoryDeltas,
      replayRepeatSignalDeltas,
      targetScore,
    });
    return {
      key,
      file: input.runs.find(run => run.analyze.get(key) || run.remediate.get(key))?.analyze.get(key)?.file
        ?? input.runs.find(run => run.remediate.get(key))?.remediate.get(key)?.file
        ?? key,
      runs: runSummaries,
      analyzeRepeatCategoryDeltas,
      analyzeRepeatSignalDeltas,
      replayRepeatCategoryDeltas,
      replayRepeatSignalDeltas,
      ...classified,
    };
  });
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    outDir: input.outDir,
    targetScore,
    inputs: input.runs.map(run => ({
      label: run.label,
      runDir: run.runDir,
      analyzePath: run.analyzePath,
      remediatePath: run.remediatePath,
    })),
    summary: {
      rowCount: rows.length,
      blockerCount: rows.filter(row => row.classification !== 'gate_clear').length,
      byClass: countClasses(rows),
    },
    decision: decide(rows),
    rows,
  };
}

function formatScore(run: ProvenanceRunSummary): string {
  if (!run.present) return 'missing';
  return `${run.finalScore ?? 'n/a'}${run.finalGrade ? `/${run.finalGrade}` : ''}`;
}

function formatDeltaSummary(deltas: DeltaValue[], limit = 6): string {
  if (deltas.length === 0) return 'none';
  return deltas.slice(0, limit).map(delta => `${delta.key} ${delta.left}->${delta.right}`).join(', ');
}

export function renderAnalysisRemediationProvenanceMarkdown(diagnostic: AnalysisRemediationProvenanceDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Original-50 Analysis/Remediation Provenance Diagnostic');
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
  lines.push('| Row | Final Scores | Class | Analyze Repeat Deltas | Replay Repeat Deltas |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of diagnostic.rows) {
    const scores = row.runs.filter(run => run.present).map(run => `${run.label}:${formatScore(run)}`).join(', ');
    const analyzeDeltas = [
      formatDeltaSummary(row.analyzeRepeatCategoryDeltas, 3),
      formatDeltaSummary(row.analyzeRepeatSignalDeltas, 3),
    ].filter(item => item !== 'none').join('; ') || 'none';
    const replayDeltas = [
      formatDeltaSummary(row.replayRepeatCategoryDeltas, 3),
      formatDeltaSummary(row.replayRepeatSignalDeltas, 3),
    ].filter(item => item !== 'none').join('; ') || 'none';
    lines.push(`| \`${row.key}\` | ${scores} | \`${row.classification}\` | ${analyzeDeltas} | ${replayDeltas} |`);
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
    lines.push('| Run | Analyze | Remediation Before | First Replay | Final | Analyze->Replay Category Deltas | Analyze->Replay Signal Deltas |');
    lines.push('| --- | ---: | ---: | --- | ---: | --- | --- |');
    for (const run of row.runs.filter(item => item.present)) {
      const first = `${run.firstTool ?? 'none'}:${run.firstToolOutcome ?? 'none'}@${run.firstStateSignatureBefore ?? 'no-state'} ${run.firstReplayScoreBefore ?? 'n/a'}`;
      lines.push(`| ${run.label} | ${run.analyzeScore ?? 'n/a'}${run.analyzeGrade ? `/${run.analyzeGrade}` : ''} | ${run.remediationBeforeScore ?? 'n/a'} | ${first} | ${formatScore(run)} | ${formatDeltaSummary(run.categoryDeltasAnalyzeToReplay, 6)} | ${formatDeltaSummary(run.signalDeltasAnalyzeToReplay, 6)} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function writeAnalysisRemediationProvenanceDiagnostic(args: Args): Promise<AnalysisRemediationProvenanceDiagnostic> {
  const runs = await Promise.all(args.runs.map(loadRun));
  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const diagnostic = buildAnalysisRemediationProvenanceDiagnostic({
    outDir,
    runs,
    rows: args.rows,
    targetScore: args.targetScore,
  });
  await writeFile(join(outDir, 'original50-analysis-remediation-provenance-diagnostic.json'), JSON.stringify(diagnostic, null, 2), 'utf8');
  await writeFile(join(outDir, 'original50-analysis-remediation-provenance-diagnostic.md'), renderAnalysisRemediationProvenanceMarkdown(diagnostic), 'utf8');
  return diagnostic;
}

async function main() {
  const args = parseArgs();
  const diagnostic = await writeAnalysisRemediationProvenanceDiagnostic(args);
  console.log(`Wrote ${join(resolve(args.outDir), 'original50-analysis-remediation-provenance-diagnostic.md')}`);
  console.log(`Decision: ${diagnostic.decision.status}`);
  console.log(`Rows: ${diagnostic.summary.rowCount}; blockers: ${diagnostic.summary.blockerCount}`);
}

const isMain = process.argv[1] ? basename(process.argv[1]) === 'original50-analysis-remediation-provenance-diagnostic.ts' : false;
if (isMain) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
