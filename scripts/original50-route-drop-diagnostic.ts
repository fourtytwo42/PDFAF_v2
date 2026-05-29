#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const DEFAULT_TARGET_SCORE = 93;
const DEFAULT_TIMEOUT_MS = 300_000;

export type Original50RouteDropClass =
  | 'gate_clear'
  | 'accepted_low_stable_debt'
  | 'table_control_checkpoint_debt'
  | 'figure_alt_route_drop'
  | 'heading_route_drop'
  | 'table_route_drop'
  | 'mixed_route_drop'
  | 'route_drop_unattributed'
  | 'runtime_tail_only'
  | 'new_gate_drop_requires_repeat'
  | 'no_safe_general_fix';

export type Original50RouteDropDecision =
  | 'original50_gate_ready_for_table_reopen'
  | 'diagnose_non_table_route_volatility_before_table_reopen'
  | 'diagnose_runtime_tail_first'
  | 'park_or_fix_stable_low_debt_before_table_reopen'
  | 'insufficient_current_evidence';

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
  delta?: number | null;
  durationMs?: number | null;
  details?: unknown;
}

interface BaselineRow {
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
  error?: string | null;
  falsePositiveApplied?: number | null;
  falsePositiveAppliedCount?: number | null;
  categoryGap?: { after?: CategoryScore[]; before?: CategoryScore[] };
  categoriesAfter?: CategoryScore[];
  afterCategoryScores?: CategoryScore[];
  reanalyzedCategoryScores?: CategoryScore[];
  appliedTools?: AppliedTool[] | null;
  boundedRunner?: { errorType?: string | null };
}

interface BaselineReport {
  rows?: BaselineRow[];
  remediateResults?: BaselineRow[];
  summary?: {
    meanAfter?: number | null;
    allRowMeanAfter?: number | null;
    falsePositiveApplied?: number | null;
    timeoutOrErrorCount?: number | null;
  };
}

interface NormalizedTool {
  toolName: string;
  outcome: string;
  stage: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  durationMs: number | null;
  reason: string | null;
  targetRef: string | null;
  pacRegressions: string[];
  stateSignatureBefore: string | null;
  stateSignatureAfter: string | null;
  categoryScoresBefore: Record<string, number>;
  categoryScoresAfter: Record<string, number>;
  detectionSignalsBefore: Record<string, number | boolean | string | null>;
  detectionSignalsAfter: Record<string, number | boolean | string | null>;
}

interface NormalizedRow {
  key: string;
  file: string;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  durationMs: number | null;
  error: string | null;
  falsePositiveApplied: number;
  categories: Record<string, number>;
  tools: NormalizedTool[];
}

export interface Original50RouteRunSummary {
  label: string;
  path: string;
  present: boolean;
  score: number | null;
  grade: string | null;
  durationMs: number | null;
  timedOut: boolean;
  nearWall: boolean;
  falsePositiveApplied: number;
  categories: Record<string, number>;
  lowCategories: string[];
  toolOutcomeCounts: Record<string, number>;
  appliedTools: string[];
  rejectedTools: string[];
  pacRegressions: string[];
  stageRegressions: string[];
  firstStateSignature: string | null;
  lastStateSignature: string | null;
}

export interface Original50RouteDropRow {
  key: string;
  file: string;
  gate: Original50RouteRunSummary;
  references: Original50RouteRunSummary[];
  bestReference: {
    label: string | null;
    score: number | null;
    durationMs: number | null;
  };
  worstScore: number | null;
  scoreSpread: number | null;
  gateDropFromBest: number | null;
  majorCategoryDrops: Array<{ key: string; referenceScore: number; gateScore: number; delta: number }>;
  classification: Original50RouteDropClass;
  reasons: string[];
  recommendedNext: string;
}

export interface Original50RouteDropDiagnostic {
  generatedAt: string;
  outDir: string;
  targetScore: number;
  timeoutMs: number;
  inputs: {
    gate: string;
    references: Array<{ label: string; path: string }>;
  };
  summary: {
    rowCount: number;
    blockerCount: number;
    falsePositiveApplied: number;
    timeoutCount: number;
    byClass: Record<Original50RouteDropClass, number>;
    routeDropRows: string[];
    newGateDropRows: string[];
  };
  decision: {
    status: Original50RouteDropDecision;
    reasons: string[];
    nextLane: string;
  };
  rows: Original50RouteDropRow[];
}

interface Args {
  gate: string;
  references: Array<{ label: string; path: string }>;
  rows: string[];
  outDir: string;
  targetScore: number;
  timeoutMs: number;
}

const CLASSES: Original50RouteDropClass[] = [
  'gate_clear',
  'accepted_low_stable_debt',
  'table_control_checkpoint_debt',
  'figure_alt_route_drop',
  'heading_route_drop',
  'table_route_drop',
  'mixed_route_drop',
  'route_drop_unattributed',
  'runtime_tail_only',
  'new_gate_drop_requires_repeat',
  'no_safe_general_fix',
];

const ROUTE_DROP_CLASSES: Original50RouteDropClass[] = [
  'figure_alt_route_drop',
  'heading_route_drop',
  'table_route_drop',
  'mixed_route_drop',
  'route_drop_unattributed',
];

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

const FIGURE_TOOLS = new Set([
  'canonicalize_figure_alt_ownership',
  'normalize_nested_figure_containers',
  'repair_alt_text_structure',
  'retag_as_figure',
  'set_figure_alt_text',
]);

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original50-route-drop-diagnostic.ts --gate <baseline_report.json> [options]

Options:
  --gate <baseline_report.json>       Failed or candidate original-50 gate report.
  --reference <label=baseline.json>   Reference/focused repeat report. Repeatable.
  --row <id-or-substring>             Row key to include. Repeatable. Defaults to low gate rows and rows found in references.
  --out <dir>                         Output directory.
  --target-score <n>                  Row target used for low-row classification. Default: ${DEFAULT_TARGET_SCORE}.
  --timeout-ms <n>                    Timeout wall used for near-wall detection. Default: ${DEFAULT_TIMEOUT_MS}.
  --help                              Show this help.

This script reads existing JSON only. It does not analyze PDFs, remediate PDFs, write remediated PDFs, or call ODL/PAC/POC/Java/LLM.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  let gate = '';
  const references: Array<{ label: string; path: string }> = [];
  const rows: string[] = [];
  let outDir = join(DEFAULT_OUT_ROOT, `original50-route-drop-diagnostic-${timestampSlug(now)}`);
  let targetScore = DEFAULT_TARGET_SCORE;
  let timeoutMs = DEFAULT_TIMEOUT_MS;

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
    if (arg === '--timeout-ms') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid --timeout-ms value\n${usage()}`);
      timeoutMs = value;
      continue;
    }
    throw new Error(`Unknown argument ${arg}\n${usage()}`);
  }

  if (!gate) throw new Error(`--gate is required\n${usage()}`);
  return { gate, references, rows, outDir, targetScore, timeoutMs };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try {
    return objectOrNull(JSON.parse(details) as unknown);
  } catch {
    return null;
  }
}

function compactRecord(value: unknown): Record<string, number | boolean | string | null> {
  const input = objectOrNull(value);
  if (!input) return {};
  const out: Record<string, number | boolean | string | null> = {};
  for (const [key, item] of Object.entries(input)) {
    if (typeof item === 'number' || typeof item === 'boolean' || typeof item === 'string' || item === null) {
      out[key] = item;
    }
  }
  return out;
}

function categoryRecord(value: unknown): Record<string, number> {
  const input = objectOrNull(value);
  if (!input) return {};
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(input)) {
    if (typeof item === 'number' && Number.isFinite(item)) out[key] = item;
  }
  return out;
}

function categoryMap(row: BaselineRow): Record<string, number> {
  const out: Record<string, number> = {};
  const categories = row.categoryGap?.after
    ?? row.categoriesAfter
    ?? row.afterCategoryScores
    ?? row.reanalyzedCategoryScores
    ?? [];
  for (const category of categories) {
    if (category.applicable === false) continue;
    if (typeof category.key === 'string' && typeof category.score === 'number') {
      out[category.key] = category.score;
    }
  }
  return out;
}

function rowKey(row: BaselineRow): string {
  const raw = row.id ?? row.file ?? row.filename ?? '';
  const match = String(raw).match(/\b(\d{4})\b/);
  return match?.[1] ?? basename(String(raw)).replace(/\.pdf$/i, '');
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

function firstString(input: Record<string, unknown> | null, keys: string[]): string | null {
  if (!input) return null;
  for (const key of keys) {
    if (typeof input[key] === 'string' && input[key]) return input[key] as string;
  }
  return null;
}

function reasonFor(details: unknown): string | null {
  const parsed = parseDetails(details);
  const reason = firstString(parsed, ['note', 'raw', 'reason', 'outcome']);
  if (reason) return reason.slice(0, 180);
  const text = detailsText(details);
  return text ? text.slice(0, 180) : null;
}

function pacRegressionsFrom(details: unknown): string[] {
  const out = new Set<string>();
  const parsed = parseDetails(details);
  const single = objectOrNull(parsed?.pacRuleRegression);
  if (typeof single?.ruleId === 'string') out.add(single.ruleId);
  const many = Array.isArray(parsed?.pacRuleRegressions) ? parsed.pacRuleRegressions : [];
  for (const item of many) {
    const rule = objectOrNull(item);
    if (typeof rule?.ruleId === 'string') out.add(rule.ruleId);
  }
  for (const match of detailsText(details).matchAll(/pac_rule_regressed\(([^)]+)\)/g)) {
    if (match[1]) out.add(match[1]);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function stageRegressionsFrom(details: unknown): string[] {
  const out = new Set<string>();
  const text = detailsText(details);
  for (const match of text.matchAll(/stage_regressed_category\(([^:)]+):([^)]+)\)/g)) {
    if (match[1] && match[2]) out.add(`${match[1]}:${match[2]}`);
  }
  for (const match of text.matchAll(/post_pass_regressed_score\(([^)]+)\)/g)) {
    if (match[1]) out.add(`post_pass_score:${match[1]}`);
  }
  for (const match of text.matchAll(/stage_regressed_score\(([^)]+)\)/g)) {
    if (match[1]) out.add(`stage_score:${match[1]}`);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function normalizeTool(tool: AppliedTool): NormalizedTool {
  const parsed = parseDetails(tool.details);
  const debug = objectOrNull(parsed?.debug);
  const replay = objectOrNull(debug?.replayState);
  const invariants = objectOrNull(parsed?.invariants);
  return {
    toolName: tool.toolName ?? 'unknown',
    outcome: tool.outcome ?? 'unknown',
    stage: numberOrNull(tool.stage),
    scoreBefore: numberOrNull(tool.scoreBefore),
    scoreAfter: numberOrNull(tool.scoreAfter),
    durationMs: numberOrNull(tool.durationMs),
    reason: reasonFor(tool.details),
    targetRef: stringOrNull(replay?.targetRef) ?? stringOrNull(invariants?.targetRef),
    pacRegressions: pacRegressionsFrom(tool.details),
    stateSignatureBefore: stringOrNull(replay?.stateSignatureBefore),
    stateSignatureAfter: stringOrNull(replay?.stateSignatureAfter),
    categoryScoresBefore: categoryRecord(replay?.categoryScoresBefore),
    categoryScoresAfter: categoryRecord(replay?.categoryScoresAfter),
    detectionSignalsBefore: compactRecord(replay?.detectionSignalsBefore),
    detectionSignalsAfter: compactRecord(replay?.detectionSignalsAfter),
  };
}

function normalizeRow(row: BaselineRow): NormalizedRow {
  return {
    key: rowKey(row),
    file: String(row.file ?? row.filename ?? row.id ?? 'unknown'),
    beforeScore: numberOrNull(row.beforeScore),
    afterScore: numberOrNull(row.afterScore ?? row.reanalyzedScore ?? row.afterDeterministicScore),
    afterGrade: stringOrNull(row.afterGrade ?? row.reanalyzedGrade ?? row.afterDeterministicGrade),
    durationMs: numberOrNull(row.durationMs ?? row.wallRemediateMs),
    error: stringOrNull(row.error) ?? stringOrNull(row.boundedRunner?.errorType),
    falsePositiveApplied: numberOrNull(row.falsePositiveAppliedCount ?? row.falsePositiveApplied) ?? 0,
    categories: categoryMap(row),
    tools: (row.appliedTools ?? []).map(normalizeTool),
  };
}

function timedOut(row: NormalizedRow | null, timeoutMs: number): boolean {
  if (!row) return false;
  return /timeout/i.test(row.error ?? '')
    || (row.afterScore === 0 && row.afterGrade === '?' && (row.durationMs ?? 0) >= timeoutMs - 5_000);
}

function toolOutcomeCounts(tools: NormalizedTool[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tool of tools) out[tool.outcome] = (out[tool.outcome] ?? 0) + 1;
  return out;
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

function summarizeRun(input: {
  label: string;
  path: string;
  row: NormalizedRow | null;
  timeoutMs: number;
}): Original50RouteRunSummary {
  const { row, timeoutMs } = input;
  if (!row) {
    return {
      label: input.label,
      path: input.path,
      present: false,
      score: null,
      grade: null,
      durationMs: null,
      timedOut: false,
      nearWall: false,
      falsePositiveApplied: 0,
      categories: {},
      lowCategories: [],
      toolOutcomeCounts: {},
      appliedTools: [],
      rejectedTools: [],
      pacRegressions: [],
      stageRegressions: [],
      firstStateSignature: null,
      lastStateSignature: null,
    };
  }
  const firstReplay = row.tools.find(tool => tool.stateSignatureBefore || tool.stateSignatureAfter);
  const lastReplay = [...row.tools].reverse().find(tool => tool.stateSignatureAfter || tool.stateSignatureBefore);
  return {
    label: input.label,
    path: input.path,
    present: true,
    score: row.afterScore,
    grade: row.afterGrade,
    durationMs: row.durationMs,
    timedOut: timedOut(row, timeoutMs),
    nearWall: (row.durationMs ?? 0) >= timeoutMs * 0.9,
    falsePositiveApplied: row.falsePositiveApplied,
    categories: row.categories,
    lowCategories: lowCategories(row.categories),
    toolOutcomeCounts: toolOutcomeCounts(row.tools),
    appliedTools: uniqueSorted(row.tools.filter(tool => tool.outcome === 'applied').map(tool => tool.toolName)),
    rejectedTools: uniqueSorted(row.tools.filter(tool => tool.outcome === 'rejected').map(tool => tool.toolName)),
    pacRegressions: uniqueSorted(row.tools.flatMap(tool => tool.pacRegressions)),
    stageRegressions: uniqueSorted(row.tools.flatMap(tool => stageRegressionsFrom(tool.reason ?? ''))),
    firstStateSignature: firstReplay?.stateSignatureBefore ?? firstReplay?.stateSignatureAfter ?? null,
    lastStateSignature: lastReplay?.stateSignatureAfter ?? lastReplay?.stateSignatureBefore ?? null,
  };
}

function scores(values: Array<number | null>): number[] {
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function selectBestReference(references: Original50RouteRunSummary[]): Original50RouteRunSummary | null {
  const present = references.filter(reference => reference.present && reference.score !== null);
  if (present.length === 0) return null;
  return [...present].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0] ?? null;
}

function majorCategoryDrops(
  gate: Original50RouteRunSummary,
  references: Original50RouteRunSummary[],
): Array<{ key: string; referenceScore: number; gateScore: number; delta: number }> {
  const bestByCategory = new Map<string, number>();
  for (const reference of references) {
    for (const [key, score] of Object.entries(reference.categories)) {
      bestByCategory.set(key, Math.max(bestByCategory.get(key) ?? -Infinity, score));
    }
  }
  const out: Array<{ key: string; referenceScore: number; gateScore: number; delta: number }> = [];
  for (const [key, referenceScore] of bestByCategory.entries()) {
    const gateScore = gate.categories[key];
    if (typeof gateScore !== 'number') continue;
    const delta = referenceScore - gateScore;
    if (delta >= 20) out.push({ key, referenceScore, gateScore, delta });
  }
  return out.sort((a, b) => b.delta - a.delta || a.key.localeCompare(b.key));
}

function hasToolFamily(run: Original50RouteRunSummary, family: 'table' | 'figure' | 'heading'): boolean {
  const names = [...run.appliedTools, ...run.rejectedTools];
  const set = family === 'table' ? TABLE_TOOLS : family === 'figure' ? FIGURE_TOOLS : HEADING_TOOLS;
  return names.some(name => set.has(name));
}

function hasPacFamily(run: Original50RouteRunSummary, family: 'table' | 'figure' | 'link' | 'orphan'): boolean {
  const prefix = family === 'table'
    ? 'pdfua.table.'
    : family === 'figure'
      ? 'pdfua.figure.'
      : family === 'link'
        ? 'pdfua.annotation.'
        : 'pdfua.content.orphan';
  return run.pacRegressions.some(rule => rule.startsWith(prefix));
}

function classifyRow(input: {
  key: string;
  gate: Original50RouteRunSummary;
  references: Original50RouteRunSummary[];
  bestReference: Original50RouteRunSummary | null;
  scoreSpread: number | null;
  gateDropFromBest: number | null;
  majorDrops: Array<{ key: string; referenceScore: number; gateScore: number; delta: number }>;
  targetScore: number;
}): { classification: Original50RouteDropClass; reasons: string[]; recommendedNext: string } {
  const { key, gate, references, bestReference, scoreSpread, gateDropFromBest, majorDrops, targetScore } = input;
  const reasons: string[] = [];
  const gateScore = gate.score;
  const bestScore = bestReference?.score ?? null;
  const gateLow = gateScore === null || gateScore < targetScore;
  const referenceHigh = (bestScore ?? -Infinity) >= targetScore || (bestScore ?? -Infinity) >= 90;
  const moderateDrop = (gateDropFromBest ?? 0) >= 8 && referenceHigh;
  const focusedReferencePresent = references.some(reference =>
    reference.present && /focus|targeted|repeat|soft/i.test(reference.label));
  const routeDrop = referenceHigh
    && ((gateDropFromBest ?? 0) >= 15 || (moderateDrop && focusedReferencePresent && majorDrops.length > 0));
  const nearWall = gate.nearWall || references.some(reference => reference.nearWall);
  const dropKeys = new Set(majorDrops.map(drop => drop.key));
  const figureEvidence = dropKeys.has('alt_text') || hasToolFamily(gate, 'figure') || hasPacFamily(gate, 'figure');
  const headingEvidence = dropKeys.has('heading_structure') || dropKeys.has('reading_order') || hasToolFamily(gate, 'heading');
  const tableEvidence = dropKeys.has('table_markup') || hasToolFamily(gate, 'table') || hasPacFamily(gate, 'table');

  if (!gate.present) {
    return {
      classification: 'no_safe_general_fix',
      reasons: ['gate row missing'],
      recommendedNext: 'rerun_or_rebuild_gate_artifact_before_acceptance',
    };
  }
  if (!gateLow && !gate.timedOut) {
    return {
      classification: 'gate_clear',
      reasons: [`gate score ${gateScore} >= ${targetScore}`],
      recommendedNext: 'use_as_control_for_future_table_validation',
    };
  }
  if (gate.timedOut) {
    return {
      classification: referenceHigh ? 'route_drop_unattributed' : 'runtime_tail_only',
      reasons: [`gate timed out`, bestReference ? `best_reference=${bestReference.label}:${bestScore}` : 'no high reference'],
      recommendedNext: referenceHigh
        ? 'compare timeout route against high reference before behavior'
        : 'diagnose checkpoint_or_runtime_tail_before_table_acceptance',
    };
  }
  if (routeDrop) {
    reasons.push(`gate_drop_from_best=${gateDropFromBest}`);
    if (bestReference) reasons.push(`best_reference=${bestReference.label}:${bestScore}`);
    if (majorDrops.length > 0) reasons.push(`major_category_drops=${majorDrops.map(drop => `${drop.key}:${drop.referenceScore}->${drop.gateScore}`).join(',')}`);
    if (gate.pacRegressions.length > 0) reasons.push(`pac_regressions=${gate.pacRegressions.join(',')}`);
    if (figureEvidence && tableEvidence) {
      return {
        classification: 'mixed_route_drop',
        reasons,
        recommendedNext: 'diagnose mixed figure/table route state before table behavior',
      };
    }
    if (figureEvidence && headingEvidence) {
      return {
        classification: 'mixed_route_drop',
        reasons,
        recommendedNext: 'diagnose mixed heading/figure route state before table behavior',
      };
    }
    if (tableEvidence && headingEvidence) {
      return {
        classification: 'mixed_route_drop',
        reasons,
        recommendedNext: 'diagnose mixed heading/table route state before table behavior',
      };
    }
    if (figureEvidence) {
      return {
        classification: 'figure_alt_route_drop',
        reasons,
        recommendedNext: 'compare figure-alt ownership and post-pass states against high reference',
      };
    }
    if (headingEvidence) {
      return {
        classification: 'heading_route_drop',
        reasons,
        recommendedNext: 'compare heading/reading-order route state against high reference',
      };
    }
    if (tableEvidence) {
      return {
        classification: 'table_route_drop',
        reasons,
        recommendedNext: 'compare table/header route state against high reference with controls',
      };
    }
    return {
      classification: 'route_drop_unattributed',
      reasons,
      recommendedNext: 'run focused route timeline repeat with replay-state comparison',
    };
  }
  if (moderateDrop && !focusedReferencePresent) {
    reasons.push(`moderate_gate_drop=${gateDropFromBest}`);
    if (bestReference) reasons.push(`best_reference=${bestReference.label}:${bestScore}`);
    if (majorDrops.length > 0) reasons.push(`major_category_drops=${majorDrops.map(drop => `${drop.key}:${drop.referenceScore}->${drop.gateScore}`).join(',')}`);
    return {
      classification: 'new_gate_drop_requires_repeat',
      reasons,
      recommendedNext: `run focused deterministic repeat for ${key} before using it as table-gate evidence`,
    };
  }
  if ((scoreSpread ?? 0) >= 20) {
    reasons.push(`score_spread=${scoreSpread}`);
    if (bestReference) reasons.push(`best_reference=${bestReference.label}:${bestScore}`);
    return {
      classification: 'route_drop_unattributed',
      reasons,
      recommendedNext: 'run focused route timeline repeat with replay-state comparison',
    };
  }
  if (nearWall) {
    reasons.push(`near_wall_duration gate=${gate.durationMs ?? '?'}`);
    return {
      classification: 'runtime_tail_only',
      reasons,
      recommendedNext: 'diagnose runtime budget/checkpoint behavior before broad table work',
    };
  }
  if ((gate.categories.table_markup ?? 100) < 85 || tableEvidence) {
    reasons.push(`table_markup=${gate.categories.table_markup ?? 'missing'}`);
    if (gate.pacRegressions.length > 0) reasons.push(`pac_regressions=${gate.pacRegressions.join(',')}`);
    return {
      classification: 'table_control_checkpoint_debt',
      reasons,
      recommendedNext: 'keep table debt parked until original-50 route volatility is stable',
    };
  }
  if ((gate.categories.alt_text ?? 100) < 90 || (gate.categories.heading_structure ?? 100) < 85 || (gate.categories.pdf_ua_compliance ?? 100) < 85) {
    reasons.push(`low_categories=${gate.lowCategories.join(',')}`);
    return {
      classification: 'accepted_low_stable_debt',
      reasons,
      recommendedNext: 'park_or_fix_non_table_debt_before accepting broader table behavior',
    };
  }
  return {
    classification: 'no_safe_general_fix',
    reasons: ['low gate row without a safe structural discriminator'],
    recommendedNext: 'park_with_source_tracked_evidence_unless_new_object_backed_proof_appears',
  };
}

function buildDecision(rows: Original50RouteDropRow[]): Original50RouteDropDiagnostic['decision'] {
  const blockers = rows.filter(row => row.classification !== 'gate_clear');
  const routeDrops = blockers.filter(row => ROUTE_DROP_CLASSES.includes(row.classification));
  const runtime = blockers.filter(row => row.classification === 'runtime_tail_only');
  const newDrops = blockers.filter(row => row.classification === 'new_gate_drop_requires_repeat');
  const reasons: string[] = [];

  if (blockers.length === 0) {
    return {
      status: 'original50_gate_ready_for_table_reopen',
      reasons: ['all selected rows are at or above the target in the gate report'],
      nextLane: 'reopen_strict_object_backed_table_lanes',
    };
  }
  if (routeDrops.length > 0 || newDrops.length > 0) {
    if (routeDrops.length > 0) reasons.push(`${routeDrops.length} selected row(s) have route-drop evidence`);
    if (newDrops.length > 0) reasons.push(`${newDrops.length} selected row(s) need focused repeat before classification`);
    return {
      status: 'diagnose_non_table_route_volatility_before_table_reopen',
      reasons,
      nextLane: 'focused_route_drop_timeline_or_route_state_stabilization',
    };
  }
  if (runtime.length > 0) {
    reasons.push(`${runtime.length} selected row(s) are runtime-tail blockers`);
    return {
      status: 'diagnose_runtime_tail_first',
      reasons,
      nextLane: 'original50_runtime_tail_checkpoint_diagnostic',
    };
  }
  reasons.push(`${blockers.length} selected low row(s) remain stable debt or table-control debt`);
  return {
    status: 'park_or_fix_stable_low_debt_before_table_reopen',
    reasons,
    nextLane: 'source_track_low_debt_or_narrow_fix_before_table_acceptance',
  };
}

function reportRows(report: BaselineReport): BaselineRow[] {
  return report.rows ?? report.remediateResults ?? [];
}

function rowMatches(row: NormalizedRow, selectors: string[]): boolean {
  if (selectors.length === 0) return true;
  const text = `${row.key} ${row.file}`.toLowerCase();
  return selectors.some(selector => text.includes(selector.toLowerCase()));
}

function rowMap(report: BaselineReport): Map<string, NormalizedRow> {
  return new Map(reportRows(report).map(row => {
    const normalized = normalizeRow(row);
    return [normalized.key, normalized];
  }));
}

export function buildOriginal50RouteDropDiagnostic(input: {
  generatedAt?: string;
  outDir: string;
  gatePath: string;
  gate: BaselineReport;
  referenceInputs?: Array<{ label: string; path: string; report: BaselineReport }>;
  rows?: string[];
  targetScore?: number;
  timeoutMs?: number;
}): Original50RouteDropDiagnostic {
  const targetScore = input.targetScore ?? DEFAULT_TARGET_SCORE;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const gateRows = rowMap(input.gate);
  const referenceMaps = (input.referenceInputs ?? []).map(reference => ({
    label: reference.label,
    path: reference.path,
    rows: rowMap(reference.report),
  }));
  const explicitRows = input.rows ?? [];
  const candidateKeys = new Set<string>();
  for (const row of gateRows.values()) {
    if (rowMatches(row, explicitRows) && ((row.afterScore ?? -Infinity) < targetScore || explicitRows.length > 0)) {
      candidateKeys.add(row.key);
    }
  }
  for (const reference of referenceMaps) {
    for (const row of reference.rows.values()) {
      if (rowMatches(row, explicitRows)) candidateKeys.add(row.key);
    }
  }

  const rows: Original50RouteDropRow[] = [...candidateKeys].sort((a, b) => a.localeCompare(b)).map(key => {
    const gateRow = gateRows.get(key) ?? null;
    const gateSummary = summarizeRun({
      label: 'gate',
      path: input.gatePath,
      row: gateRow,
      timeoutMs,
    });
    const references = referenceMaps.map(reference => summarizeRun({
      label: reference.label,
      path: reference.path,
      row: reference.rows.get(key) ?? null,
      timeoutMs,
    }));
    const bestReference = selectBestReference(references);
    const allScores = scores([gateSummary.score, ...references.map(reference => reference.score)]);
    const worstScore = allScores.length > 0 ? Math.min(...allScores) : null;
    const scoreSpread = allScores.length > 0 ? Math.max(...allScores) - Math.min(...allScores) : null;
    const gateDropFromBest = typeof bestReference?.score === 'number' && typeof gateSummary.score === 'number'
      ? bestReference.score - gateSummary.score
      : null;
    const drops = majorCategoryDrops(gateSummary, references);
    const classified = classifyRow({
      key,
      gate: gateSummary,
      references,
      bestReference,
      scoreSpread,
      gateDropFromBest,
      majorDrops: drops,
      targetScore,
    });
    return {
      key,
      file: gateRow?.file ?? references.find(reference => reference.present)?.path ?? key,
      gate: gateSummary,
      references,
      bestReference: {
        label: bestReference?.label ?? null,
        score: bestReference?.score ?? null,
        durationMs: bestReference?.durationMs ?? null,
      },
      worstScore,
      scoreSpread,
      gateDropFromBest,
      majorCategoryDrops: drops,
      classification: classified.classification,
      reasons: classified.reasons,
      recommendedNext: classified.recommendedNext,
    };
  });

  const byClass = Object.fromEntries(CLASSES.map(rowClass => [rowClass, 0])) as Record<Original50RouteDropClass, number>;
  for (const row of rows) byClass[row.classification] += 1;
  const blockers = rows.filter(row => row.classification !== 'gate_clear');
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    outDir: input.outDir,
    targetScore,
    timeoutMs,
    inputs: {
      gate: input.gatePath,
      references: (input.referenceInputs ?? []).map(reference => ({ label: reference.label, path: reference.path })),
    },
    summary: {
      rowCount: rows.length,
      blockerCount: blockers.length,
      falsePositiveApplied: rows.reduce((sum, row) => sum + row.gate.falsePositiveApplied, 0),
      timeoutCount: rows.filter(row => row.gate.timedOut).length,
      byClass,
      routeDropRows: rows.filter(row => ROUTE_DROP_CLASSES.includes(row.classification)).map(row => row.key),
      newGateDropRows: rows.filter(row => row.classification === 'new_gate_drop_requires_repeat').map(row => row.key),
    },
    decision: buildDecision(rows),
    rows,
  };
}

function mdCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function renderOriginal50RouteDropMarkdown(report: Original50RouteDropDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Original-50 Route-Drop Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`, '');
  lines.push('## Decision', '');
  lines.push(`- Status: \`${report.decision.status}\``);
  lines.push(`- Next lane: \`${report.decision.nextLane}\``);
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  lines.push('', '## Inputs', '');
  lines.push(`- Gate: \`${report.inputs.gate}\``);
  for (const reference of report.inputs.references) {
    lines.push(`- Reference \`${reference.label}\`: \`${reference.path}\``);
  }
  lines.push('', '## Summary', '');
  lines.push(`- Row target: ${report.targetScore}`);
  lines.push(`- Rows: ${report.summary.rowCount}`);
  lines.push(`- Blockers: ${report.summary.blockerCount}`);
  lines.push(`- Gate timeouts: ${report.summary.timeoutCount}`);
  lines.push(`- Gate false_positive_applied: ${report.summary.falsePositiveApplied}`);
  for (const rowClass of CLASSES) lines.push(`- \`${rowClass}\`: ${report.summary.byClass[rowClass]}`);
  lines.push('', '## Rows', '');
  lines.push('| Row | Gate | Best Reference | Spread | Class | Major Drops | PAC Regressions | Next |');
  lines.push('|---|---:|---:|---:|---|---|---|---|');
  for (const row of report.rows) {
    const gate = `${row.gate.score ?? '?'} ${row.gate.grade ?? ''}`.trim();
    const best = row.bestReference.label
      ? `${row.bestReference.label}:${row.bestReference.score ?? '?'}`
      : '?';
    const drops = row.majorCategoryDrops
      .map(drop => `${drop.key} ${drop.referenceScore}->${drop.gateScore}`)
      .join(', ') || '-';
    const pac = row.gate.pacRegressions.join(', ') || '-';
    lines.push(`| \`${mdCell(row.key)}\` | ${mdCell(gate)} | ${mdCell(best)} | ${row.scoreSpread ?? '?'} | \`${row.classification}\` | ${mdCell(drops)} | ${mdCell(pac)} | ${mdCell(row.recommendedNext)} |`);
  }
  lines.push('', '## Row Details', '');
  for (const row of report.rows) {
    lines.push(`### ${row.key}`, '');
    lines.push(`- File: \`${row.file}\``);
    lines.push(`- Gate: ${row.gate.score ?? '?'} ${row.gate.grade ?? '?'}; duration ${row.gate.durationMs ?? '?'}ms; low categories: ${row.gate.lowCategories.join(', ') || '-'}`);
    lines.push(`- Best reference: ${row.bestReference.label ?? '?'} ${row.bestReference.score ?? '?'}; drop ${row.gateDropFromBest ?? '?'}`);
    if (row.reasons.length > 0) lines.push(`- Reasons: ${row.reasons.join('; ')}`);
    for (const reference of row.references) {
      if (!reference.present) continue;
      lines.push(`- Reference \`${reference.label}\`: ${reference.score ?? '?'} ${reference.grade ?? '?'}; duration ${reference.durationMs ?? '?'}ms; low categories: ${reference.lowCategories.join(', ') || '-'}`);
    }
    lines.push('');
  }
  lines.push('## Notes', '');
  lines.push('- Read-only diagnostic: no PDFs are analyzed or remediated by this script.');
  lines.push('- Route-drop rows block table behavior acceptance until fixed or parked with stronger evidence.');
  return `${lines.join('\n')}\n`;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function writeOriginal50RouteDropDiagnostic(args: Args): Promise<Original50RouteDropDiagnostic> {
  const gate = await readJson<BaselineReport>(args.gate);
  const referenceInputs = await Promise.all(args.references.map(async reference => ({
    label: reference.label,
    path: reference.path,
    report: await readJson<BaselineReport>(reference.path),
  })));
  const report = buildOriginal50RouteDropDiagnostic({
    outDir: args.outDir,
    gatePath: args.gate,
    gate,
    referenceInputs,
    rows: args.rows,
    targetScore: args.targetScore,
    timeoutMs: args.timeoutMs,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'original50-route-drop-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'original50-route-drop-diagnostic.md'), renderOriginal50RouteDropMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await writeOriginal50RouteDropDiagnostic(args);
  console.log(`Wrote ${join(args.outDir, 'original50-route-drop-diagnostic.md')}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
