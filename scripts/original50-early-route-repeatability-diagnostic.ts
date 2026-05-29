#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const DEFAULT_TARGET_SCORE = 93;

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

const COMMITTED_OUTCOMES = new Set(['applied', 'no_effect']);

export type Original50EarlyRouteClass =
  | 'gate_clear'
  | 'initial_analysis_variance'
  | 'metadata_stage_route_variance'
  | 'early_structural_route_variance'
  | 'mixed_figure_table_route_variance'
  | 'figure_alt_route_blocker'
  | 'table_header_route_blocker'
  | 'no_high_reference'
  | 'no_behavior_ready';

export type Original50EarlyRouteDecision =
  | 'original50_route_ready_for_table_reopen'
  | 'diagnose_early_route_variance_before_behavior'
  | 'plan_family_specific_side_effect_probe'
  | 'collect_higher_reference_or_repeat'
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
  round?: number | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  durationMs?: number | null;
  details?: unknown;
}

interface BaselineRow {
  id?: string;
  file?: string;
  filename?: string;
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
  toolName: string;
  outcome: string;
  stage: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  durationMs: number | null;
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

export interface Original50AttemptSummary {
  attemptCount: number;
  appliedCount: number;
  rejectedCount: number;
  noEffectCount: number;
  noGainCount: number;
  pacRegressionCount: number;
  targets: string[];
  tools: string[];
}

export interface Original50EarlyRunSummary {
  label: string;
  path: string;
  present: boolean;
  score: number | null;
  grade: string | null;
  durationMs: number | null;
  falsePositiveApplied: number;
  categories: Record<string, number>;
  firstStateSignature: string | null;
  firstCommittedStateSignature: string | null;
  firstCommittedStage: number | null;
  metadataDecisionKey: string;
  earlyDecisionKey: string;
  lowCategories: string[];
  pacRegressions: string[];
  figureAttempts: Original50AttemptSummary;
  tableAttempts: Original50AttemptSummary;
  headingAttempts: Original50AttemptSummary;
  annotationAttempts: Original50AttemptSummary;
  firstEvents: Array<{
    index: number;
    stage: number | null;
    toolName: string;
    outcome: string;
    scoreBefore: number | null;
    scoreAfter: number | null;
    family: string;
    note: string | null;
    targetRef: string | null;
    stateSignatureBefore: string | null;
    stateSignatureAfter: string | null;
    pacRegressions: string[];
  }>;
}

export interface Original50EarlyRouteRow {
  key: string;
  file: string;
  gate: Original50EarlyRunSummary;
  references: Original50EarlyRunSummary[];
  bestReferenceLabel: string | null;
  bestReferenceScore: number | null;
  scoreSpread: number | null;
  gateDropFromBest: number | null;
  initialSignatureStableWithBest: boolean | null;
  metadataDecisionStableWithBest: boolean | null;
  earlyDecisionStableWithBest: boolean | null;
  firstDivergenceWithBest: {
    index: number;
    stage: number | null;
    gate: string | null;
    reference: string | null;
  } | null;
  majorCategoryDrops: Array<{ key: string; referenceScore: number; gateScore: number; delta: number }>;
  classification: Original50EarlyRouteClass;
  reasons: string[];
  recommendedNext: string;
}

export interface Original50EarlyRouteDiagnostic {
  generatedAt: string;
  outDir: string;
  targetScore: number;
  inputs: {
    gate: string;
    references: Array<{ label: string; path: string }>;
  };
  summary: {
    rowCount: number;
    blockerCount: number;
    byClass: Record<Original50EarlyRouteClass, number>;
  };
  decision: {
    status: Original50EarlyRouteDecision;
    reasons: string[];
    nextLane: string;
  };
  rows: Original50EarlyRouteRow[];
}

interface Args {
  gate: string;
  references: Array<{ label: string; path: string }>;
  rows: string[];
  outDir: string;
  targetScore: number;
}

const CLASSES: Original50EarlyRouteClass[] = [
  'gate_clear',
  'initial_analysis_variance',
  'metadata_stage_route_variance',
  'early_structural_route_variance',
  'mixed_figure_table_route_variance',
  'figure_alt_route_blocker',
  'table_header_route_blocker',
  'no_high_reference',
  'no_behavior_ready',
];

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original50-early-route-repeatability-diagnostic.ts --gate <baseline_report.json|remediate.results.json> [options]

Options:
  --gate <json>                       Current low/gate report.
  --reference <label=json>            Reference/focused repeat report. Repeatable.
  --row <id-or-substring>             Row key to include. Repeatable. Defaults to low gate rows and referenced rows.
  --out <dir>                         Output directory.
  --target-score <n>                  Target score for blocker/high-reference classification. Default: ${DEFAULT_TARGET_SCORE}.
  --help                              Show this help.

This script reads existing JSON only. It does not analyze PDFs, remediate PDFs, write remediated PDFs, or call ODL/PAC/POC/Java/LLM.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  let gate = '';
  const references: Array<{ label: string; path: string }> = [];
  const rows: string[] = [];
  let outDir = join(DEFAULT_OUT_ROOT, `original50-early-route-repeatability-diagnostic-${timestampSlug(now)}`);
  let targetScore = DEFAULT_TARGET_SCORE;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--gate') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --gate value\n${usage()}`);
      gate = resolve(value);
      continue;
    }
    if (arg === '--reference') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --reference value\n${usage()}`);
      const split = value.indexOf('=');
      if (split <= 0) throw new Error(`Invalid --reference "${value}", expected label=path\n${usage()}`);
      references.push({ label: value.slice(0, split), path: resolve(value.slice(split + 1)) });
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

  if (!gate) throw new Error(`--gate is required\n${usage()}`);
  return { gate, references, rows, outDir, targetScore };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
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

function numericMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(asObject(value))) {
    if (typeof item === 'number' && Number.isFinite(item)) out[key] = item;
  }
  return out;
}

function signalMap(value: unknown): Record<string, number | boolean | string | null> {
  const out: Record<string, number | boolean | string | null> = {};
  for (const [key, item] of Object.entries(asObject(value))) {
    if (typeof item === 'number' || typeof item === 'boolean' || typeof item === 'string' || item === null) out[key] = item;
  }
  return out;
}

function rowFile(row: BaselineRow): string {
  return row.file ?? row.filename ?? row.id ?? '';
}

function rowKey(row: BaselineRow): string {
  const file = rowFile(row);
  const match = file.match(/\b(\d{4})\b/);
  return match?.[1] ?? row.id ?? basename(file).replace(/\.pdf$/i, '');
}

function categories(row: BaselineRow): Record<string, number> {
  const list = row.categoryGap?.after
    ?? row.reanalyzedCategories
    ?? row.afterCategories
    ?? row.categoriesAfter
    ?? row.afterCategoryScores
    ?? row.reanalyzedCategoryScores
    ?? [];
  const out: Record<string, number> = {};
  for (const category of list) {
    if (category.applicable === false) continue;
    if (typeof category.key === 'string' && typeof category.score === 'number') out[category.key] = category.score;
  }
  return out;
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
  const note = asString(parsed.note) ?? asString(parsed.raw) ?? asString(parsed.reason) ?? asString(parsed.outcome);
  return {
    note,
    targetRef: asString(replay.targetRef) ?? asString(invariants.targetRef) ?? asString(invariants.structRef),
    stateSignatureBefore: asString(replay.stateSignatureBefore),
    stateSignatureAfter: asString(replay.stateSignatureAfter),
    scoreBefore: asNumber(replay.scoreBefore),
    scoreAfter: asNumber(replay.scoreAfter),
    categoryScoresBefore: numericMap(replay.categoryScoresBefore),
    categoryScoresAfter: numericMap(replay.categoryScoresAfter),
    detectionSignalsBefore: signalMap(replay.detectionSignalsBefore),
    detectionSignalsAfter: signalMap(replay.detectionSignalsAfter),
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

function normalizeTool(tool: AppliedTool): NormalizedTool {
  const parsed = parseDetails(tool.details);
  const toolName = tool.toolName ?? 'unknown';
  const stage = asNumber(tool.stage);
  return {
    ...parsed,
    toolName,
    outcome: tool.outcome ?? 'unknown',
    stage,
    scoreBefore: parsed.scoreBefore ?? asNumber(tool.scoreBefore),
    scoreAfter: parsed.scoreAfter ?? asNumber(tool.scoreAfter),
    durationMs: asNumber(tool.durationMs),
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
    categories: categories(row),
    tools: (row.appliedTools ?? []).map(normalizeTool),
  };
}

function rowMatches(row: NormalizedRow, selectors: string[]): boolean {
  if (selectors.length === 0) return true;
  const text = `${row.key} ${row.file}`.toLowerCase();
  return selectors.some(selector => text.includes(selector.toLowerCase()));
}

function rowMap(report: BaselineReport): Map<string, NormalizedRow> {
  return new Map(rowsOf(report).map(row => {
    const normalized = normalizeRow(row);
    return [normalized.key, normalized];
  }));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function lowCategories(categories: Record<string, number>, threshold = 90): string[] {
  return Object.entries(categories)
    .filter(([, score]) => score < threshold)
    .map(([key, score]) => `${key}=${score}`)
    .sort((a, b) => a.localeCompare(b));
}

function attemptSummary(tools: NormalizedTool[], family: NormalizedTool['family']): Original50AttemptSummary {
  const matching = tools.filter(tool => tool.family === family);
  return {
    attemptCount: matching.length,
    appliedCount: matching.filter(tool => tool.outcome === 'applied').length,
    rejectedCount: matching.filter(tool => tool.outcome === 'rejected').length,
    noEffectCount: matching.filter(tool => tool.outcome === 'no_effect').length,
    noGainCount: matching.filter(tool => (tool.scoreAfter ?? -Infinity) <= (tool.scoreBefore ?? -Infinity)).length,
    pacRegressionCount: matching.filter(tool => tool.pacRegressions.length > 0 || tool.stageRegressions.length > 0).length,
    targets: uniqueSorted(matching.map(tool => tool.targetRef ?? '')),
    tools: uniqueSorted(matching.map(tool => `${tool.toolName}:${tool.outcome}`)),
  };
}

function eventKey(tool: NormalizedTool): string {
  return [
    tool.stage ?? 'n/a',
    tool.toolName,
    tool.outcome,
    `${tool.scoreBefore ?? 'n/a'}->${tool.scoreAfter ?? 'n/a'}`,
    tool.stateSignatureBefore ?? 'no-before',
    tool.stateSignatureAfter ?? 'no-after',
    tool.targetRef ?? 'no-target',
    tool.pacRegressions.join(',') || 'no-pac',
    tool.stageRegressions.join(',') || 'no-stage-regression',
    tool.note ?? 'no-note',
  ].join('|');
}

function decisionKey(tools: NormalizedTool[], predicate: (tool: NormalizedTool) => boolean): string {
  return tools
    .filter(predicate)
    .map(tool => [
      tool.stage ?? 'n/a',
      tool.toolName,
      tool.outcome,
      `${tool.scoreBefore ?? 'n/a'}->${tool.scoreAfter ?? 'n/a'}`,
      tool.note ?? '',
      tool.pacRegressions.join(','),
      tool.stageRegressions.join(','),
    ].join(':'))
    .join(' || ');
}

function summarizeRun(label: string, path: string, row: NormalizedRow | null): Original50EarlyRunSummary {
  if (!row) {
    return {
      label,
      path,
      present: false,
      score: null,
      grade: null,
      durationMs: null,
      falsePositiveApplied: 0,
      categories: {},
      firstStateSignature: null,
      firstCommittedStateSignature: null,
      firstCommittedStage: null,
      metadataDecisionKey: '',
      earlyDecisionKey: '',
      lowCategories: [],
      pacRegressions: [],
      figureAttempts: attemptSummary([], 'figure'),
      tableAttempts: attemptSummary([], 'table'),
      headingAttempts: attemptSummary([], 'heading'),
      annotationAttempts: attemptSummary([], 'annotation'),
      firstEvents: [],
    };
  }
  const firstState = row.tools.find(tool => tool.stateSignatureBefore || tool.stateSignatureAfter);
  const firstCommitted = row.tools.find(tool => COMMITTED_OUTCOMES.has(tool.outcome) && (tool.stateSignatureBefore || tool.stateSignatureAfter));
  return {
    label,
    path,
    present: true,
    score: row.score,
    grade: row.grade,
    durationMs: row.durationMs,
    falsePositiveApplied: row.falsePositiveApplied,
    categories: row.categories,
    firstStateSignature: firstState?.stateSignatureBefore ?? firstState?.stateSignatureAfter ?? null,
    firstCommittedStateSignature: firstCommitted?.stateSignatureAfter ?? firstCommitted?.stateSignatureBefore ?? null,
    firstCommittedStage: firstCommitted?.stage ?? null,
    metadataDecisionKey: decisionKey(row.tools, tool => tool.family === 'metadata' && (tool.stage ?? 99) <= 1),
    earlyDecisionKey: decisionKey(row.tools, tool => (tool.stage ?? 99) <= 4),
    lowCategories: lowCategories(row.categories),
    pacRegressions: uniqueSorted(row.tools.flatMap(tool => [...tool.pacRegressions, ...tool.stageRegressions])),
    figureAttempts: attemptSummary(row.tools, 'figure'),
    tableAttempts: attemptSummary(row.tools, 'table'),
    headingAttempts: attemptSummary(row.tools, 'heading'),
    annotationAttempts: attemptSummary(row.tools, 'annotation'),
    firstEvents: row.tools.slice(0, 14).map((tool, index) => ({
      index,
      stage: tool.stage,
      toolName: tool.toolName,
      outcome: tool.outcome,
      scoreBefore: tool.scoreBefore,
      scoreAfter: tool.scoreAfter,
      family: tool.family,
      note: tool.note,
      targetRef: tool.targetRef,
      stateSignatureBefore: tool.stateSignatureBefore,
      stateSignatureAfter: tool.stateSignatureAfter,
      pacRegressions: uniqueSorted([...tool.pacRegressions, ...tool.stageRegressions]),
    })),
  };
}

function selectBestReference(references: Original50EarlyRunSummary[]): Original50EarlyRunSummary | null {
  const present = references.filter(reference => reference.present && reference.score !== null);
  if (present.length === 0) return null;
  return [...present].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0] ?? null;
}

function scoreSpread(gate: Original50EarlyRunSummary, references: Original50EarlyRunSummary[]): number | null {
  const scores = [gate.score, ...references.map(reference => reference.score)].filter((score): score is number => typeof score === 'number');
  if (scores.length < 2) return null;
  return Math.max(...scores) - Math.min(...scores);
}

function majorCategoryDrops(gate: Original50EarlyRunSummary, best: Original50EarlyRunSummary | null): Array<{ key: string; referenceScore: number; gateScore: number; delta: number }> {
  if (!best) return [];
  const out: Array<{ key: string; referenceScore: number; gateScore: number; delta: number }> = [];
  for (const [key, referenceScore] of Object.entries(best.categories)) {
    const gateScore = gate.categories[key];
    if (typeof gateScore !== 'number') continue;
    const delta = referenceScore - gateScore;
    if (delta >= 15) out.push({ key, referenceScore, gateScore, delta });
  }
  return out.sort((a, b) => b.delta - a.delta || a.key.localeCompare(b.key));
}

function firstDivergence(gate: NormalizedRow | null, reference: NormalizedRow | null): Original50EarlyRouteRow['firstDivergenceWithBest'] {
  if (!gate || !reference) return null;
  const max = Math.max(gate.tools.length, reference.tools.length);
  for (let index = 0; index < max; index += 1) {
    const gateTool = gate.tools[index] ?? null;
    const refTool = reference.tools[index] ?? null;
    const gateKey = gateTool ? eventKey(gateTool) : null;
    const refKey = refTool ? eventKey(refTool) : null;
    if (gateKey !== refKey) {
      return {
        index,
        stage: gateTool?.stage ?? refTool?.stage ?? null,
        gate: gateKey,
        reference: refKey,
      };
    }
  }
  return null;
}

function familyEvidence(run: Original50EarlyRunSummary, family: 'figure' | 'table'): boolean {
  const summary = family === 'figure' ? run.figureAttempts : run.tableAttempts;
  const categoryLow = family === 'figure' ? (run.categories.alt_text ?? 100) < 90 : (run.categories.table_markup ?? 100) < 90;
  const pacPrefix = family === 'figure' ? 'pdfua.figure.' : 'pdfua.table.';
  return categoryLow || summary.rejectedCount > 0 || summary.pacRegressionCount > 0 || run.pacRegressions.some(item => item.startsWith(pacPrefix));
}

function classifyRow(input: {
  gate: Original50EarlyRunSummary;
  bestReference: Original50EarlyRunSummary | null;
  spread: number | null;
  gateDropFromBest: number | null;
  initialStable: boolean | null;
  metadataStable: boolean | null;
  earlyStable: boolean | null;
  divergence: Original50EarlyRouteRow['firstDivergenceWithBest'];
  majorDrops: Array<{ key: string; referenceScore: number; gateScore: number; delta: number }>;
  targetScore: number;
}): { classification: Original50EarlyRouteClass; reasons: string[]; recommendedNext: string } {
  const { gate, bestReference, spread, gateDropFromBest, initialStable, metadataStable, earlyStable, divergence, majorDrops, targetScore } = input;
  const reasons: string[] = [];
  if (!gate.present) {
    return { classification: 'no_behavior_ready', reasons: ['gate row missing'], recommendedNext: 'rerun_current_focus_before_behavior' };
  }
  if ((gate.score ?? -Infinity) >= targetScore) {
    return { classification: 'gate_clear', reasons: [`gate score ${gate.score} >= ${targetScore}`], recommendedNext: 'use_as_control_for_future_table_validation' };
  }
  if (!bestReference || (bestReference.score ?? -Infinity) < targetScore) {
    return { classification: 'no_high_reference', reasons: ['no reference at or above target score'], recommendedNext: 'collect_repeat_or_park_low_row_before_behavior' };
  }

  reasons.push(`best_reference=${bestReference.label}:${bestReference.score}`);
  if (gateDropFromBest !== null) reasons.push(`gate_drop_from_best=${gateDropFromBest}`);
  if (spread !== null) reasons.push(`score_spread=${spread}`);
  if (majorDrops.length > 0) reasons.push(`major_category_drops=${majorDrops.map(drop => `${drop.key}:${drop.referenceScore}->${drop.gateScore}`).join(',')}`);
  if (initialStable === false) {
    return {
      classification: 'initial_analysis_variance',
      reasons: [...reasons, `initial_signature gate=${gate.firstStateSignature ?? 'none'} reference=${bestReference.firstStateSignature ?? 'none'}`],
      recommendedNext: 'compare initial analyzer snapshots and first replay signatures before remediation behavior',
    };
  }
  if (metadataStable === false) {
    return {
      classification: 'metadata_stage_route_variance',
      reasons: [...reasons, 'stage-1 metadata decisions differ before later structural tools'],
      recommendedNext: 'diagnose metadata-stage acceptance/reanalysis drift before table behavior',
    };
  }
  if (earlyStable === false && (divergence?.stage ?? 99) <= 4) {
    return {
      classification: 'early_structural_route_variance',
      reasons: [...reasons, `first_divergence_stage=${divergence?.stage ?? 'n/a'}`],
      recommendedNext: 'compare early structure/heading/table decisions before adding cleanup behavior',
    };
  }

  const figure = familyEvidence(gate, 'figure') || majorDrops.some(drop => drop.key === 'alt_text');
  const table = familyEvidence(gate, 'table') || majorDrops.some(drop => drop.key === 'table_markup');
  if (figure && table) {
    return {
      classification: 'mixed_figure_table_route_variance',
      reasons,
      recommendedNext: 'split figure-alt and table-header side effects with controls before behavior',
    };
  }
  if (figure) {
    return {
      classification: 'figure_alt_route_blocker',
      reasons,
      recommendedNext: 'diagnose checker-visible figure target availability and PAC alt side effects',
    };
  }
  if (table) {
    return {
      classification: 'table_header_route_blocker',
      reasons,
      recommendedNext: 'diagnose table/header target finalization with original controls',
    };
  }
  return {
    classification: 'no_behavior_ready',
    reasons,
    recommendedNext: 'park_or_collect_more_route_repeats',
  };
}

function countClasses(rows: Original50EarlyRouteRow[]): Record<Original50EarlyRouteClass, number> {
  const out = Object.fromEntries(CLASSES.map(klass => [klass, 0])) as Record<Original50EarlyRouteClass, number>;
  for (const row of rows) out[row.classification] = (out[row.classification] ?? 0) + 1;
  return out;
}

function decide(rows: Original50EarlyRouteRow[]): Original50EarlyRouteDiagnostic['decision'] {
  const blockers = rows.filter(row => row.classification !== 'gate_clear');
  const counts = countClasses(rows);
  if (blockers.length === 0) {
    return {
      status: 'original50_route_ready_for_table_reopen',
      reasons: ['all selected rows are at or above target'],
      nextLane: 'reopen_strict_object_backed_table_lanes',
    };
  }
  const early = counts.initial_analysis_variance + counts.metadata_stage_route_variance + counts.early_structural_route_variance;
  if (early > 0) {
    return {
      status: 'diagnose_early_route_variance_before_behavior',
      reasons: [`${early} selected row(s) diverge before a clean family-specific repair point`],
      nextLane: 'initial_analysis_or_metadata_route_stability_probe',
    };
  }
  const family = counts.mixed_figure_table_route_variance + counts.figure_alt_route_blocker + counts.table_header_route_blocker;
  if (family > 0) {
    return {
      status: 'plan_family_specific_side_effect_probe',
      reasons: [`${family} selected row(s) have family-specific route blockers after early route alignment`],
      nextLane: 'targeted_figure_or_table_side_effect_probe_with_controls',
    };
  }
  if (counts.no_high_reference > 0) {
    return {
      status: 'collect_higher_reference_or_repeat',
      reasons: [`${counts.no_high_reference} selected row(s) lack a high reference`],
      nextLane: 'focused_repeat_or_park_low_row',
    };
  }
  return {
    status: 'no_behavior_ready',
    reasons: [`${blockers.length} selected row(s) have no behavior-ready route evidence`],
    nextLane: 'park_or_collect_more_evidence',
  };
}

export function buildOriginal50EarlyRouteDiagnostic(input: {
  generatedAt?: string;
  outDir: string;
  gatePath: string;
  gate: BaselineReport;
  referenceInputs?: Array<{ label: string; path: string; report: BaselineReport }>;
  rows?: string[];
  targetScore?: number;
}): Original50EarlyRouteDiagnostic {
  const targetScore = input.targetScore ?? DEFAULT_TARGET_SCORE;
  const gateRows = rowMap(input.gate);
  const referenceMaps = (input.referenceInputs ?? []).map(reference => ({
    label: reference.label,
    path: reference.path,
    rows: rowMap(reference.report),
  }));
  const selectors = input.rows ?? [];
  const keys = new Set<string>();
  for (const row of gateRows.values()) {
    if (rowMatches(row, selectors) && ((row.score ?? -Infinity) < targetScore || selectors.length > 0)) keys.add(row.key);
  }
  for (const reference of referenceMaps) {
    for (const row of reference.rows.values()) {
      if (rowMatches(row, selectors)) keys.add(row.key);
    }
  }

  const rows: Original50EarlyRouteRow[] = [...keys].sort((a, b) => a.localeCompare(b)).map(key => {
    const gateRow = gateRows.get(key) ?? null;
    const gate = summarizeRun('gate', input.gatePath, gateRow);
    const references = referenceMaps.map(reference => summarizeRun(reference.label, reference.path, reference.rows.get(key) ?? null));
    const best = selectBestReference(references);
    const bestMap = best ? referenceMaps.find(reference => reference.label === best.label) ?? null : null;
    const bestRow = bestMap?.rows.get(key) ?? null;
    const spread = scoreSpread(gate, references);
    const gateDropFromBest = typeof best?.score === 'number' && typeof gate.score === 'number' ? best.score - gate.score : null;
    const initialStable = best ? gate.firstStateSignature !== null && best.firstStateSignature !== null ? gate.firstStateSignature === best.firstStateSignature : null : null;
    const metadataStable = best ? gate.metadataDecisionKey === best.metadataDecisionKey : null;
    const earlyStable = best ? gate.earlyDecisionKey === best.earlyDecisionKey : null;
    const divergence = firstDivergence(gateRow, bestRow);
    const drops = majorCategoryDrops(gate, best);
    const classified = classifyRow({
      gate,
      bestReference: best,
      spread,
      gateDropFromBest,
      initialStable,
      metadataStable,
      earlyStable,
      divergence,
      majorDrops: drops,
      targetScore,
    });
    return {
      key,
      file: gateRow?.file ?? bestRow?.file ?? key,
      gate,
      references,
      bestReferenceLabel: best?.label ?? null,
      bestReferenceScore: best?.score ?? null,
      scoreSpread: spread,
      gateDropFromBest,
      initialSignatureStableWithBest: initialStable,
      metadataDecisionStableWithBest: metadataStable,
      earlyDecisionStableWithBest: earlyStable,
      firstDivergenceWithBest: divergence,
      majorCategoryDrops: drops,
      ...classified,
    };
  });

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    outDir: input.outDir,
    targetScore,
    inputs: {
      gate: input.gatePath,
      references: (input.referenceInputs ?? []).map(reference => ({ label: reference.label, path: reference.path })),
    },
    summary: {
      rowCount: rows.length,
      blockerCount: rows.filter(row => row.classification !== 'gate_clear').length,
      byClass: countClasses(rows),
    },
    decision: decide(rows),
    rows,
  };
}

function formatAttemptSummary(summary: Original50AttemptSummary): string {
  if (summary.attemptCount === 0) return 'none';
  return `${summary.attemptCount} attempts, ${summary.appliedCount} applied, ${summary.rejectedCount} rejected, ${summary.noEffectCount} no_effect, ${summary.noGainCount} no-gain, ${summary.pacRegressionCount} guarded`;
}

export function renderOriginal50EarlyRouteMarkdown(diagnostic: Original50EarlyRouteDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Original-50 Early Route Repeatability Diagnostic');
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
  lines.push('| Row | Gate | Best Ref | Class | Initial | Metadata | Early | First Divergence | Major Drops |');
  lines.push('| --- | ---: | ---: | --- | --- | --- | --- | --- | --- |');
  for (const row of diagnostic.rows) {
    const divergence = row.firstDivergenceWithBest ? `${row.firstDivergenceWithBest.index}/stage ${row.firstDivergenceWithBest.stage ?? 'n/a'}` : 'none';
    const drops = row.majorCategoryDrops.map(drop => `${drop.key} ${drop.referenceScore}->${drop.gateScore}`).join(', ') || 'none';
    lines.push(`| \`${row.key}\` | ${row.gate.score ?? 'n/a'}${row.gate.grade ? `/${row.gate.grade}` : ''} | ${row.bestReferenceScore ?? 'n/a'}${row.bestReferenceLabel ? ` (${row.bestReferenceLabel})` : ''} | \`${row.classification}\` | ${row.initialSignatureStableWithBest === null ? 'n/a' : row.initialSignatureStableWithBest ? 'stable' : 'diff'} | ${row.metadataDecisionStableWithBest === null ? 'n/a' : row.metadataDecisionStableWithBest ? 'stable' : 'diff'} | ${row.earlyDecisionStableWithBest === null ? 'n/a' : row.earlyDecisionStableWithBest ? 'stable' : 'diff'} | ${divergence} | ${drops} |`);
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
    lines.push('Run family summaries:');
    lines.push(`- Gate figure: ${formatAttemptSummary(row.gate.figureAttempts)}`);
    lines.push(`- Gate table: ${formatAttemptSummary(row.gate.tableAttempts)}`);
    lines.push(`- Gate heading: ${formatAttemptSummary(row.gate.headingAttempts)}`);
    lines.push(`- Gate annotation: ${formatAttemptSummary(row.gate.annotationAttempts)}`);
    lines.push('');
    lines.push('First gate events:');
    for (const event of row.gate.firstEvents.slice(0, 10)) {
      const guards = event.pacRegressions.length > 0 ? ` guards=${event.pacRegressions.join(',')}` : '';
      lines.push(`- ${event.index}: stage ${event.stage ?? 'n/a'} \`${event.toolName}\` \`${event.outcome}\` ${event.scoreBefore ?? 'n/a'} -> ${event.scoreAfter ?? 'n/a'}${event.note ? ` note=\`${event.note}\`` : ''}${event.targetRef ? ` target=\`${event.targetRef}\`` : ''}${guards}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function writeOriginal50EarlyRouteDiagnostic(args: Args): Promise<Original50EarlyRouteDiagnostic> {
  const gate = await readJson<BaselineReport>(args.gate);
  const references = await Promise.all(args.references.map(async reference => ({
    ...reference,
    report: await readJson<BaselineReport>(reference.path),
  })));
  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const diagnostic = buildOriginal50EarlyRouteDiagnostic({
    outDir,
    gatePath: resolve(args.gate),
    gate,
    referenceInputs: references,
    rows: args.rows,
    targetScore: args.targetScore,
  });
  await writeFile(join(outDir, 'original50-early-route-repeatability-diagnostic.json'), JSON.stringify(diagnostic, null, 2), 'utf8');
  await writeFile(join(outDir, 'original50-early-route-repeatability-diagnostic.md'), renderOriginal50EarlyRouteMarkdown(diagnostic), 'utf8');
  return diagnostic;
}

async function main() {
  const args = parseArgs();
  const diagnostic = await writeOriginal50EarlyRouteDiagnostic(args);
  console.log(`Wrote ${join(resolve(args.outDir), 'original50-early-route-repeatability-diagnostic.md')}`);
  console.log(`Decision: ${diagnostic.decision.status}`);
  console.log(`Rows: ${diagnostic.summary.rowCount}; blockers: ${diagnostic.summary.blockerCount}`);
}

const isMain = process.argv[1] ? basename(process.argv[1]) === 'original50-early-route-repeatability-diagnostic.ts' : false;
if (isMain) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
