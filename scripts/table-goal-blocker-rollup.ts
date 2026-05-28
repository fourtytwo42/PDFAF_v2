#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-table-diagnostics';
const DEFAULT_REPORTS = [
  '/mnt/pdf-review/table-heavy-next-2026-05-27-r2/montana-empty-row-repeat-r1/baseline_report.json',
  '/mnt/pdf-review/table-heavy-next-2026-05-27-r2/empty-row-regularity-postpass-r3-tablecount/baseline_report.json',
  '/mnt/pdf-review/table-heavy-next-2026-05-27-r2/original50-empty-row-regularity-tablecount-r1/baseline_report.json',
  '/mnt/pdf-review/table-heavy-next-2026-05-27-r2/original50-low-repeat-tablecount-r1/baseline_report.json',
  '/mnt/pdf-review/table-heavy-next-2026-05-27-r2/original50-empty-row-regularity-tablecount-r2/baseline_report.json',
];

type ReportRole = 'proof' | 'original' | 'repeat';

type RowClass =
  | 'table_candidate_supported'
  | 'table_debt_unresolved'
  | 'mixed_zero_heading_table_debt'
  | 'original_gate_hard_timeout'
  | 'original_gate_reproducible_low'
  | 'original_gate_route_volatility'
  | 'control_or_near_stable'
  | 'not_relevant';

interface CategoryScore {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface AppliedTool {
  toolName?: string;
  outcome?: string;
  details?: unknown;
  scoreBefore?: number;
  scoreAfter?: number;
  source?: string;
}

interface BaselineRow {
  file?: string;
  beforeScore?: number | null;
  afterScore?: number | null;
  afterGrade?: string | null;
  durationMs?: number | null;
  falsePositiveApplied?: number | null;
  categoryGap?: {
    before?: CategoryScore[];
    after?: CategoryScore[];
  };
  categoriesAfter?: CategoryScore[];
  appliedTools?: AppliedTool[];
  boundedRunner?: {
    errorType?: string | null;
    exitCode?: number | null;
  };
}

interface BaselineReport {
  generatedAt?: string;
  inputDir?: string;
  outputDir?: string;
  summary?: {
    count?: number;
    completed?: number;
    meanAfter?: number;
    allRowMeanAfter?: number;
    falsePositiveApplied?: number;
    timeoutOrErrorCount?: number;
  };
  rows?: BaselineRow[];
}

interface ReportInput {
  role: ReportRole;
  path: string;
  report: BaselineReport;
}

interface RowObservation {
  report: string;
  role: ReportRole;
  file: string;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  durationMs: number | null;
  timedOut: boolean;
  falsePositiveApplied: number;
  categories: Record<string, number>;
  tableTools: Array<{ toolName: string; outcome: string | null; source: string | null; note: string | null }>;
  tableGoalCleanupFired: boolean;
  pacRegressions: string[];
  rowClass: RowClass;
  reasons: string[];
}

interface FileRollup {
  file: string;
  observations: RowObservation[];
  scoreRange: { min: number | null; max: number | null };
  finalClass: RowClass;
  finalReasons: string[];
}

interface RollupReport {
  generatedAt: string;
  outDir: string;
  reports: Array<{
    role: ReportRole;
    path: string;
    rowCount: number;
    completed: number | null;
    meanAfter: number | null;
    allRowMeanAfter: number | null;
    falsePositiveApplied: number | null;
    timeoutOrErrorCount: number | null;
  }>;
  summary: {
    rowCount: number;
    byClass: Record<RowClass, number>;
    tableCandidateSupported: string[];
    tableDebtUnresolved: string[];
    mixedZeroHeadingTableDebt: string[];
    originalGateBlockers: string[];
    tableGoalCleanupFiles: string[];
  };
  decision: {
    status:
      | 'gate_blocked_by_original_control_runtime_or_route'
      | 'move_to_mixed_heading_table_diagnostic'
      | 'move_to_table_transaction_behavior'
      | 'no_current_table_lane';
    reasons: string[];
    nextLane: string;
  };
  files: FileRollup[];
}

interface Args {
  reports: Array<{ role: ReportRole; path: string }>;
  outDir: string;
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/table-goal-blocker-rollup.ts [options]

Options:
  --proof <baseline_report.json>     Table-heavy proof/target report. Repeatable.
  --original <baseline_report.json>  Original-50 gate report. Repeatable.
  --repeat <baseline_report.json>    Focused repeat report. Repeatable.
  --out <dir>                        Output directory.
  --use-defaults                     Use the latest local table follow-up artifacts if present.
  --help                             Show this help.

The script reads report JSON only. It does not analyze PDFs, remediate, write PDFs, or call ODL/PAC/POC/Java/LLM.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  const reports: Array<{ role: ReportRole; path: string }> = [];
  let outDir = join(DEFAULT_OUT_ROOT, `table-goal-blocker-rollup-${timestampSlug(now)}`);

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
    if (arg === '--proof' || arg === '--original' || arg === '--repeat') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing ${arg} value\n${usage()}`);
      const role = arg.slice(2) as ReportRole;
      reports.push({ role, path: resolve(value) });
      continue;
    }
    if (arg === '--use-defaults') {
      reports.push(
        { role: 'proof', path: DEFAULT_REPORTS[0]! },
        { role: 'proof', path: DEFAULT_REPORTS[1]! },
        { role: 'original', path: DEFAULT_REPORTS[2]! },
        { role: 'repeat', path: DEFAULT_REPORTS[3]! },
        { role: 'original', path: DEFAULT_REPORTS[4]! },
      );
      continue;
    }
    throw new Error(`Unknown argument ${arg}\n${usage()}`);
  }

  if (reports.length === 0) {
    throw new Error(`At least one report is required. Use --use-defaults for the latest local artifacts.\n${usage()}`);
  }
  return { reports, outDir };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function categories(row: BaselineRow): Record<string, number> {
  const out: Record<string, number> = {};
  const values = row.categoryGap?.after ?? row.categoriesAfter ?? [];
  for (const category of values) {
    if (category.applicable === false) continue;
    if (typeof category.key === 'string' && typeof category.score === 'number') {
      out[category.key] = category.score;
    }
  }
  return out;
}

function category(map: Record<string, number>, key: string, fallback: number): number {
  return typeof map[key] === 'number' ? map[key]! : fallback;
}

function detailsText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value;
}

function parseNote(value: unknown): string | null {
  const text = detailsText(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.note === 'string') return parsed.note;
    if (typeof parsed.raw === 'string') return parsed.raw;
    if (typeof parsed.outcome === 'string') return parsed.outcome;
  } catch {
    // keep raw fallback below
  }
  const match = text.match(/"note":"([^"]+)"/) ?? text.match(/"raw":"([^"]+)"/);
  return match?.[1] ?? text.slice(0, 80);
}

function tableTools(row: BaselineRow): RowObservation['tableTools'] {
  return (row.appliedTools ?? [])
    .filter(tool => ['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells'].includes(tool.toolName ?? ''))
    .map(tool => ({
      toolName: tool.toolName ?? 'unknown',
      outcome: tool.outcome ?? null,
      source: tool.source ?? null,
      note: parseNote(tool.details),
    }));
}

function pacRegressions(row: BaselineRow): string[] {
  const rules = new Set<string>();
  for (const tool of row.appliedTools ?? []) {
    const text = detailsText(tool.details);
    for (const match of text.matchAll(/pac_rule_regressed\(([^)]+)\)/g)) {
      if (match[1]) rules.add(match[1]);
    }
  }
  return [...rules].sort((a, b) => a.localeCompare(b));
}

function timedOut(row: BaselineRow): boolean {
  const duration = numberOrNull(row.durationMs) ?? 0;
  return (
    textOrNull(row.boundedRunner?.errorType) === 'per_pdf_timeout_300000ms' ||
    (numberOrNull(row.afterScore) === 0 && row.afterGrade === '?' && duration >= 295000)
  );
}

function classifyObservation(input: {
  role: ReportRole;
  row: BaselineRow;
  cats: Record<string, number>;
  tableGoalCleanupFired: boolean;
  pac: string[];
  tableToolRows: RowObservation['tableTools'];
}): { rowClass: RowClass; reasons: string[] } {
  const { role, row, cats, tableGoalCleanupFired, pac, tableToolRows } = input;
  const score = numberOrNull(row.afterScore);
  const table = category(cats, 'table_markup', 100);
  const heading = category(cats, 'heading_structure', 100);
  const pdfua = category(cats, 'pdf_ua_compliance', 100);
  const reasons: string[] = [];

  if (timedOut(row)) {
    return { rowClass: 'original_gate_hard_timeout', reasons: ['row hit bounded hard timeout'] };
  }
  if (role === 'original' && score !== null && score < 93) {
    if (tableGoalCleanupFired) reasons.push('table follow-up fired on original row');
    else reasons.push('table follow-up did not fire on original row');
    if (table < 80) reasons.push(`table_markup=${table}`);
    if (pdfua < 80) reasons.push(`pdf_ua_compliance=${pdfua}`);
    if (heading < 80) reasons.push(`heading_structure=${heading}`);
    return { rowClass: 'original_gate_reproducible_low', reasons };
  }
  if (role === 'proof' && tableGoalCleanupFired && score !== null && score >= 93) {
    return {
      rowClass: 'table_candidate_supported',
      reasons: ['table cleanup fired on proof row with high final score'],
    };
  }
  if (heading <= 20 && table < 80) {
    return {
      rowClass: 'mixed_zero_heading_table_debt',
      reasons: [`heading_structure=${heading}`, `table_markup=${table}`],
    };
  }
  if (table < 80 && tableToolRows.length > 0) {
    return {
      rowClass: 'table_debt_unresolved',
      reasons: [`table_markup=${table}`, `${tableToolRows.length} table tool attempt(s)`],
    };
  }
  if (score !== null && score >= 93) {
    return { rowClass: 'control_or_near_stable', reasons: ['row is at or above 93'] };
  }
  return { rowClass: 'not_relevant', reasons: ['no table-goal blocker signal'] };
}

async function readReport(input: { role: ReportRole; path: string }): Promise<ReportInput> {
  const raw = await readFile(input.path, 'utf8');
  const parsed = JSON.parse(raw) as BaselineReport;
  return { ...input, path: resolve(input.path), report: parsed };
}

function observeRows(input: ReportInput): RowObservation[] {
  const reportName = basename(input.path);
  return (input.report.rows ?? []).map(row => {
    const cats = categories(row);
    const tools = tableTools(row);
    const text = JSON.stringify(row.appliedTools ?? []);
    const tableGoalCleanupFired =
      text.includes('stage180_empty_row_regularity_cleanup') ||
      text.includes('stage180_header_regularization_sequence') ||
      text.includes('stage180_explicit_table_continuation');
    const pac = pacRegressions(row);
    const classified = classifyObservation({
      role: input.role,
      row,
      cats,
      tableGoalCleanupFired,
      pac,
      tableToolRows: tools,
    });
    return {
      report: reportName,
      role: input.role,
      file: row.file ?? 'unknown',
      beforeScore: numberOrNull(row.beforeScore),
      afterScore: numberOrNull(row.afterScore),
      afterGrade: row.afterGrade ?? null,
      durationMs: numberOrNull(row.durationMs),
      timedOut: timedOut(row),
      falsePositiveApplied: numberOrNull(row.falsePositiveApplied) ?? 0,
      categories: cats,
      tableTools: tools,
      tableGoalCleanupFired,
      pacRegressions: pac,
      rowClass: classified.rowClass,
      reasons: classified.reasons,
    };
  });
}

function combineClass(current: RowClass, observation: RowObservation, scores: number[]): RowClass {
  const priority: RowClass[] = [
    'original_gate_hard_timeout',
    'original_gate_reproducible_low',
    'original_gate_route_volatility',
    'mixed_zero_heading_table_debt',
    'table_debt_unresolved',
    'table_candidate_supported',
    'control_or_near_stable',
    'not_relevant',
  ];
  const hasHigh = scores.some(score => score >= 93);
  const hasLow = scores.some(score => score < 93);
  const spread = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0;
  if (observation.role !== 'proof' && hasHigh && hasLow && spread >= 20) {
    return 'original_gate_route_volatility';
  }
  return priority.indexOf(observation.rowClass) < priority.indexOf(current) ? observation.rowClass : current;
}

function rollupFiles(observations: RowObservation[]): FileRollup[] {
  const groups = new Map<string, RowObservation[]>();
  for (const row of observations) {
    const current = groups.get(row.file) ?? [];
    current.push(row);
    groups.set(row.file, current);
  }

  return [...groups.entries()]
    .map(([file, rows]) => {
      const scores = rows
        .map(row => row.afterScore)
        .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
      let finalClass: RowClass = 'not_relevant';
      for (const row of rows) finalClass = combineClass(finalClass, row, scores);
      const scoreRange = scores.length > 0
        ? { min: Math.min(...scores), max: Math.max(...scores) }
        : { min: null, max: null };
      const finalReasons = [...new Set(rows.flatMap(row => row.reasons))].sort((a, b) => a.localeCompare(b));
      return { file, observations: rows, scoreRange, finalClass, finalReasons };
    })
    .sort((a, b) => {
      const order = (rowClass: RowClass): number => [
        'original_gate_hard_timeout',
        'original_gate_reproducible_low',
        'original_gate_route_volatility',
        'mixed_zero_heading_table_debt',
        'table_debt_unresolved',
        'table_candidate_supported',
        'control_or_near_stable',
        'not_relevant',
      ].indexOf(rowClass);
      return order(a.finalClass) - order(b.finalClass) || a.file.localeCompare(b.file);
    });
}

function reportSummary(inputs: ReportInput[], files: FileRollup[], outDir: string): RollupReport {
  const classes: RowClass[] = [
    'table_candidate_supported',
    'table_debt_unresolved',
    'mixed_zero_heading_table_debt',
    'original_gate_hard_timeout',
    'original_gate_reproducible_low',
    'original_gate_route_volatility',
    'control_or_near_stable',
    'not_relevant',
  ];
  const byClass = Object.fromEntries(classes.map(rowClass => [rowClass, 0])) as Record<RowClass, number>;
  for (const file of files) byClass[file.finalClass] += 1;

  const tableCandidateSupported = files.filter(file => file.finalClass === 'table_candidate_supported').map(file => file.file);
  const tableDebtUnresolved = files.filter(file => file.finalClass === 'table_debt_unresolved').map(file => file.file);
  const mixedZeroHeadingTableDebt = files.filter(file => file.finalClass === 'mixed_zero_heading_table_debt').map(file => file.file);
  const originalGateBlockers = files
    .filter(file => ['original_gate_hard_timeout', 'original_gate_reproducible_low', 'original_gate_route_volatility'].includes(file.finalClass))
    .map(file => file.file);
  const tableGoalCleanupFiles = [...new Set(files.flatMap(file =>
    file.observations.filter(row => row.tableGoalCleanupFired).map(row => row.file)
  ))].sort((a, b) => a.localeCompare(b));

  const reasons: string[] = [];
  let status: RollupReport['decision']['status'];
  let nextLane: string;
  if (originalGateBlockers.length > 0) {
    status = 'gate_blocked_by_original_control_runtime_or_route';
    nextLane = 'original_control_runtime_route_stabilization';
    reasons.push(`${originalGateBlockers.length} original-gate blocker row(s) must be stabilized or explicitly parked before more table behavior can be accepted`);
  } else if (mixedZeroHeadingTableDebt.length > 0) {
    status = 'move_to_mixed_heading_table_diagnostic';
    nextLane = 'mixed_zero_heading_table_diagnostic';
    reasons.push(`${mixedZeroHeadingTableDebt.length} low row(s) look like mixed zero-heading/table debt rather than table-only repair`);
  } else if (tableCandidateSupported.length >= 2 && tableDebtUnresolved.length > 0) {
    status = 'move_to_table_transaction_behavior';
    nextLane = 'strict_object_backed_table_transaction';
    reasons.push('multiple table positives are supported and unresolved table debt remains');
  } else {
    status = 'no_current_table_lane';
    nextLane = 'holdout_selection_or_new_diagnostic';
    reasons.push('no clean high-impact table lane is visible from the supplied artifacts');
  }

  return {
    generatedAt: new Date().toISOString(),
    outDir,
    reports: inputs.map(input => ({
      role: input.role,
      path: input.path,
      rowCount: input.report.rows?.length ?? 0,
      completed: numberOrNull(input.report.summary?.completed),
      meanAfter: numberOrNull(input.report.summary?.meanAfter),
      allRowMeanAfter: numberOrNull(input.report.summary?.allRowMeanAfter),
      falsePositiveApplied: numberOrNull(input.report.summary?.falsePositiveApplied),
      timeoutOrErrorCount: numberOrNull(input.report.summary?.timeoutOrErrorCount),
    })),
    summary: {
      rowCount: files.length,
      byClass,
      tableCandidateSupported,
      tableDebtUnresolved,
      mixedZeroHeadingTableDebt,
      originalGateBlockers,
      tableGoalCleanupFiles,
    },
    decision: { status, reasons, nextLane },
    files,
  };
}

function markdown(report: RollupReport): string {
  const lines: string[] = [];
  lines.push('# Table Goal Blocker Rollup');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  lines.push(`- Status: \`${report.decision.status}\``);
  lines.push(`- Next lane: \`${report.decision.nextLane}\``);
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  lines.push('');
  lines.push('## Report Inputs');
  lines.push('');
  for (const input of report.reports) {
    lines.push(`- \`${input.role}\`: \`${input.path}\` (${input.rowCount} rows, all-row mean ${input.allRowMeanAfter ?? 'n/a'}, false positives ${input.falsePositiveApplied ?? 'n/a'}, timeouts/errors ${input.timeoutOrErrorCount ?? 'n/a'})`);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  for (const [rowClass, count] of Object.entries(report.summary.byClass)) {
    lines.push(`- \`${rowClass}\`: ${count}`);
  }
  lines.push('');
  lines.push('## Key Rows');
  lines.push('');
  for (const rowClass of ['original_gate_hard_timeout', 'original_gate_reproducible_low', 'original_gate_route_volatility', 'mixed_zero_heading_table_debt', 'table_debt_unresolved', 'table_candidate_supported'] as RowClass[]) {
    const rows = report.files.filter(file => file.finalClass === rowClass);
    if (rows.length === 0) continue;
    lines.push(`### ${rowClass}`);
    lines.push('');
    for (const row of rows) {
      const range = row.scoreRange.min === null ? 'n/a' : `${row.scoreRange.min}-${row.scoreRange.max}`;
      const observations = row.observations
        .map(obs => `${obs.role}:${obs.afterScore ?? '?'}${obs.timedOut ? '/timeout' : ''}${obs.tableGoalCleanupFired ? '/table-goal-cleanup' : ''}`)
        .join(', ');
      lines.push(`- \`${row.file}\`: scores ${range}; ${observations}; ${row.finalReasons.join('; ')}`);
    }
    lines.push('');
  }
  lines.push('## Notes');
  lines.push('');
  lines.push('- This is report-only diagnostic evidence. It does not analyze or mutate PDFs.');
  lines.push('- A table behavior lane still needs targeted proof-pack validation and a fresh original-50 gate before acceptance.');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const inputs = await Promise.all(args.reports.map(readReport));
  const observations = inputs.flatMap(observeRows);
  const files = rollupFiles(observations);
  const report = reportSummary(inputs, files, args.outDir);
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'table-goal-blocker-rollup.json'), JSON.stringify(report, null, 2));
  await writeFile(join(args.outDir, 'table-goal-blocker-rollup.md'), markdown(report));
  console.log(`Decision: ${report.decision.status}`);
  console.log(`Next lane: ${report.decision.nextLane}`);
  console.log(`Wrote ${join(args.outDir, 'table-goal-blocker-rollup.md')}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
