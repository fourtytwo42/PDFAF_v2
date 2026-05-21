#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-odl-diagnostics';
const CONTROL_PATH_RE = /(?:^|\/)Input\/experiment-corpus\//;
const CONTROL_ID_RE = /(?:fixture|teams|adam2|accessible)/i;
const TABLE_TOOLS = new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']);

type JsonRecord = Record<string, unknown>;

export type TableTransactionClassification =
  | 'transaction_ready_dense_table'
  | 'irregular_shape_first'
  | 'header_assoc_only'
  | 'layout_table_control_noise'
  | 'runtime_or_analyzer_debt'
  | 'no_native_support';

export interface TableTransactionArgs {
  sidecar?: string;
  runs: string[];
  outDir: string;
  limit?: number;
  includeControls: boolean;
}

export interface TableSidecarRow {
  id: string;
  pdfPath: string;
  title?: string;
  pdfaf?: {
    status?: string;
    summary?: {
      score?: number;
      grade?: string;
      pageCount?: number;
      categoryScores?: Record<string, number | null>;
      tableCount?: number;
      tableShapes?: Array<{ rows?: number | null; columns?: number | null; totalCells?: number | null }>;
      detectionProfile?: {
        tableSignals?: {
          tablesWithMisplacedCells?: number;
          misplacedCellCount?: number;
          irregularTableCount?: number;
          stronglyIrregularTableCount?: number;
          directCellUnderTableCount?: number;
          layoutTableCandidateCount?: number;
          denseRowBandTableCandidateCount?: number;
        };
      };
      layoutAudit?: {
        sampledPageCount?: number;
        layoutTableCandidateCount?: number;
        denseRowBandTableCandidateCount?: number;
        undersegmentedTableCandidateCount?: number;
        repeatedHeaderFooterPageCount?: number;
      };
    };
  };
  odl?: {
    status?: string;
    summary?: {
      tableCount?: number;
      denseTableHintCount?: number;
      undersegmentedTableHintCount?: number;
    };
  };
  comparison?: {
    supportedLane?: string;
    tableDelta?: number | null;
    reason?: string;
  };
  scoringCalibration?: {
    suggestedScoringAction?: string;
    reason?: string;
  };
}

export interface SidecarReport {
  createdAt?: string;
  args?: Record<string, unknown>;
  rows: TableSidecarRow[];
}

export interface BenchmarkEvidence {
  id: string;
  sourceRun: string;
  score: number | null;
  grade: string | null;
  tableMarkup: number | null;
  durationMs: number | null;
  hardError: boolean;
  error: string | null;
  falsePositiveApplied: boolean | null;
  tableToolCount: number;
  appliedTableToolCount: number;
}

export interface TableTransactionFeatures {
  score: number | null;
  grade: string | null;
  tableMarkup: number | null;
  pdfafTableCount: number;
  odlTableCount: number;
  tableDelta: number | null;
  sampledPageCount: number;
  layoutTableCandidateCount: number;
  denseRowBandTableCandidateCount: number;
  undersegmentedTableCandidateCount: number;
  repeatedHeaderFooterPageCount: number;
  irregularTableCount: number;
  stronglyIrregularTableCount: number;
  directCellUnderTableCount: number;
  misplacedCellCount: number;
  stableTableRefs: boolean;
  nativeDenseEvidence: boolean;
  nativeTableEvidence: boolean;
  lowTableScore: boolean;
  highGradeControl: boolean;
  tableShapeDebt: boolean;
  headerAssociationDebt: boolean;
  sidecarTableLane: boolean;
}

export interface TableTransactionRow {
  id: string;
  pdfPath: string;
  title: string;
  role: 'focus' | 'control';
  classification: TableTransactionClassification;
  promotionSupported: boolean;
  recommendedFirstTool: 'normalize_table_structure' | 'set_table_header_cells' | 'none';
  reasons: string[];
  features: TableTransactionFeatures;
  benchmarkEvidence: BenchmarkEvidence[];
}

export interface TableTransactionReport {
  createdAt: string;
  sidecarPath: string;
  outDir: string;
  benchmarkRuns: string[];
  selectedRowCount: number;
  classificationDistribution: Record<TableTransactionClassification, number>;
  decision: {
    status:
      | 'plan_table_transaction_behavior_stage'
      | 'diagnostic_only_controls_trigger'
      | 'diagnostic_only_runtime_or_analyzer_debt'
      | 'diagnostic_only_insufficient_evidence';
    reasons: string[];
  };
  rows: TableTransactionRow[];
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function defaultOutDir(): string {
  return join(DEFAULT_OUT_ROOT, `table-undersegmentation-transaction-${timestampSlug()}`);
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/table-undersegmentation-transaction-diagnostic.ts [options]

Options:
  --sidecar <path>      ODL sidecar comparison-report.json (default: latest under ${DEFAULT_OUT_ROOT})
  --run <path>          Optional benchmark baseline_report.json to attach row evidence; repeatable
  --out <dir>           Output directory (default: ${DEFAULT_OUT_ROOT}/table-undersegmentation-transaction-<timestamp>)
  --limit <n>           Limit selected sidecar rows after focus/control selection
  --include-controls    Include original-corpus controls (default)
  --no-controls         Exclude original-corpus controls
  --help                Show this help

This script is diagnostic-only. It reads existing JSON artifacts and never calls OpenDataLoader, remediates PDFs, mutates PDFs, or changes scoring/planning behavior.`;
}

export function parseArgs(argv = process.argv.slice(2)): TableTransactionArgs {
  let sidecar: string | undefined;
  const runs: string[] = [];
  let outDir = defaultOutDir();
  let limit: number | undefined;
  let includeControls = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--sidecar') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --sidecar\n${usage()}`);
      sidecar = resolve(value);
    } else if (arg === '--run') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --run\n${usage()}`);
      runs.push(resolve(value));
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --out\n${usage()}`);
      outDir = resolve(value);
    } else if (arg === '--limit') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value < 1) throw new Error('--limit must be a positive number');
      limit = Math.floor(value);
    } else if (arg === '--include-controls') {
      includeControls = true;
    } else if (arg === '--no-controls') {
      includeControls = false;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  return { sidecar, runs, outDir, limit, includeControls };
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function categoryScoreFromArray(categories: unknown, key: string): number | null {
  if (!Array.isArray(categories)) return null;
  for (const category of categories) {
    const record = asRecord(category);
    if (str(record['key']) === key) return num(record['score']);
  }
  return null;
}

function canonicalKey(value: string | undefined | null): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  return basename(raw, extname(raw)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function collectComparisonReports(root: string, depth = 3): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const reports: string[] = [];
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isFile() && entry.name === 'comparison-report.json') {
      reports.push(fullPath);
    } else if (entry.isDirectory() && depth > 0) {
      reports.push(...await collectComparisonReports(fullPath, depth - 1));
    }
  }
  return reports;
}

export async function findLatestSidecarReport(root = DEFAULT_OUT_ROOT): Promise<string> {
  const reports = await collectComparisonReports(root);
  if (reports.length === 0) {
    throw new Error(`No comparison-report.json files found under ${root}. Provide --sidecar.`);
  }
  const withMtime = await Promise.all(reports.map(async reportPath => ({
    reportPath,
    mtimeMs: (await stat(reportPath)).mtimeMs,
  })));
  return withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]!.reportPath;
}

export async function loadSidecarReport(sidecarPath: string): Promise<SidecarReport> {
  const raw = await readFile(sidecarPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<SidecarReport>;
  if (!Array.isArray(parsed.rows)) {
    throw new Error(`Sidecar report has no rows array: ${sidecarPath}`);
  }
  return { ...parsed, rows: parsed.rows as TableSidecarRow[] };
}

function rowRecords(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => rowRecords(item));
  }
  const root = asRecord(value);
  if (Object.keys(root).length === 0) return [];
  for (const key of ['rows', 'results', 'items', 'pdfs', 'files', 'documents']) {
    if (Array.isArray(root[key])) return rowRecords(root[key]);
  }
  return [root];
}

function benchmarkId(row: JsonRecord): string {
  const direct = str(row['id']) || str(row['publicationId']);
  if (direct) return direct;
  const file = str(row['file']) || str(row['filename']) || str(row['pdfPath']) || str(row['sourcePath']);
  return file ? basename(file, extname(file)) : '';
}

function benchmarkScore(row: JsonRecord): number | null {
  return num(row['afterScore']) ?? num(row['afterDeterministicScore']) ?? num(row['score']);
}

function benchmarkGrade(row: JsonRecord): string | null {
  return str(row['afterGrade']) || str(row['afterDeterministicGrade']) || str(row['grade']) || null;
}

function benchmarkTableMarkup(row: JsonRecord): number | null {
  return num(row['tableMarkup'])
    ?? categoryScoreFromArray(row['afterCategories'], 'table_markup')
    ?? categoryScoreFromArray(row['categoriesAfter'], 'table_markup');
}

function benchmarkHardError(row: JsonRecord): { hardError: boolean; error: string | null } {
  const error = str(row['error']) || str(row['failure']) || str(row['message']) || null;
  const score = benchmarkScore(row);
  const timeout = error ? /timeout|timed out|per_pdf_timeout/i.test(error) : false;
  return { hardError: timeout || (score === 0 && Boolean(error)), error };
}

function benchmarkTableToolCounts(row: JsonRecord): { tableToolCount: number; appliedTableToolCount: number } {
  const tools = Array.isArray(row['appliedTools']) ? row['appliedTools'] as unknown[] : [];
  let tableToolCount = 0;
  let appliedTableToolCount = 0;
  for (const tool of tools) {
    const record = asRecord(tool);
    const name = str(record['toolName']) || str(record['name']);
    if (!TABLE_TOOLS.has(name)) continue;
    tableToolCount += 1;
    if (str(record['outcome']) === 'applied') appliedTableToolCount += 1;
  }
  return { tableToolCount, appliedTableToolCount };
}

export async function loadBenchmarkEvidence(runPath: string): Promise<BenchmarkEvidence[]> {
  const raw = await readFile(runPath, 'utf8');
  const rows = rowRecords(JSON.parse(raw) as unknown);
  return rows.flatMap(row => {
    const id = benchmarkId(row);
    if (!id) return [];
    const { hardError, error } = benchmarkHardError(row);
    const tools = benchmarkTableToolCounts(row);
    return [{
      id,
      sourceRun: runPath,
      score: benchmarkScore(row),
      grade: benchmarkGrade(row),
      tableMarkup: benchmarkTableMarkup(row),
      durationMs: num(row['durationMs']) ?? num(row['runtimeMs']),
      hardError,
      error,
      falsePositiveApplied: bool(row['falsePositiveApplied']),
      ...tools,
    }];
  });
}

function indexBenchmarkEvidence(evidence: BenchmarkEvidence[]): Map<string, BenchmarkEvidence[]> {
  const map = new Map<string, BenchmarkEvidence[]>();
  for (const row of evidence) {
    const keys = new Set([row.id, canonicalKey(row.id)]);
    for (const key of keys) {
      if (!key) continue;
      const rows = map.get(key) ?? [];
      rows.push(row);
      map.set(key, rows);
    }
  }
  return map;
}

export function isOriginalControlRow(row: Pick<TableSidecarRow, 'id' | 'pdfPath' | 'title'>): boolean {
  return CONTROL_PATH_RE.test(row.pdfPath) || CONTROL_ID_RE.test(row.id) || CONTROL_ID_RE.test(row.title ?? '');
}

export function selectTableSidecarRows(
  rows: TableSidecarRow[],
  includeControls = true,
  limit?: number,
): Array<TableSidecarRow & { role: 'focus' | 'control' }> {
  const selected: Array<TableSidecarRow & { role: 'focus' | 'control' }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const isFocus = row.scoringCalibration?.suggestedScoringAction === 'table_undersegmentation_candidate';
    const isControl = isOriginalControlRow(row);
    if (!isFocus && !(includeControls && isControl)) continue;
    const key = row.pdfPath || row.id;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({ ...row, role: isControl ? 'control' : 'focus' });
    if (typeof limit === 'number' && selected.length >= limit) break;
  }
  return selected;
}

function rowBenchmarkEvidence(row: TableSidecarRow, evidenceByKey: Map<string, BenchmarkEvidence[]>): BenchmarkEvidence[] {
  const keys = new Set([
    row.id,
    canonicalKey(row.id),
    canonicalKey(row.pdfPath),
    canonicalKey(row.title),
  ]);
  const evidence: BenchmarkEvidence[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (!key) continue;
    for (const item of evidenceByKey.get(key) ?? []) {
      const evidenceKey = `${item.sourceRun}:${item.id}`;
      if (seen.has(evidenceKey)) continue;
      seen.add(evidenceKey);
      evidence.push(item);
    }
  }
  return evidence;
}

function extractFeatures(row: TableSidecarRow, benchmarkEvidence: BenchmarkEvidence[]): TableTransactionFeatures {
  const summary = row.pdfaf?.summary;
  const categoryScores = summary?.categoryScores ?? {};
  const tableSignals = summary?.detectionProfile?.tableSignals ?? {};
  const layout = summary?.layoutAudit ?? {};
  const score = num(summary?.score) ?? benchmarkEvidence.find(item => item.score !== null)?.score ?? null;
  const grade = str(summary?.grade) || benchmarkEvidence.find(item => item.grade)?.grade || null;
  const tableMarkup = num(categoryScores['table_markup']) ?? benchmarkEvidence.find(item => item.tableMarkup !== null)?.tableMarkup ?? null;
  const pdfafTableCount = num(summary?.tableCount) ?? 0;
  const odlTableCount = num(row.odl?.summary?.tableCount) ?? 0;
  const tableDelta = num(row.comparison?.tableDelta);
  const layoutTableCandidateCount = num(layout.layoutTableCandidateCount) ?? num(tableSignals.layoutTableCandidateCount) ?? 0;
  const denseRowBandTableCandidateCount = num(layout.denseRowBandTableCandidateCount) ?? num(tableSignals.denseRowBandTableCandidateCount) ?? 0;
  const undersegmentedTableCandidateCount = num(layout.undersegmentedTableCandidateCount)
    ?? num(row.odl?.summary?.undersegmentedTableHintCount)
    ?? 0;
  const irregularTableCount = num(tableSignals.irregularTableCount) ?? 0;
  const stronglyIrregularTableCount = num(tableSignals.stronglyIrregularTableCount) ?? 0;
  const directCellUnderTableCount = num(tableSignals.directCellUnderTableCount) ?? 0;
  const misplacedCellCount = num(tableSignals.misplacedCellCount) ?? num(tableSignals.tablesWithMisplacedCells) ?? 0;
  const stableTableRefs = pdfafTableCount > 0 && (summary?.tableShapes?.some(shape =>
    typeof shape.rows === 'number' || typeof shape.columns === 'number' || typeof shape.totalCells === 'number'
  ) ?? true);
  const nativeDenseEvidence = layoutTableCandidateCount >= 3
    && denseRowBandTableCandidateCount >= 2
    && undersegmentedTableCandidateCount >= 2;
  const nativeTableEvidence = layoutTableCandidateCount > 0 || denseRowBandTableCandidateCount > 0 || undersegmentedTableCandidateCount > 0;
  const lowTableScore = typeof tableMarkup === 'number' && tableMarkup < 93;
  const highGradeControl = (typeof score === 'number' && score >= 93) || grade === 'A';
  const tableShapeDebt = irregularTableCount > 0
    || stronglyIrregularTableCount > 0
    || directCellUnderTableCount > 0
    || misplacedCellCount > 0;
  const headerAssociationDebt = lowTableScore && stableTableRefs && !tableShapeDebt;
  const sidecarTableLane = row.scoringCalibration?.suggestedScoringAction === 'table_undersegmentation_candidate'
    || row.comparison?.supportedLane === 'table_structure'
    || (typeof tableDelta === 'number' && tableDelta >= 3);

  return {
    score,
    grade,
    tableMarkup,
    pdfafTableCount,
    odlTableCount,
    tableDelta,
    sampledPageCount: num(layout.sampledPageCount) ?? 0,
    layoutTableCandidateCount,
    denseRowBandTableCandidateCount,
    undersegmentedTableCandidateCount,
    repeatedHeaderFooterPageCount: num(layout.repeatedHeaderFooterPageCount) ?? 0,
    irregularTableCount,
    stronglyIrregularTableCount,
    directCellUnderTableCount,
    misplacedCellCount,
    stableTableRefs,
    nativeDenseEvidence,
    nativeTableEvidence,
    lowTableScore,
    highGradeControl,
    tableShapeDebt,
    headerAssociationDebt,
    sidecarTableLane,
  };
}

export function classifyTableTransactionRow(input: {
  row: TableSidecarRow & { role: 'focus' | 'control' };
  benchmarkEvidence?: BenchmarkEvidence[];
}): TableTransactionRow {
  const benchmarkEvidence = input.benchmarkEvidence ?? [];
  const features = extractFeatures(input.row, benchmarkEvidence);
  const reasons: string[] = [];
  if (features.lowTableScore) reasons.push(`table_markup:${features.tableMarkup}`);
  if (features.nativeDenseEvidence) reasons.push('native_dense_row_band_evidence');
  if (features.sidecarTableLane) reasons.push('odl_native_table_lane');
  if (features.stableTableRefs) reasons.push(`stable_pdfaf_table_refs:${features.pdfafTableCount}`);
  if (features.tableShapeDebt) {
    reasons.push([
      `shape_debt_irregular:${features.irregularTableCount}`,
      `strong:${features.stronglyIrregularTableCount}`,
      `direct:${features.directCellUnderTableCount}`,
      `misplaced:${features.misplacedCellCount}`,
    ].join(','));
  }
  if (features.headerAssociationDebt) reasons.push('header_association_like_debt');
  if (features.highGradeControl) reasons.push(`high_grade_or_score:${features.score ?? features.grade ?? 'unknown'}`);

  const hardEvidence = benchmarkEvidence.filter(item => item.hardError);
  let classification: TableTransactionClassification;
  if (hardEvidence.length > 0) {
    classification = 'runtime_or_analyzer_debt';
    reasons.push(`benchmark_hard_error:${hardEvidence.map(item => item.id).join(',')}`);
  } else if (!features.nativeTableEvidence && !features.sidecarTableLane) {
    classification = 'no_native_support';
    reasons.push('no_native_or_odl_table_signal');
  } else if (input.row.role === 'control' || features.highGradeControl || !features.lowTableScore) {
    classification = 'layout_table_control_noise';
    reasons.push(input.row.role === 'control' ? 'control_row_not_safe_for_table_admission' : 'table_signal_without_low_score_debt');
  } else if (
    features.lowTableScore
    && features.nativeDenseEvidence
    && features.stableTableRefs
    && features.sidecarTableLane
    && (features.tableShapeDebt || features.headerAssociationDebt)
  ) {
    classification = 'transaction_ready_dense_table';
    reasons.push('all_dense_table_transaction_evidence_present');
  } else if (features.lowTableScore && features.stableTableRefs && features.tableShapeDebt) {
    classification = 'irregular_shape_first';
    reasons.push('normalize_table_structure_should_precede_header_work');
  } else if (features.lowTableScore && features.stableTableRefs) {
    classification = 'header_assoc_only';
    reasons.push('set_table_header_cells_candidate_without_shape_debt');
  } else {
    classification = 'layout_table_control_noise';
    reasons.push('table_signal_missing_stable_refs_or_score_debt');
  }

  const recommendedFirstTool =
    classification === 'transaction_ready_dense_table' && features.tableShapeDebt
      ? 'normalize_table_structure'
      : (classification === 'transaction_ready_dense_table' || classification === 'header_assoc_only') && features.headerAssociationDebt
        ? 'set_table_header_cells'
        : classification === 'irregular_shape_first'
          ? 'normalize_table_structure'
          : 'none';

  return {
    id: input.row.id,
    pdfPath: input.row.pdfPath,
    title: input.row.title ?? basename(input.row.pdfPath),
    role: input.row.role,
    classification,
    promotionSupported: classification === 'transaction_ready_dense_table',
    recommendedFirstTool,
    reasons,
    features,
    benchmarkEvidence,
  };
}

export function buildTableTransactionReport(
  rows: TableTransactionRow[],
  sidecarPath: string,
  outDir: string,
  benchmarkRuns: string[],
): TableTransactionReport {
  const classificationDistribution = rows.reduce<Record<TableTransactionClassification, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {} as Record<TableTransactionClassification, number>);
  const focusReady = rows.filter(row => row.role === 'focus' && row.classification === 'transaction_ready_dense_table').length;
  const controlsUnsafe = rows.filter(row =>
    row.role === 'control' && (
      row.classification === 'transaction_ready_dense_table'
      || row.classification === 'irregular_shape_first'
      || row.classification === 'header_assoc_only'
    )
  ).length;
  const hardDebt = rows.filter(row => row.classification === 'runtime_or_analyzer_debt').length;
  const reasons = [
    `transaction_ready_dense_table_focus=${focusReady}`,
    `unsafe_control_candidates=${controlsUnsafe}`,
    `runtime_or_analyzer_debt=${hardDebt}`,
  ];
  let status: TableTransactionReport['decision']['status'];
  if (controlsUnsafe > 0) {
    status = 'diagnostic_only_controls_trigger';
    reasons.push('at_least_one_control_matches_table_admission_shape');
  } else if (focusReady >= 2) {
    status = 'plan_table_transaction_behavior_stage';
    reasons.push('at_least_two_focus_rows_share_dense_table_transaction_evidence_and_controls_are_clean');
  } else if (hardDebt > 0) {
    status = 'diagnostic_only_runtime_or_analyzer_debt';
    reasons.push('runtime_or_analyzer_debt_blocks_behavior_claim');
  } else {
    status = 'diagnostic_only_insufficient_evidence';
    reasons.push('not_enough_control-clean_dense_table_transaction_evidence');
  }

  return {
    createdAt: new Date().toISOString(),
    sidecarPath,
    outDir,
    benchmarkRuns,
    selectedRowCount: rows.length,
    classificationDistribution,
    decision: { status, reasons },
    rows,
  };
}

function mdEscape(value: string | number | boolean | null | undefined): string {
  return String(value ?? 'n/a').replace(/\|/g, '/').replace(/\n/g, ' ');
}

function fmt(value: number | null | undefined, digits = 0): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

export function markdownReport(report: TableTransactionReport): string {
  const lines = [
    '# Table Undersegmentation Transaction Diagnostic',
    '',
    `- Created: ${report.createdAt}`,
    `- Sidecar: \`${report.sidecarPath}\``,
    `- Benchmark runs attached: ${report.benchmarkRuns.length ? report.benchmarkRuns.map(run => `\`${run}\``).join(', ') : 'none'}`,
    `- Rows analyzed: ${report.selectedRowCount}`,
    `- Classification distribution: ${JSON.stringify(report.classificationDistribution)}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'This report is diagnostic-only. It reads existing sidecar/benchmark JSON and does not call OpenDataLoader, change scores, route remediation, or mutate PDFs.',
    '',
    '| Row | Role | Score | Table | Class | First Tool | Native/ODL Evidence | Table Shape Debt | Benchmark Evidence | Reasons |',
    '| --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    const features = row.features;
    const nativeBits = [
      `layout=${features.layoutTableCandidateCount}`,
      `dense=${features.denseRowBandTableCandidateCount}`,
      `under=${features.undersegmentedTableCandidateCount}`,
      `pdfafTables=${features.pdfafTableCount}`,
      `odlTables=${features.odlTableCount}`,
      `delta=${fmt(features.tableDelta)}`,
    ].join(', ');
    const debtBits = [
      `irregular=${features.irregularTableCount}`,
      `strong=${features.stronglyIrregularTableCount}`,
      `direct=${features.directCellUnderTableCount}`,
      `misplaced=${features.misplacedCellCount}`,
      `stableRefs=${features.stableTableRefs}`,
    ].join(', ');
    const benchmark = row.benchmarkEvidence.length
      ? row.benchmarkEvidence.map(item => `${basename(item.sourceRun)}:${fmt(item.score)}/${item.grade ?? 'n/a'} err=${item.hardError}`).join('; ')
      : 'none';
    lines.push([
      row.id,
      row.role,
      `${fmt(features.score)}/${features.grade ?? 'n/a'}`,
      fmt(features.tableMarkup),
      row.classification,
      row.recommendedFirstTool,
      nativeBits,
      debtBits,
      benchmark,
      row.reasons.join('; '),
    ].map(mdEscape).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function runTableUndersegmentationDiagnostic(args: TableTransactionArgs): Promise<TableTransactionReport> {
  const sidecarPath = args.sidecar ?? await findLatestSidecarReport();
  const sidecar = await loadSidecarReport(sidecarPath);
  const selected = selectTableSidecarRows(sidecar.rows, args.includeControls, args.limit);
  if (selected.length === 0) {
    throw new Error('No rows selected from sidecar report. Expected table_undersegmentation_candidate rows or original controls.');
  }

  const benchmarkEvidence = (await Promise.all(args.runs.map(loadBenchmarkEvidence))).flat();
  const evidenceByKey = indexBenchmarkEvidence(benchmarkEvidence);
  const rows = selected.map(row => classifyTableTransactionRow({
    row,
    benchmarkEvidence: rowBenchmarkEvidence(row, evidenceByKey),
  }));
  const report = buildTableTransactionReport(rows, sidecarPath, args.outDir, args.runs);

  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'table-undersegmentation-transaction.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'table-undersegmentation-transaction.md'), markdownReport(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await runTableUndersegmentationDiagnostic(args);
  console.log(`[table-undersegmentation] wrote ${join(args.outDir, 'table-undersegmentation-transaction.md')}`);
  console.log(`[table-undersegmentation] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
