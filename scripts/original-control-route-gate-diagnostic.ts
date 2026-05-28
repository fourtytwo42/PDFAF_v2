#!/usr/bin/env tsx
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

type InputRole = 'current' | 'candidate' | 'repeat';

export type OriginalControlGateClass =
  | 'current_recovered'
  | 'current_hard_timeout'
  | 'current_non_table_figure_alt_route_blocker'
  | 'current_non_table_heading_pdfua_route_blocker'
  | 'current_table_control_debt'
  | 'candidate_unrelated_original_gate_blocker'
  | 'candidate_table_goal_not_implicated'
  | 'not_relevant';

export type OriginalControlGateDecision =
  | 'return_to_table_behavior_gate'
  | 'stabilize_hard_timeout_before_table_behavior'
  | 'park_or_stabilize_non_table_routes_before_table_behavior'
  | 'tighten_table_control_gate_before_table_behavior'
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
  details?: unknown;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
}

interface NormalizedRow {
  id: string;
  file: string;
  role: InputRole;
  inputPath: string;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  durationMs: number | null;
  error: string | null;
  categories: Record<string, number>;
  appliedTools: AppliedTool[];
}

export interface OriginalControlGateRow {
  id: string;
  file: string;
  role: InputRole;
  inputPath: string;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  durationMs: number | null;
  timedOut: boolean;
  categories: Record<string, number>;
  tableTools: Array<{ toolName: string; outcome: string; source: string | null; reason: string | null }>;
  pacRegressions: string[];
  tableGoalCleanupFired: boolean;
  classification: OriginalControlGateClass;
  reasons: string[];
}

export interface OriginalControlGateReport {
  generatedAt: string;
  outDir: string;
  inputs: Array<{ role: InputRole; path: string; rowCount: number }>;
  summary: {
    rowCount: number;
    currentRowCount: number;
    currentLowCount: number;
    currentTimeoutCount: number;
    currentRecoveredCount: number;
    byClass: Record<OriginalControlGateClass, number>;
    currentBlockers: string[];
    candidateRowsWhereTableGoalDidNotFire: string[];
  };
  decision: {
    status: OriginalControlGateDecision;
    nextLane: string;
    reasons: string[];
  };
  rows: OriginalControlGateRow[];
}

interface Args {
  currentRuns: string[];
  candidateReports: string[];
  repeatReports: string[];
  outDir: string;
}

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-table-diagnostics';
const CLASSES: OriginalControlGateClass[] = [
  'current_recovered',
  'current_hard_timeout',
  'current_non_table_figure_alt_route_blocker',
  'current_non_table_heading_pdfua_route_blocker',
  'current_table_control_debt',
  'candidate_unrelated_original_gate_blocker',
  'candidate_table_goal_not_implicated',
  'not_relevant',
];

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original-control-route-gate-diagnostic.ts [options]

Options:
  --current-run <dir>              Benchmark run directory with summary.json/remediate.results.json. Repeatable.
  --candidate-report <json>        baseline_report.json from a table behavior candidate/original gate. Repeatable.
  --repeat-report <json>           baseline_report.json from a focused repeat. Repeatable.
  --out <dir>                      Output directory.
  --help                           Show this help.

The script reads existing JSON artifacts only. It does not analyze PDFs, remediate PDFs, write PDFs, or call ODL/PAC/POC/Java/LLM.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  const currentRuns: string[] = [];
  const candidateReports: string[] = [];
  const repeatReports: string[] = [];
  let outDir = join(DEFAULT_OUT_ROOT, `original-control-route-gate-${timestampSlug(now)}`);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --out value\n${usage()}`);
      outDir = resolve(value);
      continue;
    }
    if (arg === '--current-run') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --current-run value\n${usage()}`);
      currentRuns.push(resolve(value));
      continue;
    }
    if (arg === '--candidate-report') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --candidate-report value\n${usage()}`);
      candidateReports.push(resolve(value));
      continue;
    }
    if (arg === '--repeat-report') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --repeat-report value\n${usage()}`);
      repeatReports.push(resolve(value));
      continue;
    }
    throw new Error(`Unknown argument ${arg}\n${usage()}`);
  }

  if (currentRuns.length + candidateReports.length + repeatReports.length === 0) {
    throw new Error(`At least one input is required.\n${usage()}`);
  }

  return { currentRuns, candidateReports, repeatReports, outDir };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function categoryMap(values: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(values)) return out;
  for (const value of values as CategoryScore[]) {
    if (value.applicable === false) continue;
    if (typeof value.key === 'string' && typeof value.score === 'number') out[value.key] = value.score;
  }
  return out;
}

function parseReason(details: unknown): string | null {
  if (typeof details !== 'string' || details.length === 0) return null;
  if (!details.startsWith('{')) return details.slice(0, 120);
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    for (const key of ['note', 'raw', 'reason', 'outcome']) {
      if (typeof parsed[key] === 'string') return parsed[key] as string;
    }
  } catch {
    return details.slice(0, 120);
  }
  return null;
}

function pacRegressions(tools: AppliedTool[]): string[] {
  const rules = new Set<string>();
  for (const tool of tools) {
    if (typeof tool.details !== 'string') continue;
    for (const match of tool.details.matchAll(/pac_rule_regressed\(([^)]+)\)/g)) {
      if (match[1]) rules.add(match[1]);
    }
  }
  return [...rules].sort((a, b) => a.localeCompare(b));
}

function tableTools(tools: AppliedTool[]): OriginalControlGateRow['tableTools'] {
  return tools
    .filter(tool => ['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells'].includes(tool.toolName ?? ''))
    .map(tool => ({
      toolName: tool.toolName ?? 'unknown',
      outcome: tool.outcome ?? 'unknown',
      source: tool.source ?? null,
      reason: parseReason(tool.details),
    }));
}

function tableGoalCleanupFired(tools: AppliedTool[]): boolean {
  const text = JSON.stringify(tools);
  return (
    text.includes('stage180_empty_row_regularity_cleanup') ||
    text.includes('stage180_header_regularization_sequence') ||
    text.includes('stage180_explicit_table_continuation')
  );
}

function timedOut(row: NormalizedRow): boolean {
  const duration = row.durationMs ?? 0;
  return (
    /timeout/i.test(row.error ?? '') ||
    (row.afterScore === 0 && row.afterGrade === '?' && duration >= 295_000)
  );
}

function score(row: NormalizedRow, key: string, fallback = 100): number {
  return typeof row.categories[key] === 'number' ? row.categories[key]! : fallback;
}

export function classifyOriginalControlGateRow(row: NormalizedRow): OriginalControlGateRow {
  const tables = tableTools(row.appliedTools);
  const pac = pacRegressions(row.appliedTools);
  const cleanupFired = tableGoalCleanupFired(row.appliedTools);
  const reasons: string[] = [];
  let classification: OriginalControlGateClass = 'not_relevant';
  const afterScore = row.afterScore;
  const isTimedOut = timedOut(row);
  const low = afterScore !== null && afterScore < 93;
  const table = score(row, 'table_markup');
  const heading = score(row, 'heading_structure');
  const alt = score(row, 'alt_text');
  const pdfua = score(row, 'pdf_ua_compliance');
  const appliedTable = tables.some(tool => tool.outcome === 'applied');

  if (row.role === 'current') {
    if (isTimedOut) {
      classification = 'current_hard_timeout';
      reasons.push('current row hit bounded timeout');
    } else if (afterScore !== null && afterScore >= 93) {
      classification = 'current_recovered';
      reasons.push('current row recovered to acceptance score');
    } else if (low && alt <= 60 && table >= 90) {
      classification = 'current_non_table_figure_alt_route_blocker';
      reasons.push(`alt_text=${alt}`);
      reasons.push(`table_markup=${table}`);
    } else if (low && table < 90 && appliedTable) {
      classification = 'current_table_control_debt';
      reasons.push(`table_markup=${table}`);
      reasons.push('table tools applied on original-control row');
    } else if (low) {
      classification = 'current_non_table_heading_pdfua_route_blocker';
      if (heading < 85) reasons.push(`heading_structure=${heading}`);
      if (pdfua < 85) reasons.push(`pdf_ua_compliance=${pdfua}`);
      if (table < 90) reasons.push(`table_markup=${table}`);
    }
  } else if (low || isTimedOut) {
    if (cleanupFired) {
      classification = 'candidate_table_goal_not_implicated';
      reasons.push('table-goal cleanup fired in historical artifact');
    } else {
      classification = 'candidate_unrelated_original_gate_blocker';
      reasons.push('table-goal cleanup did not fire in historical artifact');
    }
    if (isTimedOut) reasons.push('historical row timed out');
    if (alt < 90) reasons.push(`alt_text=${alt}`);
    if (heading < 85) reasons.push(`heading_structure=${heading}`);
    if (pdfua < 85) reasons.push(`pdf_ua_compliance=${pdfua}`);
    if (table < 90) reasons.push(`table_markup=${table}`);
  }

  if (pac.length > 0) reasons.push(`pac_regressions=${pac.join(',')}`);

  return {
    id: row.id,
    file: row.file,
    role: row.role,
    inputPath: row.inputPath,
    beforeScore: row.beforeScore,
    afterScore,
    afterGrade: row.afterGrade,
    durationMs: row.durationMs,
    timedOut: isTimedOut,
    categories: row.categories,
    tableTools: tables,
    pacRegressions: pac,
    tableGoalCleanupFired: cleanupFired,
    classification,
    reasons: [...new Set(reasons)],
  };
}

function inputSummary(role: InputRole, path: string, rows: NormalizedRow[]): OriginalControlGateReport['inputs'][number] {
  return { role, path, rowCount: rows.length };
}

export function buildOriginalControlGateReport(input: {
  outDir: string;
  inputs: Array<{ role: InputRole; path: string; rows: NormalizedRow[] }>;
  now?: Date;
}): OriginalControlGateReport {
  const rows = input.inputs.flatMap(source => source.rows.map(classifyOriginalControlGateRow));
  const byClass = Object.fromEntries(CLASSES.map(rowClass => [rowClass, 0])) as Record<OriginalControlGateClass, number>;
  for (const row of rows) byClass[row.classification] += 1;

  const currentRows = rows.filter(row => row.role === 'current');
  const currentBlockers = currentRows
    .filter(row => row.classification !== 'current_recovered' && row.classification !== 'not_relevant')
    .map(row => row.id);
  const candidateRowsWhereTableGoalDidNotFire = rows
    .filter(row => row.role !== 'current' && row.classification === 'candidate_unrelated_original_gate_blocker')
    .map(row => row.id);

  const reasons: string[] = [];
  let status: OriginalControlGateDecision = 'insufficient_current_evidence';
  let nextLane = 'collect_current_original_control_repeat';

  if (currentRows.length > 0) {
    const hardTimeouts = byClass.current_hard_timeout;
    const nonTableBlockers =
      byClass.current_non_table_figure_alt_route_blocker +
      byClass.current_non_table_heading_pdfua_route_blocker;
    const tableControlDebt = byClass.current_table_control_debt;

    if (hardTimeouts > 0) {
      status = 'stabilize_hard_timeout_before_table_behavior';
      nextLane = 'original_control_timeout_stabilization';
      reasons.push(`${hardTimeouts} current original-control row(s) timed out`);
    } else if (nonTableBlockers > 0) {
      status = 'park_or_stabilize_non_table_routes_before_table_behavior';
      nextLane = 'non_table_original_route_stabilization_or_explicit_parking';
      reasons.push(`${nonTableBlockers} current original-control blocker row(s) are non-table route failures`);
      if (tableControlDebt > 0) reasons.push(`${tableControlDebt} current blocker row(s) still carry table-control debt`);
    } else if (tableControlDebt > 0) {
      status = 'tighten_table_control_gate_before_table_behavior';
      nextLane = 'original_table_control_gate_diagnostic';
      reasons.push(`${tableControlDebt} current original-control row(s) carry table-control debt`);
    } else {
      status = 'return_to_table_behavior_gate';
      nextLane = 'strict_object_backed_table_transaction_or_mixed_heading_table_diagnostic';
      reasons.push('current focus rows are recovered or not relevant; table behavior can return to targeted proof');
    }
  }

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    outDir: input.outDir,
    inputs: input.inputs.map(source => inputSummary(source.role, source.path, source.rows)),
    summary: {
      rowCount: rows.length,
      currentRowCount: currentRows.length,
      currentLowCount: currentRows.filter(row => row.afterScore !== null && row.afterScore < 93).length,
      currentTimeoutCount: currentRows.filter(row => row.timedOut).length,
      currentRecoveredCount: currentRows.filter(row => row.classification === 'current_recovered').length,
      byClass,
      currentBlockers,
      candidateRowsWhereTableGoalDidNotFire: [...new Set(candidateRowsWhereTableGoalDidNotFire)].sort((a, b) => a.localeCompare(b)),
    },
    decision: { status, nextLane, reasons },
    rows: rows.sort((a, b) => {
      if (a.role !== b.role) return a.role.localeCompare(b.role);
      return a.id.localeCompare(b.id);
    }),
  };
}

export function renderOriginalControlGateMarkdown(report: OriginalControlGateReport): string {
  const lines: string[] = [];
  lines.push('# Original-Control Route Gate Diagnostic', '');
  lines.push(`Generated: ${report.generatedAt}`, '');
  lines.push('## Decision', '');
  lines.push(`- Status: \`${report.decision.status}\``);
  lines.push(`- Next lane: \`${report.decision.nextLane}\``);
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  lines.push('');
  lines.push('## Inputs', '');
  for (const input of report.inputs) lines.push(`- \`${input.role}\`: \`${input.path}\` (${input.rowCount} rows)`);
  lines.push('');
  lines.push('## Summary', '');
  lines.push(`- Current rows: ${report.summary.currentRowCount}`);
  lines.push(`- Current lows: ${report.summary.currentLowCount}`);
  lines.push(`- Current timeouts: ${report.summary.currentTimeoutCount}`);
  lines.push(`- Current recovered: ${report.summary.currentRecoveredCount}`);
  for (const rowClass of CLASSES) lines.push(`- \`${rowClass}\`: ${report.summary.byClass[rowClass]}`);
  lines.push('');
  lines.push('## Current Rows', '');
  for (const row of report.rows.filter(item => item.role === 'current')) {
    lines.push(`- \`${row.id}\`: ${row.beforeScore ?? '?'} -> ${row.afterScore ?? '?'} ${row.afterGrade ?? '?'}; \`${row.classification}\`; ${row.reasons.join('; ') || 'no diagnostic reason'}`);
  }
  const historical = report.rows.filter(item => item.role !== 'current' && item.classification !== 'not_relevant');
  if (historical.length > 0) {
    lines.push('', '## Historical Candidate/Repeat Rows', '');
    for (const row of historical) {
      lines.push(`- \`${row.id}\` (${row.role}): ${row.beforeScore ?? '?'} -> ${row.afterScore ?? '?'} ${row.afterGrade ?? '?'}; \`${row.classification}\`; ${row.reasons.join('; ') || 'no diagnostic reason'}`);
    }
  }
  lines.push('', '## Notes', '');
  lines.push('- Read-only diagnostic: no PDFs are analyzed or remediated by this script.');
  lines.push('- This does not accept or reject a table behavior by itself; it identifies whether original-control gate debt is table-related.');
  return `${lines.join('\n')}\n`;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function rowIdFromFile(file: string): string {
  const match = file.match(/(?:^|[-_/ ])(\d{4})(?:[-_ .]|$)/);
  return match?.[1] ?? basename(file).replace(/\.pdf$/i, '');
}

async function loadExperimentRun(path: string): Promise<NormalizedRow[]> {
  const runDir = resolve(path);
  const rows = (await readJson(join(runDir, 'remediate.results.json'))) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    id: stringOrNull(row.id) ?? rowIdFromFile(String(row.file ?? 'unknown')),
    file: String(row.file ?? 'unknown'),
    role: 'current',
    inputPath: runDir,
    beforeScore: numberOrNull(row.beforeScore),
    afterScore: numberOrNull(row.afterScore),
    afterGrade: stringOrNull(row.afterGrade),
    durationMs: numberOrNull(row.totalPipelineMs) ?? numberOrNull(row.durationMs),
    error: stringOrNull(row.error),
    categories: categoryMap(row.afterCategories),
    appliedTools: Array.isArray(row.appliedTools) ? row.appliedTools as AppliedTool[] : [],
  }));
}

async function loadBaselineReport(path: string, role: Exclude<InputRole, 'current'>): Promise<NormalizedRow[]> {
  const reportPath = resolve(path);
  const json = await readJson(reportPath) as { rows?: Array<Record<string, unknown>> };
  return (json.rows ?? []).map(row => ({
    id: stringOrNull(row.id) ?? rowIdFromFile(String(row.file ?? 'unknown')),
    file: String(row.file ?? 'unknown'),
    role,
    inputPath: reportPath,
    beforeScore: numberOrNull(row.beforeScore),
    afterScore: numberOrNull(row.afterScore),
    afterGrade: stringOrNull(row.afterGrade),
    durationMs: numberOrNull(row.durationMs) ?? numberOrNull(row.totalPipelineMs),
    error: stringOrNull((row.boundedRunner as { errorType?: unknown } | undefined)?.errorType) ?? stringOrNull(row.error),
    categories: categoryMap((row.categoryGap as { after?: unknown } | undefined)?.after ?? row.categoriesAfter),
    appliedTools: Array.isArray(row.appliedTools) ? row.appliedTools as AppliedTool[] : [],
  }));
}

async function inputKind(path: string): Promise<'dir' | 'file'> {
  const info = await stat(path);
  return info.isDirectory() ? 'dir' : 'file';
}

async function main(): Promise<void> {
  const args = parseArgs();
  const inputs: Array<{ role: InputRole; path: string; rows: NormalizedRow[] }> = [];
  for (const path of args.currentRuns) {
    if (await inputKind(path) !== 'dir') throw new Error(`--current-run must be a run directory: ${path}`);
    inputs.push({ role: 'current', path: resolve(path), rows: await loadExperimentRun(path) });
  }
  for (const path of args.candidateReports) {
    inputs.push({ role: 'candidate', path: resolve(path), rows: await loadBaselineReport(path, 'candidate') });
  }
  for (const path of args.repeatReports) {
    inputs.push({ role: 'repeat', path: resolve(path), rows: await loadBaselineReport(path, 'repeat') });
  }
  const report = buildOriginalControlGateReport({ outDir: resolve(args.outDir), inputs });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'original-control-route-gate-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.outDir, 'original-control-route-gate-diagnostic.md'), renderOriginalControlGateMarkdown(report), 'utf8');
  console.log(`Decision: ${report.decision.status}`);
  console.log(`Next lane: ${report.decision.nextLane}`);
  console.log(`Wrote ${join(args.outDir, 'original-control-route-gate-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
