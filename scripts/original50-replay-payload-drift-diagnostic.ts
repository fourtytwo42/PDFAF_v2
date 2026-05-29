#!/usr/bin/env tsx
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const DEFAULT_TARGET_SCORE = 93;

export type ReplayPayloadDriftClass =
  | 'gate_clear'
  | 'replay_payload_count_drift'
  | 'initial_analysis_count_variance'
  | 'metadata_stage_after_state_divergence'
  | 'family_specific_after_stable_route'
  | 'payload_stable_low'
  | 'missing_replay_payload'
  | 'no_behavior_ready';

export type ReplayPayloadDriftDecision =
  | 'original50_route_ready_for_table_reopen'
  | 'diagnose_replay_payload_or_native_analyzer_before_behavior'
  | 'plan_family_specific_side_effect_probe_after_upstream_blockers'
  | 'collect_more_replay_payload'
  | 'no_behavior_ready';

interface CategoryScore {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface AppliedTool {
  toolName?: string;
  outcome?: string;
  stage?: number | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  durationMs?: number | null;
  details?: unknown;
}

interface BaselineRow {
  id?: string;
  file?: string;
  filename?: string;
  beforeScore?: number | null;
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
  categoryGap?: { after?: CategoryScore[] };
  afterCategories?: CategoryScore[];
  reanalyzedCategories?: CategoryScore[];
  categoriesAfter?: CategoryScore[];
  afterCategoryScores?: CategoryScore[];
  reanalyzedCategoryScores?: CategoryScore[];
  appliedTools?: AppliedTool[] | null;
}

type BaselineReport = {
  rows?: BaselineRow[];
  remediateResults?: BaselineRow[];
} | BaselineRow[];

interface ParsedDetails {
  note: string | null;
  targetRef: string | null;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  categoryScoresBefore: Record<string, number>;
  categoryScoresAfter: Record<string, number>;
  detectionSignalsBefore: Record<string, number | boolean | string | null>;
  detectionSignalsAfter: Record<string, number | boolean | string | null>;
  pacRegressions: string[];
  stageRegressions: string[];
}

interface NormalizedTool extends ParsedDetails {
  index: number;
  toolName: string;
  outcome: string;
  stage: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  family: 'metadata' | 'figure' | 'table' | 'heading' | 'annotation' | 'structure' | 'other';
}

interface NormalizedRow {
  key: string;
  file: string;
  score: number | null;
  grade: string | null;
  durationMs: number | null;
  falsePositiveApplied: number;
  categories: Record<string, number>;
  tools: NormalizedTool[];
}

interface ReportInput {
  label: string;
  path: string;
  rows: Map<string, NormalizedRow>;
}

export interface ReplayPayloadEventSummary {
  index: number;
  stage: number | null;
  toolName: string;
  outcome: string;
  family: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  note: string | null;
  targetRef: string | null;
  categoryScoresBefore: Record<string, number>;
  categoryScoresAfter: Record<string, number>;
  detectionSignalsBefore: Record<string, number | boolean | string | null>;
  detectionSignalsAfter: Record<string, number | boolean | string | null>;
  pacRegressions: string[];
  stageRegressions: string[];
}

export interface ReplayPayloadRunSummary {
  label: string;
  path: string;
  present: boolean;
  score: number | null;
  grade: string | null;
  durationMs: number | null;
  falsePositiveApplied: number;
  categories: Record<string, number>;
  firstReplayEvent: ReplayPayloadEventSummary | null;
  firstMetadataEvent: ReplayPayloadEventSummary | null;
  earlyEvents: ReplayPayloadEventSummary[];
}

export interface PayloadDelta {
  key: string;
  values: Array<{ label: string; value: number | boolean | string | null }>;
  numeric: boolean;
  min: number | null;
  max: number | null;
  delta: number | null;
}

export interface ReplayPayloadDriftRow {
  key: string;
  file: string;
  runs: ReplayPayloadRunSummary[];
  lowRunCount: number;
  highRunCount: number;
  lowFirstSignatureCount: number;
  highRunsSharingLowInitialSignature: string[];
  lowFirstBeforeCategoryDeltas: PayloadDelta[];
  lowFirstBeforeDetectionDeltas: PayloadDelta[];
  lowFirstAfterCategoryDeltas: PayloadDelta[];
  lowFirstAfterDetectionDeltas: PayloadDelta[];
  allFirstBeforeCategoryDeltas: PayloadDelta[];
  allFirstBeforeDetectionDeltas: PayloadDelta[];
  classification: ReplayPayloadDriftClass;
  reasons: string[];
  recommendedNext: string;
}

export interface ReplayPayloadDriftDiagnostic {
  generatedAt: string;
  outDir: string;
  targetScore: number;
  inputs: Array<{ label: string; path: string }>;
  summary: {
    rowCount: number;
    blockerCount: number;
    byClass: Record<ReplayPayloadDriftClass, number>;
  };
  decision: {
    status: ReplayPayloadDriftDecision;
    reasons: string[];
    nextLane: string;
  };
  rows: ReplayPayloadDriftRow[];
}

interface Args {
  reports: Array<{ label: string; path: string }>;
  rows: string[];
  outDir: string;
  targetScore: number;
}

const CLASSES: ReplayPayloadDriftClass[] = [
  'gate_clear',
  'replay_payload_count_drift',
  'initial_analysis_count_variance',
  'metadata_stage_after_state_divergence',
  'family_specific_after_stable_route',
  'payload_stable_low',
  'missing_replay_payload',
  'no_behavior_ready',
];

const FIGURE_TOOLS = new Set([
  'canonicalize_figure_alt_ownership',
  'normalize_nested_figure_containers',
  'repair_alt_text_structure',
  'retag_as_figure',
  'set_figure_alt_text',
]);

const TABLE_TOOLS = new Set([
  'normalize_table_structure',
  'repair_native_table_headers',
  'set_table_header_cells',
]);

const HEADING_TOOLS = new Set([
  'create_heading_from_candidate',
  'create_heading_from_tagged_visible_anchor',
  'normalize_heading_hierarchy',
  'repair_degenerate_native_reading_order_shell',
  'repair_native_reading_order',
  'synthesize_basic_structure_from_layout',
]);

const ANNOTATION_TOOLS = new Set([
  'normalize_annotation_tab_order',
  'repair_annotation_alt_text',
  'repair_native_link_structure',
  'set_link_annotation_contents',
  'tag_unowned_annotations',
]);

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original50-replay-payload-drift-diagnostic.ts --report <label=path> [options]

Options:
  --report <label=path>              Run directory or JSON report. Repeatable.
  --row <id-or-substring>            Row key to include. Repeatable. Defaults to rows in reports.
  --out <dir>                        Output directory.
  --target-score <n>                 High-reference target. Default: ${DEFAULT_TARGET_SCORE}.
  --help                             Show this help.

This script reads existing JSON only. It does not analyze PDFs, remediate PDFs, write remediated PDFs, or call ODL/PAC/POC/Java/LLM.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  const reports: Array<{ label: string; path: string }> = [];
  const rows: string[] = [];
  let outDir = join(DEFAULT_OUT_ROOT, `original50-replay-payload-drift-${timestampSlug(now)}`);
  let targetScore = DEFAULT_TARGET_SCORE;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--report') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --report value\n${usage()}`);
      reports.push(parseLabelPath(value, '--report'));
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

  if (reports.length === 0) throw new Error(`At least one --report is required\n${usage()}`);
  return { reports, rows, outDir, targetScore };
}

function parseLabelPath(value: string, flag: string): { label: string; path: string } {
  const split = value.indexOf('=');
  if (split <= 0) throw new Error(`Invalid ${flag} "${value}", expected label=path`);
  return { label: value.slice(0, split), path: resolve(value.slice(split + 1)) };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveReportFile(path: string): Promise<string> {
  const resolved = resolve(path);
  const info = await stat(resolved);
  if (!info.isDirectory()) return resolved;
  const candidates = [
    join(resolved, 'baseline_report.json'),
    join(resolved, 'remediate.results.json'),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error(`No baseline_report.json or remediate.results.json found under ${resolved}`);
}

function rowsOf(report: BaselineReport): BaselineRow[] {
  if (Array.isArray(report)) return report;
  return Array.isArray(report.rows) ? report.rows : Array.isArray(report.remediateResults) ? report.remediateResults : [];
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

function rowCategories(row: BaselineRow): Record<string, number> {
  return categoryMap(
    row.categoryGap?.after
      ?? row.reanalyzedCategories
      ?? row.afterCategories
      ?? row.categoriesAfter
      ?? row.afterCategoryScores
      ?? row.reanalyzedCategoryScores
      ?? [],
  );
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
  const record = asObject(value);
  for (const [key, item] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'number' && Number.isFinite(item)) {
      out[path] = item;
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      Object.assign(out, numericLeafMap(item, path));
    }
  }
  return out;
}

function scalarLeafMap(value: unknown, prefix = ''): Record<string, number | boolean | string | null> {
  const out: Record<string, number | boolean | string | null> = {};
  const record = asObject(value);
  for (const [key, item] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'number' && Number.isFinite(item)) {
      out[path] = item;
    } else if (typeof item === 'boolean' || typeof item === 'string' || item === null) {
      out[path] = item;
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      Object.assign(out, scalarLeafMap(item, path));
    }
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
  for (const match of detailsText(details).matchAll(/post_pass_regressed_score\(([^)]+)\)/g)) {
    if (match[1]) out.add(`post_pass_score:${match[1]}`);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function parseDetails(details: unknown): ParsedDetails {
  const parsed = parsedDetails(details);
  const debug = asObject(parsed.debug);
  const replay = asObject(debug.replayState);
  const invariants = asObject(parsed.invariants);
  return {
    note: asString(parsed.note) ?? asString(parsed.raw) ?? asString(parsed.reason) ?? asString(parsed.outcome),
    targetRef: asString(replay.targetRef) ?? asString(invariants.targetRef) ?? asString(invariants.structRef),
    stateSignatureBefore: asString(replay.stateSignatureBefore),
    stateSignatureAfter: asString(replay.stateSignatureAfter),
    scoreBefore: asNumber(replay.scoreBefore),
    scoreAfter: asNumber(replay.scoreAfter),
    categoryScoresBefore: numericLeafMap(replay.categoryScoresBefore),
    categoryScoresAfter: numericLeafMap(replay.categoryScoresAfter),
    detectionSignalsBefore: scalarLeafMap(replay.detectionSignalsBefore),
    detectionSignalsAfter: scalarLeafMap(replay.detectionSignalsAfter),
    pacRegressions: pacRegressions(details),
    stageRegressions: stageRegressions(details),
  };
}

function toolFamily(toolName: string, stage: number | null): NormalizedTool['family'] {
  if (toolName === 'set_document_language' || toolName === 'set_document_title' || toolName === 'set_pdfua_identification') return 'metadata';
  if (FIGURE_TOOLS.has(toolName)) return 'figure';
  if (TABLE_TOOLS.has(toolName)) return 'table';
  if (HEADING_TOOLS.has(toolName)) return 'heading';
  if (ANNOTATION_TOOLS.has(toolName)) return 'annotation';
  if (toolName === 'remap_orphan_mcids_as_artifacts' || toolName === 'repair_structure_conformance' || toolName === 'artifact_repeating_page_furniture' || toolName === 'mark_untagged_content_as_artifact') return 'structure';
  if (stage === 1 || stage === 10) return 'metadata';
  return 'other';
}

function normalizeTool(tool: AppliedTool, index: number): NormalizedTool {
  const parsed = parseDetails(tool.details);
  const toolName = tool.toolName ?? 'unknown';
  const stage = asNumber(tool.stage);
  return {
    ...parsed,
    index,
    toolName,
    outcome: tool.outcome ?? 'unknown',
    stage,
    scoreBefore: parsed.scoreBefore ?? asNumber(tool.scoreBefore),
    scoreAfter: parsed.scoreAfter ?? asNumber(tool.scoreAfter),
    family: toolFamily(toolName, stage),
  };
}

function normalizeRow(row: BaselineRow): NormalizedRow {
  return {
    key: rowKey(row),
    file: rowFile(row),
    score: asNumber(row.afterScore) ?? asNumber(row.afterDeterministicScore) ?? asNumber(row.reanalyzedScore),
    grade: asString(row.afterGrade) ?? asString(row.afterDeterministicGrade) ?? asString(row.reanalyzedGrade),
    durationMs: asNumber(row.durationMs) ?? asNumber(row.wallRemediateMs),
    falsePositiveApplied: asNumber(row.falsePositiveAppliedCount) ?? asNumber(row.falsePositiveApplied) ?? 0,
    categories: rowCategories(row),
    tools: (row.appliedTools ?? []).map((tool, index) => normalizeTool(tool, index)),
  };
}

function rowMap(report: BaselineReport): Map<string, NormalizedRow> {
  return new Map(rowsOf(report).map(row => {
    const normalized = normalizeRow(row);
    return [normalized.key, normalized];
  }));
}

function rowMatches(key: string, file: string, selectors: string[]): boolean {
  if (selectors.length === 0) return true;
  const text = `${key} ${file}`.toLowerCase();
  return selectors.some(selector => text.includes(selector.toLowerCase()));
}

function hasReplayPayload(tool: NormalizedTool): boolean {
  return Boolean(
    tool.stateSignatureBefore
      || tool.stateSignatureAfter
      || Object.keys(tool.categoryScoresBefore).length > 0
      || Object.keys(tool.categoryScoresAfter).length > 0
      || Object.keys(tool.detectionSignalsBefore).length > 0
      || Object.keys(tool.detectionSignalsAfter).length > 0,
  );
}

function summarizeEvent(tool: NormalizedTool): ReplayPayloadEventSummary {
  return {
    index: tool.index,
    stage: tool.stage,
    toolName: tool.toolName,
    outcome: tool.outcome,
    family: tool.family,
    scoreBefore: tool.scoreBefore,
    scoreAfter: tool.scoreAfter,
    stateSignatureBefore: tool.stateSignatureBefore,
    stateSignatureAfter: tool.stateSignatureAfter,
    note: tool.note,
    targetRef: tool.targetRef,
    categoryScoresBefore: tool.categoryScoresBefore,
    categoryScoresAfter: tool.categoryScoresAfter,
    detectionSignalsBefore: tool.detectionSignalsBefore,
    detectionSignalsAfter: tool.detectionSignalsAfter,
    pacRegressions: tool.pacRegressions,
    stageRegressions: tool.stageRegressions,
  };
}

function summarizeRun(input: ReportInput, key: string): ReplayPayloadRunSummary {
  const row = input.rows.get(key);
  if (!row) {
    return {
      label: input.label,
      path: input.path,
      present: false,
      score: null,
      grade: null,
      durationMs: null,
      falsePositiveApplied: 0,
      categories: {},
      firstReplayEvent: null,
      firstMetadataEvent: null,
      earlyEvents: [],
    };
  }
  const replayTools = row.tools.filter(hasReplayPayload);
  const firstReplay = replayTools[0] ?? null;
  const firstMetadata = replayTools.find(tool => tool.family === 'metadata') ?? null;
  return {
    label: input.label,
    path: input.path,
    present: true,
    score: row.score,
    grade: row.grade,
    durationMs: row.durationMs,
    falsePositiveApplied: row.falsePositiveApplied,
    categories: row.categories,
    firstReplayEvent: firstReplay ? summarizeEvent(firstReplay) : null,
    firstMetadataEvent: firstMetadata ? summarizeEvent(firstMetadata) : null,
    earlyEvents: replayTools.filter(tool => (tool.stage ?? 99) <= 4).slice(0, 8).map(summarizeEvent),
  };
}

function valueKey(value: number | boolean | string | null): string {
  return JSON.stringify(value);
}

function payloadDeltas(
  runs: ReplayPayloadRunSummary[],
  selector: (event: ReplayPayloadEventSummary) => Record<string, number | boolean | string | null>,
): PayloadDelta[] {
  const events = runs.map(run => ({ label: run.label, event: run.firstReplayEvent })).filter(item => item.event);
  const keys = new Set<string>();
  for (const { event } of events) {
    for (const key of Object.keys(selector(event!))) keys.add(key);
  }
  const out: PayloadDelta[] = [];
  for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
    const values = events.map(({ label, event }) => ({ label, value: selector(event!)[key] ?? null }));
    const unique = new Set(values.map(item => valueKey(item.value)));
    if (unique.size <= 1) continue;
    const numeric = values.every(item => typeof item.value === 'number');
    const nums = numeric ? values.map(item => item.value as number) : [];
    out.push({
      key,
      values,
      numeric,
      min: numeric ? Math.min(...nums) : null,
      max: numeric ? Math.max(...nums) : null,
      delta: numeric ? Math.max(...nums) - Math.min(...nums) : null,
    });
  }
  return out;
}

function significantDetectionDelta(deltas: PayloadDelta[], threshold = 1): boolean {
  return deltas.some(delta => delta.numeric && (delta.delta ?? 0) >= threshold);
}

function severeCategoryDelta(deltas: PayloadDelta[], threshold = 10): boolean {
  return deltas.some(delta => delta.numeric && (delta.delta ?? 0) >= threshold);
}

function firstSignature(run: ReplayPayloadRunSummary): string | null {
  return run.firstReplayEvent?.stateSignatureBefore ?? null;
}

function classifyRow(input: {
  lowRuns: ReplayPayloadRunSummary[];
  highRuns: ReplayPayloadRunSummary[];
  lowFirstSignatureCount: number;
  highRunsSharingLowInitialSignature: string[];
  lowFirstBeforeCategoryDeltas: PayloadDelta[];
  lowFirstBeforeDetectionDeltas: PayloadDelta[];
  lowFirstAfterCategoryDeltas: PayloadDelta[];
  lowFirstAfterDetectionDeltas: PayloadDelta[];
  allFirstBeforeCategoryDeltas: PayloadDelta[];
  allFirstBeforeDetectionDeltas: PayloadDelta[];
}): { classification: ReplayPayloadDriftClass; reasons: string[]; recommendedNext: string } {
  const {
    lowRuns,
    highRuns,
    lowFirstSignatureCount,
    highRunsSharingLowInitialSignature,
    lowFirstBeforeCategoryDeltas,
    lowFirstBeforeDetectionDeltas,
    lowFirstAfterCategoryDeltas,
    lowFirstAfterDetectionDeltas,
    allFirstBeforeCategoryDeltas,
    allFirstBeforeDetectionDeltas,
  } = input;
  const reasons: string[] = [];
  if (lowRuns.length === 0) {
    return { classification: 'gate_clear', reasons: ['all present runs are at or above target'], recommendedNext: 'use_as_control_for_future_table_validation' };
  }
  if (lowRuns.some(run => !run.firstReplayEvent)) {
    return { classification: 'missing_replay_payload', reasons: ['at least one low run has no replayState payload'], recommendedNext: 'collect replay-instrumented repeat before behavior' };
  }

  reasons.push(`low_runs=${lowRuns.map(run => `${run.label}:${run.score ?? 'n/a'}`).join(',')}`);
  if (highRuns.length > 0) reasons.push(`high_runs=${highRuns.map(run => `${run.label}:${run.score ?? 'n/a'}`).join(',')}`);
  if (lowFirstSignatureCount > 1) reasons.push(`low_first_signature_count=${lowFirstSignatureCount}`);
  if (highRunsSharingLowInitialSignature.length > 0) reasons.push(`high_runs_sharing_low_initial=${highRunsSharingLowInitialSignature.join(',')}`);
  if (lowFirstBeforeCategoryDeltas.length > 0) reasons.push(`low_before_category_deltas=${formatDeltaKeys(lowFirstBeforeCategoryDeltas)}`);
  if (lowFirstBeforeDetectionDeltas.length > 0) reasons.push(`low_before_detection_deltas=${formatDeltaKeys(lowFirstBeforeDetectionDeltas)}`);
  if (lowFirstAfterCategoryDeltas.length > 0) reasons.push(`low_after_category_deltas=${formatDeltaKeys(lowFirstAfterCategoryDeltas)}`);
  if (lowFirstAfterDetectionDeltas.length > 0) reasons.push(`low_after_detection_deltas=${formatDeltaKeys(lowFirstAfterDetectionDeltas)}`);
  if (allFirstBeforeCategoryDeltas.length > 0) reasons.push(`all_before_category_deltas=${formatDeltaKeys(allFirstBeforeCategoryDeltas)}`);

  const lowOutcomeKeys = new Set(lowRuns.map(run => {
    const event = run.firstReplayEvent;
    return event ? `${event.toolName}:${event.outcome}:${event.scoreBefore ?? 'n/a'}->${event.scoreAfter ?? 'n/a'}` : 'missing';
  }));
  const metadataOutcomeDiverges = lowOutcomeKeys.size > 1 && lowRuns.every(run => run.firstReplayEvent?.family === 'metadata');
  if (
    metadataOutcomeDiverges
    && highRunsSharingLowInitialSignature.length > 0
    && (severeCategoryDelta(lowFirstAfterCategoryDeltas, 4) || significantDetectionDelta(lowFirstAfterDetectionDeltas, 1))
  ) {
    return {
      classification: 'metadata_stage_after_state_divergence',
      reasons,
      recommendedNext: 'diagnose why equivalent metadata-stage replay payloads commit/reject into different after-states before behavior',
    };
  }

  if (severeCategoryDelta(lowFirstBeforeCategoryDeltas, 10)) {
    return {
      classification: 'initial_analysis_count_variance',
      reasons,
      recommendedNext: 'diagnose native analyzer category/count variance before remediation behavior',
    };
  }

  if (
    lowFirstSignatureCount > 1
    && lowFirstBeforeCategoryDeltas.length === 0
    && significantDetectionDelta(lowFirstBeforeDetectionDeltas, 1)
  ) {
    return {
      classification: 'replay_payload_count_drift',
      reasons,
      recommendedNext: 'diagnose replay-state payload count drift before table or figure behavior',
    };
  }

  if (
    highRuns.length > 0
    && highRunsSharingLowInitialSignature.length === 0
    && (severeCategoryDelta(allFirstBeforeCategoryDeltas, 10) || significantDetectionDelta(allFirstBeforeDetectionDeltas, 3))
  ) {
    return {
      classification: 'initial_analysis_count_variance',
      reasons,
      recommendedNext: 'diagnose native analyzer count/drop variance against A-range references before behavior',
    };
  }

  if (highRunsSharingLowInitialSignature.length > 0) {
    return {
      classification: 'family_specific_after_stable_route',
      reasons,
      recommendedNext: 'defer later family-specific side-effect probe until upstream original-50 blockers are fixed or parked',
    };
  }

  if (lowRuns.length > 0 && highRuns.length === 0) {
    return {
      classification: 'payload_stable_low',
      reasons,
      recommendedNext: 'collect A-range reference or park as no-safe-general-fix',
    };
  }

  return {
    classification: 'no_behavior_ready',
    reasons,
    recommendedNext: 'park_or_collect_more_payload_evidence',
  };
}

function countClasses(rows: ReplayPayloadDriftRow[]): Record<ReplayPayloadDriftClass, number> {
  const out = Object.fromEntries(CLASSES.map(item => [item, 0])) as Record<ReplayPayloadDriftClass, number>;
  for (const row of rows) out[row.classification] = (out[row.classification] ?? 0) + 1;
  return out;
}

function decide(rows: ReplayPayloadDriftRow[]): ReplayPayloadDriftDiagnostic['decision'] {
  const counts = countClasses(rows);
  if (rows.length > 0 && rows.every(row => row.classification === 'gate_clear')) {
    return { status: 'original50_route_ready_for_table_reopen', reasons: ['all selected rows are clear'], nextLane: 'reopen_strict_object_backed_table_lanes' };
  }
  const upstream = counts.replay_payload_count_drift + counts.initial_analysis_count_variance + counts.metadata_stage_after_state_divergence;
  if (upstream > 0) {
    return {
      status: 'diagnose_replay_payload_or_native_analyzer_before_behavior',
      reasons: [`${upstream} selected row(s) still have replay/analyzer payload instability`],
      nextLane: 'native_analyzer_count_stability_or_metadata_after_state_attribution',
    };
  }
  if (counts.family_specific_after_stable_route > 0) {
    return {
      status: 'plan_family_specific_side_effect_probe_after_upstream_blockers',
      reasons: [`${counts.family_specific_after_stable_route} selected row(s) have stable initial route with high references`],
      nextLane: 'late_family_specific_side_effect_probe_with_controls',
    };
  }
  if (counts.missing_replay_payload + counts.payload_stable_low > 0) {
    return {
      status: 'collect_more_replay_payload',
      reasons: ['selected rows need replay-instrumented repeats or A-range references'],
      nextLane: 'focused_repeat_or_park_low_row',
    };
  }
  return {
    status: 'no_behavior_ready',
    reasons: ['no selected row has behavior-ready replay payload evidence'],
    nextLane: 'park_or_collect_more_evidence',
  };
}

function formatDeltaKeys(deltas: PayloadDelta[]): string {
  return deltas.map(delta => {
    if (delta.numeric) return `${delta.key}:${delta.min}->${delta.max}`;
    return `${delta.key}:${delta.values.map(item => `${item.label}=${String(item.value)}`).join('/')}`;
  }).join(',');
}

function buildRow(key: string, reports: ReportInput[], targetScore: number): ReplayPayloadDriftRow {
  const runs = reports.map(report => summarizeRun(report, key));
  const presentRuns = runs.filter(run => run.present);
  const lowRuns = presentRuns.filter(run => (run.score ?? -Infinity) < targetScore);
  const highRuns = presentRuns.filter(run => (run.score ?? -Infinity) >= targetScore);
  const lowSignatures = new Set(lowRuns.map(firstSignature).filter(Boolean));
  const highRunsSharingLowInitialSignature = highRuns
    .filter(run => {
      const signature = firstSignature(run);
      return Boolean(signature && lowSignatures.has(signature));
    })
    .map(run => run.label);
  const lowFirstBeforeCategoryDeltas = payloadDeltas(lowRuns, event => event.categoryScoresBefore);
  const lowFirstBeforeDetectionDeltas = payloadDeltas(lowRuns, event => event.detectionSignalsBefore);
  const lowFirstAfterCategoryDeltas = payloadDeltas(lowRuns, event => event.categoryScoresAfter);
  const lowFirstAfterDetectionDeltas = payloadDeltas(lowRuns, event => event.detectionSignalsAfter);
  const allFirstBeforeCategoryDeltas = payloadDeltas(presentRuns, event => event.categoryScoresBefore);
  const allFirstBeforeDetectionDeltas = payloadDeltas(presentRuns, event => event.detectionSignalsBefore);
  const classified = classifyRow({
    lowRuns,
    highRuns,
    lowFirstSignatureCount: lowSignatures.size,
    highRunsSharingLowInitialSignature,
    lowFirstBeforeCategoryDeltas,
    lowFirstBeforeDetectionDeltas,
    lowFirstAfterCategoryDeltas,
    lowFirstAfterDetectionDeltas,
    allFirstBeforeCategoryDeltas,
    allFirstBeforeDetectionDeltas,
  });
  return {
    key,
    file: presentRuns.find(run => run.present)?.label ? (reports.find(report => report.rows.get(key))?.rows.get(key)?.file ?? key) : key,
    runs,
    lowRunCount: lowRuns.length,
    highRunCount: highRuns.length,
    lowFirstSignatureCount: lowSignatures.size,
    highRunsSharingLowInitialSignature,
    lowFirstBeforeCategoryDeltas,
    lowFirstBeforeDetectionDeltas,
    lowFirstAfterCategoryDeltas,
    lowFirstAfterDetectionDeltas,
    allFirstBeforeCategoryDeltas,
    allFirstBeforeDetectionDeltas,
    ...classified,
  };
}

export function buildReplayPayloadDriftDiagnostic(input: {
  generatedAt?: string;
  outDir: string;
  reports: ReportInput[];
  rows?: string[];
  targetScore?: number;
}): ReplayPayloadDriftDiagnostic {
  const targetScore = input.targetScore ?? DEFAULT_TARGET_SCORE;
  const selectors = input.rows ?? [];
  const keys = new Set<string>();
  for (const report of input.reports) {
    for (const row of report.rows.values()) {
      if (rowMatches(row.key, row.file, selectors)) keys.add(row.key);
    }
  }
  const rows = [...keys].sort((a, b) => a.localeCompare(b)).map(key => buildRow(key, input.reports, targetScore));
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    outDir: input.outDir,
    targetScore,
    inputs: input.reports.map(report => ({ label: report.label, path: report.path })),
    summary: {
      rowCount: rows.length,
      blockerCount: rows.filter(row => row.classification !== 'gate_clear').length,
      byClass: countClasses(rows),
    },
    decision: decide(rows),
    rows,
  };
}

function formatRunScore(run: ReplayPayloadRunSummary): string {
  if (!run.present) return 'missing';
  return `${run.score ?? 'n/a'}${run.grade ? `/${run.grade}` : ''}`;
}

function formatDeltaSummary(deltas: PayloadDelta[], limit = 6): string {
  if (deltas.length === 0) return 'none';
  return deltas.slice(0, limit).map(delta => {
    if (delta.numeric) return `${delta.key} ${delta.min}->${delta.max}`;
    return `${delta.key} varied`;
  }).join(', ');
}

function formatEvent(event: ReplayPayloadEventSummary | null): string {
  if (!event) return 'none';
  const guards = [...event.pacRegressions, ...event.stageRegressions].join(',') || 'none';
  return `stage ${event.stage ?? 'n/a'} ${event.toolName}:${event.outcome} ${event.scoreBefore ?? 'n/a'}->${event.scoreAfter ?? 'n/a'} sig=${event.stateSignatureBefore ?? 'none'} guards=${guards}`;
}

export function renderReplayPayloadDriftMarkdown(diagnostic: ReplayPayloadDriftDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Original-50 Replay Payload Drift Diagnostic');
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
  lines.push('| Row | Scores | Class | Low Initial Sigs | High Sharing Low Initial | Low Before Deltas | Low After Deltas |');
  lines.push('| --- | --- | --- | ---: | --- | --- | --- |');
  for (const row of diagnostic.rows) {
    const scores = row.runs.filter(run => run.present).map(run => `${run.label}:${formatRunScore(run)}`).join(', ');
    const beforeDeltas = [
      formatDeltaSummary(row.lowFirstBeforeCategoryDeltas, 3),
      formatDeltaSummary(row.lowFirstBeforeDetectionDeltas, 3),
    ].filter(item => item !== 'none').join('; ') || 'none';
    const afterDeltas = [
      formatDeltaSummary(row.lowFirstAfterCategoryDeltas, 3),
      formatDeltaSummary(row.lowFirstAfterDetectionDeltas, 3),
    ].filter(item => item !== 'none').join('; ') || 'none';
    lines.push(`| \`${row.key}\` | ${scores} | \`${row.classification}\` | ${row.lowFirstSignatureCount} | ${row.highRunsSharingLowInitialSignature.join(', ') || 'none'} | ${beforeDeltas} | ${afterDeltas} |`);
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
    lines.push('| Run | Score | First Replay Event |');
    lines.push('| --- | ---: | --- |');
    for (const run of row.runs.filter(run => run.present)) {
      lines.push(`| ${run.label} | ${formatRunScore(run)} | ${formatEvent(run.firstReplayEvent)} |`);
    }
    lines.push('');
    lines.push(`Low before category deltas: ${formatDeltaSummary(row.lowFirstBeforeCategoryDeltas, 12)}`);
    lines.push(`Low before detection deltas: ${formatDeltaSummary(row.lowFirstBeforeDetectionDeltas, 12)}`);
    lines.push(`Low after category deltas: ${formatDeltaSummary(row.lowFirstAfterCategoryDeltas, 12)}`);
    lines.push(`Low after detection deltas: ${formatDeltaSummary(row.lowFirstAfterDetectionDeltas, 12)}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function loadReport(input: { label: string; path: string }): Promise<ReportInput> {
  const path = await resolveReportFile(input.path);
  const report = await readJson<BaselineReport>(path);
  return {
    label: input.label,
    path,
    rows: rowMap(report),
  };
}

export async function writeReplayPayloadDriftDiagnostic(args: Args): Promise<ReplayPayloadDriftDiagnostic> {
  const reports = await Promise.all(args.reports.map(loadReport));
  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const diagnostic = buildReplayPayloadDriftDiagnostic({
    outDir,
    reports,
    rows: args.rows,
    targetScore: args.targetScore,
  });
  await writeFile(join(outDir, 'original50-replay-payload-drift-diagnostic.json'), JSON.stringify(diagnostic, null, 2), 'utf8');
  await writeFile(join(outDir, 'original50-replay-payload-drift-diagnostic.md'), renderReplayPayloadDriftMarkdown(diagnostic), 'utf8');
  return diagnostic;
}

async function main() {
  const args = parseArgs();
  const diagnostic = await writeReplayPayloadDriftDiagnostic(args);
  console.log(`Wrote ${join(resolve(args.outDir), 'original50-replay-payload-drift-diagnostic.md')}`);
  console.log(`Decision: ${diagnostic.decision.status}`);
  console.log(`Rows: ${diagnostic.summary.rowCount}; blockers: ${diagnostic.summary.blockerCount}`);
}

const isMain = process.argv[1] ? basename(process.argv[1]) === 'original50-replay-payload-drift-diagnostic.ts' : false;
if (isMain) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
