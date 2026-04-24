#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { buildDefaultParams, classifyStage43TableFailure, planForRemediation } from '../src/services/remediation/planner.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot, RemediationPlan } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

type JsonRecord = Record<string, unknown>;

export type Stage62TableTailClass =
  | 'direct_cells'
  | 'rowless_dense'
  | 'strongly_irregular_rows'
  | 'missing_headers_only'
  | 'layout_table_candidate'
  | 'not_safe_table_target'
  | 'parked_analyzer_debt'
  | 'missing_row_or_analysis_error';

export interface Stage62TerminalTableTool {
  toolName: string;
  outcome: string;
  stage: number | null;
  round: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  source: string | null;
  note: unknown;
  targetRef: unknown;
  directCellsUnderTableBefore: unknown;
  directCellsUnderTableAfter: unknown;
  headerCellCountBefore: unknown;
  headerCellCountAfter: unknown;
  tableTreeValidAfter: unknown;
  tableValidityImproved: unknown;
}

export interface Stage62TableSummary {
  structRef: string | null;
  page: number;
  hasHeaders: boolean;
  headerCount: number;
  totalCells: number;
  rowCount: number | null;
  cellsMisplacedCount: number;
  irregularRows: number;
  rowCellCounts: number[];
  dominantColumnCount: number | null;
  maxRowSpan: number | null;
  maxColSpan: number | null;
}

export interface Stage62TableTailInput {
  id: string;
  role: 'focus' | 'control' | 'parked';
  analysis?: AnalysisResult | null;
  snapshot?: DocumentSnapshot | null;
  plan?: RemediationPlan | null;
  terminalTableTools?: Stage62TerminalTableTool[];
  error?: string;
}

export interface Stage62TableTailRow {
  id: string;
  role: 'focus' | 'control' | 'parked';
  classification: Stage62TableTailClass;
  reasons: string[];
  score: number | null;
  grade: string | null;
  tableMarkup: number | null;
  headingStructure: number | null;
  altText: number | null;
  readingOrder: number | null;
  pdfUaCompliance: number | null;
  tableSignals: JsonRecord | null;
  stage43Class: string | null;
  normalizeScheduled: boolean;
  normalizeSkippedReason: string | null;
  normalizeParams: JsonRecord | null;
  tableSummaries: Stage62TableSummary[];
  terminalTableTools: Stage62TerminalTableTool[];
  error?: string;
}

export interface Stage62TableTailReport {
  generatedAt: string;
  rows: Stage62TableTailRow[];
  classificationDistribution: Record<string, number>;
  decision: {
    status: 'implement_strongly_irregular_table_fix' | 'diagnostic_only_no_safe_table_fix' | 'diagnostic_only_inconclusive';
    recommendedNext: string;
    reasons: string[];
  };
}

const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage62-table-tail-diagnostic-2026-04-24-r1';
const DEFAULT_EDGE1_MANIFEST = 'Input/from_sibling_pdfaf_v1_edge_mix/manifest.json';
const DEFAULT_EDGE2_MANIFEST = 'Input/from_sibling_pdfaf_v1_edge_mix_2/manifest.json';
const DEFAULT_EDGE1_RUN = 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage59-edge-mix-2026-04-24-r1';
const DEFAULT_EDGE2_RUN = 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage59-edge-mix2-2026-04-24-r2';
const DEFAULT_IDS = ['v1-4722', 'v1-4178', 'v1-4567', 'v1-4139', 'v1-4122', 'v1-4758', 'v1-4700', 'v1-4699'];
const PARKED_ANALYZER_ROWS = new Set(['v1-4171', 'v1-4487', 'v1-4683']);
const TABLE_TOOLS = new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage62-table-tail-diagnostic.ts [options]',
    `  --out <dir>             Default: ${DEFAULT_OUT}`,
    `  --edge1-manifest <path> Default: ${DEFAULT_EDGE1_MANIFEST}`,
    `  --edge2-manifest <path> Default: ${DEFAULT_EDGE2_MANIFEST}`,
    `  --edge1-run <dir>       Default: ${DEFAULT_EDGE1_RUN}`,
    `  --edge2-run <dir>       Default: ${DEFAULT_EDGE2_RUN}`,
    '  --id <row-id>           Override diagnostic ids; repeatable. Looks in both manifests.',
  ].join('\n');
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeId(value: string): string {
  return value.startsWith('v1-') ? value : `v1-${value}`;
}

function categoryScore(analysis: AnalysisResult | null | undefined, key: string): number | null {
  return analysis?.categories.find(category => category.key === key)?.score ?? null;
}

function parseDetails(details: unknown): JsonRecord {
  if (!details) return {};
  if (typeof details === 'object' && !Array.isArray(details)) return details as JsonRecord;
  if (typeof details !== 'string') return { raw: details };
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { raw: details };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : { raw: details };
  } catch {
    return { raw: details };
  }
}

function nestedRecord(parent: JsonRecord, key: string): JsonRecord {
  const value = parent[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function toolName(tool: JsonRecord): string {
  return str(tool['toolName']) || str(tool['name']) || 'unknown';
}

function terminalTableToolsFromRow(row: JsonRecord | undefined): Stage62TerminalTableTool[] {
  const tools = Array.isArray(row?.['appliedTools']) ? row!['appliedTools'] as JsonRecord[] : [];
  return tools
    .filter(tool => TABLE_TOOLS.has(toolName(tool)))
    .map(tool => {
      const details = parseDetails(tool['details']);
      const invariants = nestedRecord(details, 'invariants');
      const benefits = nestedRecord(details, 'structuralBenefits');
      return {
        toolName: toolName(tool),
        outcome: str(tool['outcome']) || 'unknown',
        stage: num(tool['stage']),
        round: num(tool['round']),
        scoreBefore: num(tool['scoreBefore']),
        scoreAfter: num(tool['scoreAfter']),
        source: str(tool['source']) || null,
        note: details['note'] ?? details['raw'] ?? null,
        targetRef: invariants['targetRef'] ?? null,
        directCellsUnderTableBefore: invariants['directCellsUnderTableBefore'] ?? null,
        directCellsUnderTableAfter: invariants['directCellsUnderTableAfter'] ?? null,
        headerCellCountBefore: invariants['headerCellCountBefore'] ?? null,
        headerCellCountAfter: invariants['headerCellCountAfter'] ?? null,
        tableTreeValidAfter: invariants['tableTreeValidAfter'] ?? null,
        tableValidityImproved: benefits['tableValidityImproved'] ?? null,
      };
    });
}

function tableSummary(table: DocumentSnapshot['tables'][number]): Stage62TableSummary {
  return {
    structRef: table.structRef ?? null,
    page: table.page,
    hasHeaders: table.hasHeaders,
    headerCount: table.headerCount,
    totalCells: table.totalCells,
    rowCount: table.rowCount ?? null,
    cellsMisplacedCount: table.cellsMisplacedCount ?? 0,
    irregularRows: table.irregularRows ?? 0,
    rowCellCounts: table.rowCellCounts ?? [],
    dominantColumnCount: table.dominantColumnCount ?? null,
    maxRowSpan: table.maxRowSpan ?? null,
    maxColSpan: table.maxColSpan ?? null,
  };
}

export function classifyStage62TableTailRow(input: Stage62TableTailInput): Stage62TableTailRow {
  const analysis = input.analysis ?? null;
  const snapshot = input.snapshot ?? null;
  const plan = input.plan ?? null;
  const tableMarkup = categoryScore(analysis, 'table_markup');
  const tableSignals = snapshot?.detectionProfile?.tableSignals ?? null;
  const scheduledTools = plan?.planningSummary?.scheduledTools ?? [];
  const skipped = plan?.planningSummary?.skippedTools?.find(row => row.toolName === 'normalize_table_structure');
  const normalizeScheduled = scheduledTools.includes('normalize_table_structure') ||
    (plan?.stages ?? []).some(stage => stage.tools.some(tool => tool.toolName === 'normalize_table_structure'));
  const tables = snapshot?.tables ?? [];
  const summaries = tables.map(tableSummary);
  const directCells = Number(tableSignals?.directCellUnderTableCount ?? 0);
  const misplaced = Number(tableSignals?.misplacedCellCount ?? 0);
  const stronglyIrregular = Number(tableSignals?.stronglyIrregularTableCount ?? 0);
  const irregular = Number(tableSignals?.irregularTableCount ?? 0);
  const base: Omit<Stage62TableTailRow, 'classification' | 'reasons'> = {
    id: input.id,
    role: input.role,
    score: analysis?.score ?? null,
    grade: analysis?.grade ?? null,
    tableMarkup,
    headingStructure: categoryScore(analysis, 'heading_structure'),
    altText: categoryScore(analysis, 'alt_text'),
    readingOrder: categoryScore(analysis, 'reading_order'),
    pdfUaCompliance: categoryScore(analysis, 'pdf_ua_compliance'),
    tableSignals: tableSignals as JsonRecord | null,
    stage43Class: analysis && snapshot ? classifyStage43TableFailure(snapshot, analysis) : null,
    normalizeScheduled,
    normalizeSkippedReason: skipped?.reason ?? null,
    normalizeParams: analysis && snapshot ? buildDefaultParams('normalize_table_structure', analysis, snapshot, []) : null,
    tableSummaries: summaries,
    terminalTableTools: input.terminalTableTools ?? [],
    ...(input.error ? { error: input.error } : {}),
  };
  const reasons: string[] = [];
  if (input.error || !analysis || !snapshot) {
    reasons.push(input.error ?? 'missing_analysis_or_snapshot');
    return { ...base, classification: 'missing_row_or_analysis_error', reasons };
  }
  if (input.role === 'parked' || PARKED_ANALYZER_ROWS.has(input.id)) {
    reasons.push('row_is_parked_analyzer_volatility_debt');
    return { ...base, classification: 'parked_analyzer_debt', reasons };
  }
  reasons.push(`table_markup=${tableMarkup ?? 'missing'}`);
  reasons.push(`table_count=${tables.length}`);
  reasons.push(`directCellUnderTableCount=${directCells}`);
  reasons.push(`misplacedCellCount=${misplaced}`);
  reasons.push(`irregularTableCount=${irregular}`);
  reasons.push(`stronglyIrregularTableCount=${stronglyIrregular}`);
  reasons.push(`normalizeScheduled=${normalizeScheduled}`);

  const scoredTables = summaries.filter(table => !((table.rowCount ?? 0) <= 1 && table.totalCells <= 2 && table.cellsMisplacedCount === 0));
  if (scoredTables.length === 0 || (tableMarkup ?? 100) >= 70 && directCells === 0 && misplaced === 0 && irregular === 0 && stronglyIrregular === 0) {
    reasons.push('no_low_table_or_malformed_table_evidence');
    return { ...base, classification: 'not_safe_table_target', reasons };
  }
  if (directCells > 0 || misplaced > 0 || scoredTables.some(table => table.cellsMisplacedCount > 0)) {
    return { ...base, classification: 'direct_cells', reasons };
  }
  if (scoredTables.some(table => (table.rowCount ?? 0) <= 1 && table.totalCells >= 4)) {
    return { ...base, classification: 'rowless_dense', reasons };
  }
  if (stronglyIrregular > 0 || scoredTables.some(table => table.irregularRows >= 2)) {
    return { ...base, classification: 'strongly_irregular_rows', reasons };
  }
  if (scoredTables.some(table => !table.hasHeaders && table.totalCells >= 4)) {
    return { ...base, classification: 'missing_headers_only', reasons };
  }
  if ((tableMarkup ?? 100) < 70 && scoredTables.every(table => table.totalCells <= 2 && !table.hasHeaders)) {
    return { ...base, classification: 'layout_table_candidate', reasons };
  }
  reasons.push('table_debt_not_inferable_by_supported_buckets');
  return { ...base, classification: 'not_safe_table_target', reasons };
}

export function buildStage62TableTailReport(rows: Stage62TableTailRow[]): Stage62TableTailReport {
  const classificationDistribution: Record<string, number> = {};
  for (const row of rows) classificationDistribution[row.classification] = (classificationDistribution[row.classification] ?? 0) + 1;
  const focus = rows.find(row => row.id === 'v1-4722');
  const reasons: string[] = [];
  let status: Stage62TableTailReport['decision']['status'] = 'diagnostic_only_inconclusive';
  let recommendedNext = 'Inspect Stage 62 diagnostic before changing table behavior.';
  if (focus?.classification === 'strongly_irregular_rows') {
    status = 'implement_strongly_irregular_table_fix';
    recommendedNext = 'Extend table normalization/planning for low-score strongly irregular dense tables.';
    reasons.push('v1-4722 has stable low table_markup with strongly irregular row evidence and no direct-cell/header-only repair success.');
  } else if (focus && ['direct_cells', 'rowless_dense', 'missing_headers_only'].includes(focus.classification)) {
    status = 'diagnostic_only_inconclusive';
    recommendedNext = 'Use the existing Stage 43 table bucket shown by the diagnostic before adding new behavior.';
    reasons.push(`v1-4722 classification=${focus.classification}`);
  } else if (focus) {
    status = 'diagnostic_only_no_safe_table_fix';
    recommendedNext = 'Do not add a table fixer from this evidence; choose another stable deterministic residual.';
    reasons.push(`v1-4722 classification=${focus.classification}`);
  } else {
    reasons.push('v1-4722 missing from diagnostic rows.');
  }
  return {
    generatedAt: new Date().toISOString(),
    rows,
    classificationDistribution,
    decision: { status, recommendedNext, reasons },
  };
}

function markdown(report: Stage62TableTailReport): string {
  const lines = ['# Stage 62 Table Tail Diagnostic', ''];
  lines.push(`Generated: \`${report.generatedAt}\``);
  lines.push(`Decision: \`${report.decision.status}\``);
  lines.push(`Recommended next: ${report.decision.recommendedNext}`, '');
  lines.push('Reasons:');
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  lines.push('', '## Rows', '');
  lines.push('| ID | Role | Score | Table | Class | Normalize | Terminal Table Tools |');
  lines.push('| --- | --- | ---: | ---: | --- | --- | ---: |');
  for (const row of report.rows) {
    lines.push(`| ${row.id} | ${row.role} | ${row.score ?? 'err'} ${row.grade ?? ''} | ${row.tableMarkup ?? 'n/a'} | ${row.classification} | ${row.normalizeScheduled ? 'yes' : 'no'} | ${row.terminalTableTools.length} |`);
  }
  for (const row of report.rows) {
    lines.push('', `## ${row.id}`, '');
    lines.push(`Reasons: \`${row.reasons.join('; ')}\``);
    lines.push(`Table signals: \`${JSON.stringify(row.tableSignals)}\``);
    lines.push(`Stage43 class: \`${row.stage43Class}\``);
    lines.push(`Normalize skipped reason: \`${row.normalizeSkippedReason ?? 'none'}\``);
    lines.push(`Normalize params: \`${JSON.stringify(row.normalizeParams)}\``);
    lines.push(`Tables: \`${JSON.stringify(row.tableSummaries)}\``);
    lines.push(`Terminal table tools: \`${JSON.stringify(row.terminalTableTools)}\``);
  }
  lines.push('');
  return lines.join('\n');
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function loadRunRows(runDir: string): Promise<Map<string, JsonRecord>> {
  const parsed = await readJson(join(runDir, 'remediate.results.json'));
  const rows = Array.isArray(parsed) ? parsed as JsonRecord[] : [];
  const out = new Map<string, JsonRecord>();
  for (const row of rows) {
    const id = str(row['id']);
    const publicationId = str(row['publicationId']);
    if (id) out.set(normalizeId(id.replace(/^v1-/, '')), row);
    if (publicationId) out.set(normalizeId(publicationId), row);
  }
  return out;
}

function parseArgs(argv: string[]): {
  outDir: string;
  edge1Manifest: string;
  edge2Manifest: string;
  edge1Run: string;
  edge2Run: string;
  ids: string[] | null;
} {
  const args = {
    outDir: DEFAULT_OUT,
    edge1Manifest: DEFAULT_EDGE1_MANIFEST,
    edge2Manifest: DEFAULT_EDGE2_MANIFEST,
    edge1Run: DEFAULT_EDGE1_RUN,
    edge2Run: DEFAULT_EDGE2_RUN,
    ids: null as string[] | null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--out') args.outDir = argv[++i] ?? args.outDir;
    else if (arg === '--edge1-manifest') args.edge1Manifest = argv[++i] ?? args.edge1Manifest;
    else if (arg === '--edge2-manifest') args.edge2Manifest = argv[++i] ?? args.edge2Manifest;
    else if (arg === '--edge1-run') args.edge1Run = argv[++i] ?? args.edge1Run;
    else if (arg === '--edge2-run') args.edge2Run = argv[++i] ?? args.edge2Run;
    else if (arg === '--id') {
      if (!args.ids) args.ids = [];
      args.ids.push(normalizeId(argv[++i] ?? ''));
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return args;
}

async function analyzeManifestRow(
  row: EdgeMixManifestRow,
  role: 'focus' | 'control' | 'parked',
  terminalTableTools: Stage62TerminalTableTool[],
): Promise<Stage62TableTailRow> {
  try {
    const { result, snapshot } = await analyzePdf(row.absolutePath, row.localFile, { bypassCache: true });
    const plan = planForRemediation(result, snapshot, [] as AppliedRemediationTool[]);
    return classifyStage62TableTailRow({ id: row.id, role, analysis: result, snapshot, plan, terminalTableTools });
  } catch (error) {
    return classifyStage62TableTailRow({
      id: row.id,
      role,
      error: error instanceof Error ? error.message : String(error),
      terminalTableTools,
    });
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const edge1Rows = await loadEdgeMixManifest(args.edge1Manifest);
  const edge2Rows = await loadEdgeMixManifest(args.edge2Manifest);
  const edge1RunRows = await loadRunRows(args.edge1Run);
  const edge2RunRows = await loadRunRows(args.edge2Run);
  const selectedIds = args.ids ?? DEFAULT_IDS;
  const rowsById = new Map<string, { row: EdgeMixManifestRow; runRow: JsonRecord | undefined }>();
  for (const row of edge1Rows) rowsById.set(row.id, { row, runRow: edge1RunRows.get(row.id) });
  for (const row of edge2Rows) rowsById.set(row.id, { row, runRow: edge2RunRows.get(row.id) });

  const reports: Stage62TableTailRow[] = [];
  for (const id of selectedIds.map(normalizeId)) {
    const entry = rowsById.get(id);
    const role: 'focus' | 'control' | 'parked' =
      PARKED_ANALYZER_ROWS.has(id) ? 'parked' : (id === 'v1-4722' || id === 'v1-4178') ? 'focus' : 'control';
    if (!entry) {
      reports.push(classifyStage62TableTailRow({ id, role, error: 'row_missing_from_manifests' }));
      continue;
    }
    reports.push(await analyzeManifestRow(entry.row, role, terminalTableToolsFromRow(entry.runRow)));
  }
  const report = buildStage62TableTailReport(reports);
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage62-table-tail-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage62-table-tail-diagnostic.md'), markdown(report), 'utf8');
  console.log(`Wrote ${join(args.outDir, 'stage62-table-tail-diagnostic.md')}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
