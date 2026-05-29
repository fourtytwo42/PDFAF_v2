#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const DEFAULT_TARGET_SCORE = 93;
const DEFAULT_TIMEOUT_MS = 300_000;

export type Original50BlockerClass =
  | 'gate_clear'
  | 'true_source_regression'
  | 'route_analyzer_volatility'
  | 'runtime_tail_only'
  | 'table_related_side_effect'
  | 'non_table_remediation_debt'
  | 'no_safe_general_fix';

export type Original50StabilizationDecision =
  | 'return_to_table_lanes'
  | 'fix_or_park_original50_blockers_first'
  | 'investigate_runtime_tail_first'
  | 'insufficient_current_evidence';

interface CategoryScore {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface AppliedTool {
  toolName?: string;
  outcome?: string;
  source?: string;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  durationMs?: number | null;
  details?: unknown;
}

interface BaselineRow {
  id?: string;
  file?: string;
  beforeScore?: number | null;
  afterScore?: number | null;
  afterGrade?: string | null;
  durationMs?: number | null;
  error?: string | null;
  falsePositiveApplied?: number | null;
  categoryGap?: { after?: CategoryScore[] };
  categoriesAfter?: CategoryScore[];
  appliedTools?: AppliedTool[];
  boundedRunner?: {
    errorType?: string | null;
  };
}

interface BaselineReport {
  rows?: BaselineRow[];
  summary?: {
    falsePositiveApplied?: number | null;
    timeoutOrErrorCount?: number | null;
  };
}

interface NormalizedRow {
  key: string;
  file: string;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  durationMs: number | null;
  error: string | null;
  categories: Record<string, number>;
  appliedTools: AppliedTool[];
  falsePositiveApplied: number;
}

export interface Original50StabilizationRow {
  key: string;
  file: string;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  durationMs: number | null;
  timedOut: boolean;
  nearWall: boolean;
  falsePositiveApplied: number;
  categories: Record<string, number>;
  appliedTableTools: Array<{ toolName: string; outcome: string; reason: string | null }>;
  appliedNonTableTools: Array<{ toolName: string; outcome: string }>;
  pacRegressions: string[];
  referenceScores: Array<{ path: string; score: number | null; durationMs: number | null; timedOut: boolean }>;
  scoreRange: { min: number | null; max: number | null; spread: number | null };
  classification: Original50BlockerClass;
  reasons: string[];
  recommendedNext: string;
}

export interface Original50StabilizationDiagnostic {
  generatedAt: string;
  outDir: string;
  targetScore: number;
  inputs: {
    current: string;
    references: string[];
  };
  summary: {
    rowCount: number;
    blockerCount: number;
    timeoutCount: number;
    falsePositiveApplied: number;
    byClass: Record<Original50BlockerClass, number>;
    blockers: string[];
  };
  decision: {
    status: Original50StabilizationDecision;
    reasons: string[];
    nextLane: string;
  };
  rows: Original50StabilizationRow[];
}

interface Args {
  current: string;
  references: string[];
  outDir: string;
  targetScore: number;
  timeoutMs: number;
}

const CLASSES: Original50BlockerClass[] = [
  'gate_clear',
  'true_source_regression',
  'route_analyzer_volatility',
  'runtime_tail_only',
  'table_related_side_effect',
  'non_table_remediation_debt',
  'no_safe_general_fix',
];

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original50-stabilization-diagnostic.ts --current <baseline_report.json> [options]

Options:
  --current <baseline_report.json>    Focused current original-50 repeat report.
  --reference <baseline_report.json>  Prior original-50/current-source report. Repeatable.
  --out <dir>                         Output directory.
  --target-score <n>                  Row target used for blocker classification. Default: ${DEFAULT_TARGET_SCORE}.
  --timeout-ms <n>                    Timeout wall used for near-wall detection. Default: ${DEFAULT_TIMEOUT_MS}.
  --help                              Show this help.

This script reads existing JSON only. It does not analyze PDFs, remediate PDFs, write remediated PDFs, or call ODL/PAC/POC/Java/LLM.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  let current = '';
  const references: string[] = [];
  let outDir = join(DEFAULT_OUT_ROOT, `original50-stabilization-diagnostic-${timestampSlug(now)}`);
  let targetScore = DEFAULT_TARGET_SCORE;
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--current') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --current value\n${usage()}`);
      current = resolve(value);
      continue;
    }
    if (arg === '--reference') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --reference value\n${usage()}`);
      references.push(resolve(value));
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

  if (!current) throw new Error(`--current is required\n${usage()}`);
  return { current, references, outDir, targetScore, timeoutMs };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function rowKey(row: BaselineRow): string {
  const raw = row.id ?? row.file ?? '';
  const match = String(raw).match(/\b(\d{4})\b/);
  return match?.[1] ?? basename(String(raw)).replace(/\.pdf$/i, '');
}

function categoryMap(row: BaselineRow): Record<string, number> {
  const out: Record<string, number> = {};
  const values = row.categoryGap?.after ?? row.categoriesAfter ?? [];
  for (const category of values) {
    if (category.applicable === false) continue;
    if (typeof category.key === 'string' && typeof category.score === 'number') out[category.key] = category.score;
  }
  return out;
}

function normalizeRow(row: BaselineRow): NormalizedRow {
  return {
    key: rowKey(row),
    file: String(row.file ?? row.id ?? 'unknown'),
    beforeScore: numberOrNull(row.beforeScore),
    afterScore: numberOrNull(row.afterScore),
    afterGrade: stringOrNull(row.afterGrade),
    durationMs: numberOrNull(row.durationMs),
    error: stringOrNull(row.error) ?? stringOrNull(row.boundedRunner?.errorType),
    categories: categoryMap(row),
    appliedTools: Array.isArray(row.appliedTools) ? row.appliedTools : [],
    falsePositiveApplied: numberOrNull(row.falsePositiveApplied) ?? 0,
  };
}

function timedOut(row: NormalizedRow, timeoutMs: number): boolean {
  return /timeout/i.test(row.error ?? '') || (row.afterScore === 0 && row.afterGrade === '?' && (row.durationMs ?? 0) >= timeoutMs - 5_000);
}

function category(row: NormalizedRow, key: string, fallback = 100): number {
  return typeof row.categories[key] === 'number' ? row.categories[key]! : fallback;
}

function detailsText(details: unknown): string {
  return typeof details === 'string' ? details : JSON.stringify(details ?? '');
}

function reason(details: unknown): string | null {
  const text = detailsText(details);
  if (!text) return null;
  if (!text.trim().startsWith('{')) return text.slice(0, 140);
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    for (const key of ['note', 'reason', 'raw', 'outcome']) {
      if (typeof parsed[key] === 'string') return parsed[key] as string;
    }
  } catch {
    return text.slice(0, 140);
  }
  return null;
}

function tableTools(tools: AppliedTool[]): Original50StabilizationRow['appliedTableTools'] {
  return tools
    .filter(tool => ['normalize_table_structure', 'set_table_header_cells', 'repair_native_table_headers'].includes(tool.toolName ?? ''))
    .map(tool => ({
      toolName: tool.toolName ?? 'unknown',
      outcome: tool.outcome ?? 'unknown',
      reason: reason(tool.details),
    }));
}

function nonTableTools(tools: AppliedTool[]): Original50StabilizationRow['appliedNonTableTools'] {
  return tools
    .filter(tool => !['normalize_table_structure', 'set_table_header_cells', 'repair_native_table_headers'].includes(tool.toolName ?? ''))
    .map(tool => ({
      toolName: tool.toolName ?? 'unknown',
      outcome: tool.outcome ?? 'unknown',
    }));
}

function pacRegressions(tools: AppliedTool[]): string[] {
  const out = new Set<string>();
  for (const tool of tools) {
    const text = detailsText(tool.details);
    for (const match of text.matchAll(/pac_rule_regressed\(([^)]+)\)/g)) {
      if (match[1]) out.add(match[1]);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function scoreRange(values: Array<number | null>): Original50StabilizationRow['scoreRange'] {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (numeric.length === 0) return { min: null, max: null, spread: null };
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  return { min, max, spread: max - min };
}

function classify(input: {
  row: NormalizedRow;
  references: Array<{ path: string; row: NormalizedRow | null }>;
  targetScore: number;
  timeoutMs: number;
}): Original50StabilizationRow {
  const { row, targetScore, timeoutMs } = input;
  const currentTimedOut = timedOut(row, timeoutMs);
  const nearWall = (row.durationMs ?? 0) >= timeoutMs * 0.9;
  const tables = tableTools(row.appliedTools);
  const nonTables = nonTableTools(row.appliedTools);
  const pac = pacRegressions(row.appliedTools);
  const referenceScores = input.references.map(reference => ({
    path: reference.path,
    score: reference.row?.afterScore ?? null,
    durationMs: reference.row?.durationMs ?? null,
    timedOut: reference.row ? timedOut(reference.row, timeoutMs) : false,
  }));
  const range = scoreRange([row.afterScore, ...referenceScores.map(reference => reference.score)]);
  const reasons: string[] = [];
  let classification: Original50BlockerClass = 'no_safe_general_fix';
  let recommendedNext = 'park_with_source_tracked_evidence_unless_new_object_backed_proof_appears';

  const tableScore = category(row, 'table_markup');
  const altScore = category(row, 'alt_text');
  const headingScore = category(row, 'heading_structure');
  const readingScore = category(row, 'reading_order');
  const pdfuaScore = category(row, 'pdf_ua_compliance');
  const low = row.afterScore === null || row.afterScore < targetScore;
  const tableToolApplied = tables.some(tool => tool.outcome === 'applied');
  const hasTablePacRegression = pac.some(rule => rule.startsWith('pdfua.table.'));
  const referencesContainHigh = referenceScores.some(reference => (reference.score ?? 0) >= targetScore);
  const referencesContainLow = referenceScores.some(reference => reference.score !== null && reference.score < targetScore);
  const largeSpread = (range.spread ?? 0) >= 20;

  if (!low && !currentTimedOut) {
    classification = 'gate_clear';
    recommendedNext = 'keep_as_control_evidence_for_future_table_validation';
    reasons.push(`score>=${targetScore}`);
  } else if (currentTimedOut) {
    classification = referencesContainHigh || largeSpread ? 'route_analyzer_volatility' : 'runtime_tail_only';
    recommendedNext = classification === 'runtime_tail_only'
      ? 'diagnose_timeout_checkpoint_or_runtime_tail'
      : 'compare_route_timeline_against_high_reference_before_behavior';
    reasons.push('current repeat timed out');
  } else if (nearWall && row.afterScore !== null && row.afterScore < targetScore) {
    classification = referencesContainHigh || largeSpread ? 'route_analyzer_volatility' : 'runtime_tail_only';
    recommendedNext = classification === 'runtime_tail_only'
      ? 'diagnose_runtime_hotspots_before_table_work'
      : 'compare_route_timeline_against_high_reference_before_behavior';
    reasons.push(`near-wall duration=${row.durationMs}`);
  } else if (largeSpread || (referencesContainHigh && referencesContainLow)) {
    classification = 'route_analyzer_volatility';
    recommendedNext = 'run route/timeline repeat and avoid behavior acceptance from a single route';
    reasons.push(`score spread=${range.spread}`);
  } else if (referencesContainHigh && low && !referencesContainLow) {
    classification = 'true_source_regression';
    recommendedNext = 'bisect_or_compare_against_last_high_reference_with_controls';
    reasons.push('current low while references are above target');
  } else if (tableScore <= 50 || (tableScore < 90 && (tableToolApplied || hasTablePacRegression))) {
    classification = 'table_related_side_effect';
    recommendedNext = 'diagnose strict table-control behavior before using row as table gate';
    reasons.push(`table_markup=${tableScore}`);
    if (tableToolApplied) reasons.push('table tool applied');
    if (hasTablePacRegression) reasons.push('table PAC regression present');
  } else if (altScore < 90 || headingScore < 85 || readingScore < 85 || pdfuaScore < 85) {
    classification = 'non_table_remediation_debt';
    recommendedNext = 'park_or_fix_non_table_route_before accepting new table behavior';
    if (altScore < 90) reasons.push(`alt_text=${altScore}`);
    if (headingScore < 85) reasons.push(`heading_structure=${headingScore}`);
    if (readingScore < 85) reasons.push(`reading_order=${readingScore}`);
    if (pdfuaScore < 85) reasons.push(`pdf_ua_compliance=${pdfuaScore}`);
  } else {
    reasons.push('low score without a safe structural discriminator');
  }

  if (row.falsePositiveApplied > 0) reasons.push(`false_positive_applied=${row.falsePositiveApplied}`);
  if (pac.length > 0) reasons.push(`pac_regressions=${pac.join(',')}`);

  return {
    key: row.key,
    file: row.file,
    beforeScore: row.beforeScore,
    afterScore: row.afterScore,
    afterGrade: row.afterGrade,
    durationMs: row.durationMs,
    timedOut: currentTimedOut,
    nearWall,
    falsePositiveApplied: row.falsePositiveApplied,
    categories: row.categories,
    appliedTableTools: tables,
    appliedNonTableTools: nonTables,
    pacRegressions: pac,
    referenceScores,
    scoreRange: range,
    classification,
    reasons: [...new Set(reasons)],
    recommendedNext,
  };
}

function buildDecision(rows: Original50StabilizationRow[]): Original50StabilizationDiagnostic['decision'] {
  const blockers = rows.filter(row => row.classification !== 'gate_clear');
  const runtime = blockers.filter(row => row.classification === 'runtime_tail_only');
  const reasons: string[] = [];
  if (blockers.length === 0) {
    return {
      status: 'return_to_table_lanes',
      nextLane: 'reopen_strict_object_backed_table_lanes',
      reasons: ['all focused original-50 rows are at or above the row target and no timeout was observed'],
    };
  }
  if (runtime.length > 0) {
    reasons.push(`${runtime.length} blocker row(s) are runtime-tail only`);
    return {
      status: 'investigate_runtime_tail_first',
      nextLane: 'original50_runtime_tail_stabilization_or_parking',
      reasons,
    };
  }
  reasons.push(`${blockers.length} focused original-50 blocker row(s) remain below gate target or unstable`);
  return {
    status: 'fix_or_park_original50_blockers_first',
    nextLane: 'source_track_original50_blocker_decision_before_table_acceptance',
    reasons,
  };
}

export function buildOriginal50StabilizationDiagnostic(input: {
  generatedAt?: string;
  outDir: string;
  currentPath: string;
  current: BaselineReport;
  referenceInputs?: Array<{ path: string; report: BaselineReport }>;
  targetScore?: number;
  timeoutMs?: number;
}): Original50StabilizationDiagnostic {
  const targetScore = input.targetScore ?? DEFAULT_TARGET_SCORE;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const currentRows = (input.current.rows ?? []).map(normalizeRow);
  const referenceRows = (input.referenceInputs ?? []).map(reference => ({
    path: reference.path,
    rows: new Map((reference.report.rows ?? []).map(row => [rowKey(row), normalizeRow(row)])),
  }));

  const rows = currentRows
    .map(row => classify({
      row,
      references: referenceRows.map(reference => ({ path: reference.path, row: reference.rows.get(row.key) ?? null })),
      targetScore,
      timeoutMs,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const byClass = Object.fromEntries(CLASSES.map(rowClass => [rowClass, 0])) as Record<Original50BlockerClass, number>;
  for (const row of rows) byClass[row.classification] += 1;
  const blockers = rows.filter(row => row.classification !== 'gate_clear');
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    outDir: input.outDir,
    targetScore,
    inputs: {
      current: input.currentPath,
      references: (input.referenceInputs ?? []).map(reference => reference.path),
    },
    summary: {
      rowCount: rows.length,
      blockerCount: blockers.length,
      timeoutCount: rows.filter(row => row.timedOut).length,
      falsePositiveApplied: rows.reduce((sum, row) => sum + row.falsePositiveApplied, 0),
      byClass,
      blockers: blockers.map(row => row.key),
    },
    decision: buildDecision(rows),
    rows,
  };
}

export function renderOriginal50StabilizationMarkdown(report: Original50StabilizationDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Original-50 Stabilization Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`, '');
  lines.push('## Decision', '');
  lines.push(`- Status: \`${report.decision.status}\``);
  lines.push(`- Next lane: \`${report.decision.nextLane}\``);
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  lines.push('', '## Inputs', '');
  lines.push(`- Current: \`${report.inputs.current}\``);
  for (const reference of report.inputs.references) lines.push(`- Reference: \`${reference}\``);
  lines.push('', '## Summary', '');
  lines.push(`- Row target: ${report.targetScore}`);
  lines.push(`- Rows: ${report.summary.rowCount}`);
  lines.push(`- Blockers: ${report.summary.blockerCount}`);
  lines.push(`- Timeouts: ${report.summary.timeoutCount}`);
  lines.push(`- false_positive_applied: ${report.summary.falsePositiveApplied}`);
  for (const rowClass of CLASSES) lines.push(`- \`${rowClass}\`: ${report.summary.byClass[rowClass]}`);
  lines.push('', '## Rows', '');
  for (const row of report.rows) {
    const refs = row.referenceScores
      .map(reference => `${basename(reference.path)}=${reference.score ?? '?'}`)
      .join(', ');
    lines.push(`- \`${row.key}\`: ${row.beforeScore ?? '?'} -> ${row.afterScore ?? '?'} ${row.afterGrade ?? '?'}; ` +
      `\`${row.classification}\`; ${row.reasons.join('; ') || 'no diagnostic reason'}; next: ${row.recommendedNext}` +
      (refs ? `; refs: ${refs}` : ''));
  }
  lines.push('', '## Notes', '');
  lines.push('- Read-only diagnostic: no PDFs are analyzed or remediated by this script.');
  lines.push('- The diagnostic does not accept a behavior change by itself; it decides whether original-50 blockers still gate future table work.');
  return `${lines.join('\n')}\n`;
}

async function readJson(path: string): Promise<BaselineReport> {
  return JSON.parse(await readFile(path, 'utf8')) as BaselineReport;
}

export async function writeOriginal50StabilizationDiagnostic(args: Args): Promise<Original50StabilizationDiagnostic> {
  const current = await readJson(args.current);
  const referenceInputs = await Promise.all(args.references.map(async path => ({ path, report: await readJson(path) })));
  const report = buildOriginal50StabilizationDiagnostic({
    outDir: args.outDir,
    currentPath: args.current,
    current,
    referenceInputs,
    targetScore: args.targetScore,
    timeoutMs: args.timeoutMs,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'original50-stabilization-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.outDir, 'original50-stabilization-diagnostic.md'), renderOriginal50StabilizationMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await writeOriginal50StabilizationDiagnostic(args);
  console.log(`Decision: ${report.decision.status}`);
  console.log(`Next lane: ${report.decision.nextLane}`);
  console.log(`Wrote ${join(args.outDir, 'original50-stabilization-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
