#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { REMEDIATION_ANALYSIS_TIMEOUT_MS } from '../src/config.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AppliedRemediationTool, CategoryKey, DocumentSnapshot, ScoreCapApplied, ScoredCategory } from '../src/types.js';

const DEFAULT_RUN = 'Output/experiment-corpus-baseline/run-pac-strict-grader-fixed50-2026-05-08-r1';
const DEFAULT_FIVE_REVIEW = 'Output/review-five-a-pdfs-2026-05-08-r1/pac-gap-diagnostic';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/pac-table-header-target-diagnostic-2026-05-08-r1';
const PAC_CAP_REASON_PREFIX = 'PAC rule failure: ';
const TABLE_RULES = new Set(['pdfua.table.header_association_present', 'pdfua.table.header_cells_associated']);
const TABLE_TOOLS = new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']);
const DEFAULT_TARGETS = ['figure-4754', 'font-4699', 'long-4700'];
const DEFAULT_CONTROLS = [
  'fixture-accessible',
  'figure-4753',
  'long-4608',
  'fixture-inaccessible',
  'structure-3775',
  'font-4035',
  'long-4516',
  'long-4683',
];

export type TableHeaderTargetClassification =
  | 'safe_existing_table_repair_candidate'
  | 'headers_exist_but_not_associated'
  | 'irregular_rows_first'
  | 'missing_headers_only'
  | 'needs_stable_table_identity'
  | 'real_table_debt_no_safe_repair'
  | 'control_high_grade_with_residual_cap'
  | 'parked_or_runtime_debt';

export interface TableEvidenceRow {
  structRef: string | null;
  page: number | null;
  rowCount: number | null;
  totalCells: number | null;
  headerCount: number | null;
  hasHeaders: boolean | null;
  cellsMisplacedCount: number | null;
  irregularRows: number | null;
}

export interface TableToolInvariantRow {
  toolName: string;
  outcome: string;
  scoreBefore: number;
  scoreAfter: number;
  targetRef: string | null;
  targetResolved: boolean | null;
  resolvedRole: string | null;
  directCellsUnderTableBefore: number | null;
  directCellsUnderTableAfter: number | null;
  headerCellCountBefore: number | null;
  headerCellCountAfter: number | null;
  irregularRowsBefore: number | null;
  irregularRowsAfter: number | null;
  stronglyIrregularTableCountBefore: number | null;
  stronglyIrregularTableCountAfter: number | null;
  note: string | null;
}

export interface PacTableHeaderDiagnosticRow {
  fileId: string;
  file: string;
  role: 'target' | 'control';
  score: number | null;
  grade: string | null;
  tableMarkupScore: number | null;
  tableMarkupApplicable: boolean | null;
  strictTableCaps: Array<{ ruleId: string; cap: number; rawScore: number; finalScore: number }>;
  tableSignals: Record<string, number | null>;
  tableHeaderAudit: NonNullable<DocumentSnapshot['tableHeaderAudit']> | null;
  tables: TableEvidenceRow[];
  tableTools: TableToolInvariantRow[];
  fiveReviewBuckets: string[];
  fiveReviewLeafFamilies: string[];
  classification: TableHeaderTargetClassification;
  classificationReason: string;
}

export interface PacTableHeaderTargetDiagnostic {
  generatedAt: string;
  runDir: string;
  fiveReviewSource: string | null;
  targets: string[];
  controls: string[];
  summary: {
    rowCount: number;
    targetCount: number;
    controlCount: number;
    selectedBehavior: 'diagnose_normalize_table_structure' | 'diagnose_set_table_header_cells' | 'diagnose_both_table_tools' | 'no_behavior_candidate';
    candidateFiles: string[];
    noSafeRepairFiles: string[];
  };
  rows: PacTableHeaderDiagnosticRow[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/pac-table-header-target-diagnostic.ts [--run <run-dir>] [--target <id>]... [--control <id>]... [--five-review <dir-or-json>] [--out <dir>]',
  ].join('\n');
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function effectiveScore(row: RemediateBenchmarkRow): number | null {
  return row.reanalyzedScore ?? row.afterScore ?? null;
}

function effectiveGrade(row: RemediateBenchmarkRow): string | null {
  return row.reanalyzedGrade ?? row.afterGrade ?? null;
}

function effectiveCategories(row: RemediateBenchmarkRow): ScoredCategory[] {
  return row.reanalyzedCategories?.length ? row.reanalyzedCategories : row.afterCategories ?? [];
}

function categoryFor(row: RemediateBenchmarkRow, key: CategoryKey): { score: number | null; applicable: boolean | null } {
  const category = effectiveCategories(row).find(item => item.key === key);
  if (!category) return { score: null, applicable: null };
  return {
    score: typeof category.score === 'number' ? category.score : null,
    applicable: category.applicable !== false,
  };
}

function effectiveCaps(row: RemediateBenchmarkRow): ScoreCapApplied[] {
  return row.reanalyzedScoreCapsApplied?.length ? row.reanalyzedScoreCapsApplied : row.afterScoreCapsApplied ?? [];
}

function pacRuleIdFromCap(cap: ScoreCapApplied): string | null {
  return cap.reason.startsWith(PAC_CAP_REASON_PREFIX)
    ? cap.reason.slice(PAC_CAP_REASON_PREFIX.length).trim()
    : null;
}

export function strictTableCaps(row: RemediateBenchmarkRow): PacTableHeaderDiagnosticRow['strictTableCaps'] {
  return effectiveCaps(row)
    .map(cap => ({ cap, ruleId: pacRuleIdFromCap(cap) }))
    .filter((item): item is { cap: ScoreCapApplied; ruleId: string } => Boolean(item.ruleId && TABLE_RULES.has(item.ruleId)))
    .map(({ cap, ruleId }) => ({
      ruleId,
      cap: cap.cap,
      rawScore: cap.rawScore,
      finalScore: cap.finalScore,
    }))
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

function tableSignalsFromRow(row: RemediateBenchmarkRow): Record<string, number | null> {
  const profile = row.reanalyzedDetectionProfile ?? row.afterDetectionProfile ?? row.beforeDetectionProfile;
  const signals = asRecord(profile?.tableSignals);
  return {
    tablesWithMisplacedCells: num(signals['tablesWithMisplacedCells']),
    misplacedCellCount: num(signals['misplacedCellCount']),
    irregularTableCount: num(signals['irregularTableCount']),
    stronglyIrregularTableCount: num(signals['stronglyIrregularTableCount']),
    directCellUnderTableCount: num(signals['directCellUnderTableCount']),
  };
}

function tablesFromSnapshot(snapshot?: DocumentSnapshot | null): TableEvidenceRow[] {
  return (snapshot?.tables ?? [])
    .map(table => ({
      structRef: table.structRef ?? null,
      page: typeof table.page === 'number' ? table.page : null,
      rowCount: typeof table.rowCount === 'number' ? table.rowCount : null,
      totalCells: typeof table.totalCells === 'number' ? table.totalCells : null,
      headerCount: typeof table.headerCount === 'number' ? table.headerCount : null,
      hasHeaders: typeof table.hasHeaders === 'boolean' ? table.hasHeaders : null,
      cellsMisplacedCount: typeof table.cellsMisplacedCount === 'number' ? table.cellsMisplacedCount : null,
      irregularRows: typeof table.irregularRows === 'number' ? table.irregularRows : null,
    }))
    .sort((a, b) => String(a.structRef ?? '').localeCompare(String(b.structRef ?? '')) || (a.page ?? 0) - (b.page ?? 0));
}

function parseToolDetails(details: unknown): Record<string, unknown> {
  if (typeof details === 'string') {
    try {
      return asRecord(JSON.parse(details));
    } catch {
      return {};
    }
  }
  return asRecord(details);
}

export function tableToolRows(tools: AppliedRemediationTool[]): TableToolInvariantRow[] {
  return tools
    .filter(tool => TABLE_TOOLS.has(tool.toolName))
    .map(tool => {
      const details = parseToolDetails(tool.details);
      const invariants = asRecord(details['invariants']);
      return {
        toolName: tool.toolName,
        outcome: tool.outcome,
        scoreBefore: tool.scoreBefore,
        scoreAfter: tool.scoreAfter,
        targetRef: str(invariants['targetRef']),
        targetResolved: bool(invariants['targetResolved']),
        resolvedRole: str(invariants['resolvedRole']),
        directCellsUnderTableBefore: num(invariants['directCellsUnderTableBefore']),
        directCellsUnderTableAfter: num(invariants['directCellsUnderTableAfter']),
        headerCellCountBefore: num(invariants['headerCellCountBefore']),
        headerCellCountAfter: num(invariants['headerCellCountAfter']),
        irregularRowsBefore: num(invariants['irregularRowsBefore']),
        irregularRowsAfter: num(invariants['irregularRowsAfter']),
        stronglyIrregularTableCountBefore: num(invariants['stronglyIrregularTableCountBefore']),
        stronglyIrregularTableCountAfter: num(invariants['stronglyIrregularTableCountAfter']),
        note: str(details['note']),
      };
    })
    .sort((a, b) => a.toolName.localeCompare(b.toolName) || a.scoreBefore - b.scoreBefore || a.scoreAfter - b.scoreAfter);
}

function fiveReviewLinks(value: unknown): { buckets: string[]; leafFamilies: string[] } {
  const root = asRecord(value);
  const files = Array.isArray(root['files']) ? root['files'] : [];
  const buckets = new Set<string>();
  const leafFamilies = new Set<string>();
  for (const file of files) {
    const leafCoverage = Array.isArray(asRecord(file)['leafCoverage']) ? asRecord(file)['leafCoverage'] as unknown[] : [];
    for (const leaf of leafCoverage) {
      const record = asRecord(leaf);
      const ids = [
        ...(Array.isArray(record['scoreInfluencingRuleIds']) ? record['scoreInfluencingRuleIds'] as unknown[] : []),
        ...(Array.isArray(record['internalRuleIds']) ? record['internalRuleIds'] as unknown[] : []),
      ];
      if (!ids.some(id => typeof id === 'string' && TABLE_RULES.has(id))) continue;
      const bucket = str(record['bucket']);
      const family = str(record['family']);
      if (bucket) buckets.add(bucket);
      if (family) leafFamilies.add(family);
    }
  }
  return { buckets: sortedUnique(buckets), leafFamilies: sortedUnique(leafFamilies) };
}

export function classifyTableHeaderRow(input: {
  role: 'target' | 'control';
  score: number | null;
  grade: string | null;
  caps: PacTableHeaderDiagnosticRow['strictTableCaps'];
  tableSignals: Record<string, number | null>;
  tableHeaderAudit: NonNullable<DocumentSnapshot['tableHeaderAudit']> | null;
  tables: TableEvidenceRow[];
  tableTools: TableToolInvariantRow[];
  error?: string;
}): { classification: TableHeaderTargetClassification; reason: string } {
  const { role, score, caps, tableSignals, tableHeaderAudit, tables, tableTools, error } = input;
  if (error) return { classification: 'parked_or_runtime_debt', reason: `Benchmark row errored: ${error}` };
  if (role === 'control' && score !== null && score >= 90) {
    return { classification: 'control_high_grade_with_residual_cap', reason: 'Control row is already A-grade despite table/header strict caps.' };
  }
  if (caps.length === 0) {
    return { classification: 'real_table_debt_no_safe_repair', reason: 'No strict table/header PAC caps are present on this row.' };
  }
  if (tableHeaderAudit && tableHeaderAudit.tablesChecked > 0) {
    if (tableHeaderAudit.headerAssociationMissingCount > 0 || tableHeaderAudit.dataCellsWithoutHeaderCount > 0) {
      const hasStableTable = tables.some(table => table.structRef);
      return {
        classification: hasStableTable ? 'safe_existing_table_repair_candidate' : 'needs_stable_table_identity',
        reason: hasStableTable
          ? 'Direct table-header audit finds missing associations and at least one stable table structRef.'
          : 'Direct table-header audit finds missing associations, but no stable table structRef is available.',
      };
    }
    if (tableHeaderAudit.orphanHeaderCellCount > 0) {
      return { classification: 'headers_exist_but_not_associated', reason: 'Header cells exist but appear orphaned or unassociated.' };
    }
  }
  const irregular = (tableSignals['stronglyIrregularTableCount'] ?? 0) > 0 || (tableSignals['irregularTableCount'] ?? 0) > 0 ||
    tables.some(table => (table.irregularRows ?? 0) > 0);
  if (irregular) return { classification: 'irregular_rows_first', reason: 'Table/header debt is mixed with irregular row structure that should be handled first.' };
  const missingHeaders = tables.some(table => table.hasHeaders === false || (table.headerCount ?? 0) === 0);
  if (missingHeaders) return { classification: 'missing_headers_only', reason: 'Table structure is identifiable but lacks TH/header cells.' };
  const noTargetRefs = tableTools.some(tool => TABLE_TOOLS.has(tool.toolName) && tool.targetRef === null) || !tables.some(table => table.structRef);
  if (noTargetRefs) return { classification: 'needs_stable_table_identity', reason: 'Existing table tools ran without target refs or table structs lack stable identity.' };
  return { classification: 'real_table_debt_no_safe_repair', reason: 'Strict PAC table cap remains, but current evidence does not prove a safe existing repair path.' };
}

export function buildPacTableHeaderTargetDiagnostic(input: {
  runDir: string;
  rows: RemediateBenchmarkRow[];
  targets: string[];
  controls: string[];
  snapshotsById?: Map<string, DocumentSnapshot>;
  fiveReview?: unknown;
  generatedAt?: string;
}): PacTableHeaderTargetDiagnostic {
  const selected = new Set([...input.targets, ...input.controls]);
  const review = fiveReviewLinks(input.fiveReview);
  const rows = input.rows
    .filter(row => selected.has(row.id))
    .map(row => {
      const role: 'target' | 'control' = input.targets.includes(row.id) ? 'target' : 'control';
      const tableMarkup = categoryFor(row, 'table_markup');
      const snapshot = input.snapshotsById?.get(row.id);
      const caps = strictTableCaps(row);
      const tableSignals = tableSignalsFromRow(row);
      const tableHeaderAudit = snapshot?.tableHeaderAudit ?? null;
      const tables = tablesFromSnapshot(snapshot);
      const tools = tableToolRows(row.appliedTools ?? []);
      const classification = classifyTableHeaderRow({
        role,
        score: effectiveScore(row),
        grade: effectiveGrade(row),
        caps,
        tableSignals,
        tableHeaderAudit,
        tables,
        tableTools: tools,
        error: row.error,
      });
      return {
        fileId: row.id,
        file: row.file,
        role,
        score: effectiveScore(row),
        grade: effectiveGrade(row),
        tableMarkupScore: tableMarkup.score,
        tableMarkupApplicable: tableMarkup.applicable,
        strictTableCaps: caps,
        tableSignals,
        tableHeaderAudit,
        tables,
        tableTools: tools,
        fiveReviewBuckets: review.buckets,
        fiveReviewLeafFamilies: review.leafFamilies,
        classification: classification.classification,
        classificationReason: classification.reason,
      };
    })
    .sort((a, b) => a.role.localeCompare(b.role) || a.fileId.localeCompare(b.fileId));

  const candidateFiles = sortedUnique(rows
    .filter(row => row.role === 'target' && (row.classification === 'safe_existing_table_repair_candidate' || row.classification === 'missing_headers_only' || row.classification === 'headers_exist_but_not_associated'))
    .map(row => row.fileId));
  const targetRows = rows.filter(row => row.role === 'target');
  const hasNormalize = targetRows.some(row => row.classification === 'irregular_rows_first' || (row.tableSignals.directCellUnderTableCount ?? 0) > 0 || (row.tableSignals.misplacedCellCount ?? 0) > 0);
  const hasHeader = targetRows.some(row => row.classification === 'missing_headers_only' || row.classification === 'headers_exist_but_not_associated' || row.classification === 'safe_existing_table_repair_candidate');
  const selectedBehavior = hasNormalize && hasHeader
    ? 'diagnose_both_table_tools'
    : hasNormalize
      ? 'diagnose_normalize_table_structure'
      : hasHeader
        ? 'diagnose_set_table_header_cells'
        : 'no_behavior_candidate';

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runDir: input.runDir,
    fiveReviewSource: null,
    targets: input.targets,
    controls: input.controls,
    summary: {
      rowCount: rows.length,
      targetCount: rows.filter(row => row.role === 'target').length,
      controlCount: rows.filter(row => row.role === 'control').length,
      selectedBehavior,
      candidateFiles,
      noSafeRepairFiles: sortedUnique(rows
        .filter(row => row.role === 'target' && (row.classification === 'needs_stable_table_identity' || row.classification === 'real_table_debt_no_safe_repair'))
        .map(row => row.fileId)),
    },
    rows,
  };
}

function tableRow(values: Array<string | number | null | undefined>): string {
  return `| ${values.map(value => String(value ?? '')).join(' | ')} |`;
}

function renderList(values: string[], limit = 8): string {
  if (values.length === 0) return 'none';
  const shown = values.slice(0, limit).join(', ');
  return values.length > limit ? `${shown}, +${values.length - limit} more` : shown;
}

function renderTableSignals(signals: Record<string, number | null>): string {
  return Object.entries(signals).map(([key, value]) => `${key}=${value ?? 'n/a'}`).join(', ');
}

export function renderPacTableHeaderTargetMarkdown(report: PacTableHeaderTargetDiagnostic): string {
  const lines: string[] = [];
  lines.push('# PAC Table/Header Target Diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Run: ${report.runDir}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Rows inspected: ${report.summary.rowCount}`);
  lines.push(`- Targets: ${renderList(report.targets)}`);
  lines.push(`- Controls: ${renderList(report.controls, 12)}`);
  lines.push(`- Selected next behavior probe: ${report.summary.selectedBehavior}`);
  lines.push(`- Candidate files: ${renderList(report.summary.candidateFiles)}`);
  lines.push(`- No-safe-repair files: ${renderList(report.summary.noSafeRepairFiles)}`);
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push(tableRow(['file', 'role', 'score', 'grade', 'table', 'caps', 'classification', 'reason']));
  lines.push(tableRow(['---', '---', '---:', '---', '---:', '---', '---', '---']));
  for (const row of report.rows) {
    lines.push(tableRow([
      row.fileId,
      row.role,
      row.score,
      row.grade,
      row.tableMarkupScore,
      renderList(row.strictTableCaps.map(cap => cap.ruleId), 2),
      row.classification,
      row.classificationReason,
    ]));
  }
  lines.push('');
  lines.push('## Table Evidence');
  for (const row of report.rows) {
    lines.push('');
    lines.push(`### ${row.fileId}`);
    lines.push('');
    lines.push(`- Table signals: ${renderTableSignals(row.tableSignals)}`);
    lines.push(`- Table header audit: \`${JSON.stringify(row.tableHeaderAudit)}\``);
    lines.push(`- Five-PDF PAC buckets: ${renderList(row.fiveReviewBuckets)}`);
    lines.push(`- Five-PDF leaf families: ${renderList(row.fiveReviewLeafFamilies)}`);
    lines.push('');
    lines.push(tableRow(['structRef', 'page', 'rows', 'cells', 'headers', 'hasHeaders', 'misplaced', 'irregular']));
    lines.push(tableRow(['---', '---:', '---:', '---:', '---:', '---', '---:', '---:']));
    for (const table of row.tables.slice(0, 20)) {
      lines.push(tableRow([table.structRef, table.page, table.rowCount, table.totalCells, table.headerCount, table.hasHeaders === null ? null : String(table.hasHeaders), table.cellsMisplacedCount, table.irregularRows]));
    }
    if (row.tables.length === 0) lines.push(tableRow(['none', '', '', '', '', '', '', '']));
    lines.push('');
    lines.push(tableRow(['tool', 'outcome', 'before', 'after', 'target', 'headers before/after', 'irregular before/after', 'note']));
    lines.push(tableRow(['---', '---', '---:', '---:', '---', '---', '---', '---']));
    for (const tool of row.tableTools) {
      lines.push(tableRow([
        tool.toolName,
        tool.outcome,
        tool.scoreBefore,
        tool.scoreAfter,
        tool.targetRef,
        `${tool.headerCellCountBefore ?? 'n/a'} -> ${tool.headerCellCountAfter ?? 'n/a'}`,
        `${tool.irregularRowsBefore ?? 'n/a'} -> ${tool.irregularRowsAfter ?? 'n/a'}`,
        tool.note,
      ]));
    }
    if (row.tableTools.length === 0) lines.push(tableRow(['none', '', '', '', '', '', '', '']));
  }
  lines.push('');
  return lines.join('\n');
}

async function readJsonMaybe(path: string): Promise<unknown> {
  const resolved = resolve(path);
  const jsonPath = resolved.endsWith('.json') ? resolved : join(resolved, 'pac-review-gap-diagnostic.json');
  return JSON.parse(await readFile(jsonPath, 'utf8')) as unknown;
}

async function pdfExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function analyzeSnapshots(runDir: string, ids: string[]): Promise<Map<string, DocumentSnapshot>> {
  const snapshots = new Map<string, DocumentSnapshot>();
  for (const id of ids) {
    const pdfPath = resolve(runDir, 'pdfs', `${id}.pdf`);
    if (!await pdfExists(pdfPath)) continue;
    const analyzed = await analyzePdf(pdfPath, `${id}.pdf`, { timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS, bypassCache: true });
    snapshots.set(id, analyzed.snapshot);
  }
  return snapshots;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let run = DEFAULT_RUN;
  let fiveReview = DEFAULT_FIVE_REVIEW;
  let out = DEFAULT_OUT;
  const targets: string[] = [];
  const controls: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--run') run = args[++index] ?? DEFAULT_RUN;
    else if (arg === '--target') targets.push(args[++index] ?? '');
    else if (arg === '--control') controls.push(args[++index] ?? '');
    else if (arg === '--five-review') fiveReview = args[++index] ?? '';
    else if (arg === '--out') out = args[++index] ?? DEFAULT_OUT;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  const selectedTargets = targets.filter(Boolean).length ? sortedUnique(targets.filter(Boolean)) : DEFAULT_TARGETS;
  const selectedControls = controls.filter(Boolean).length ? sortedUnique(controls.filter(Boolean)) : DEFAULT_CONTROLS;
  const loaded = await loadBenchmarkRowsFromRunDir(run);
  const ids = sortedUnique([...selectedTargets, ...selectedControls]);
  const [snapshots, fiveReviewData] = await Promise.all([
    analyzeSnapshots(run, ids),
    fiveReview ? readJsonMaybe(fiveReview) : Promise.resolve(null),
  ]);
  const report = buildPacTableHeaderTargetDiagnostic({
    runDir: run,
    rows: loaded.remediateResults,
    targets: selectedTargets,
    controls: selectedControls,
    snapshotsById: snapshots,
    fiveReview: fiveReviewData,
  });
  report.fiveReviewSource = fiveReview || null;
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pac-table-header-target-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'pac-table-header-target-diagnostic.md'), renderPacTableHeaderTargetMarkdown(report), 'utf8');
  console.log(`Wrote PAC table/header target diagnostic to ${outDir}`);
  console.log(`Selected behavior probe: ${report.summary.selectedBehavior}`);
  console.log(`Candidate files: ${report.summary.candidateFiles.join(', ') || 'none'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
