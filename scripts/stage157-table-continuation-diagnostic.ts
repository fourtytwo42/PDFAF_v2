#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/stage145-active-low-grade-tail/manifest.json';
const DEFAULT_REFERENCE_RUN = 'Output/stage145-low-grade-tail/run-stage156-active-tail-baseline-2026-04-29-r1';
const DEFAULT_OUT = 'Output/stage145-low-grade-tail/stage157-table-continuation-diagnostic-2026-04-29-r1';

const PARKED_IDS = new Set(['v1-v1-3451', 'v1-v1-3459', 'v1-v1-3602', 'v1-v1-4485', 'v1-v1-4683', 'v1-v1-4171', 'orig-structure-4076']);
const TABLE_TOOLS = new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']);

type Stage157TableClass =
  | 'table_header_continuation_candidate'
  | 'table_normalize_continuation_candidate'
  | 'mixed_table_alt_candidate'
  | 'heading_or_reading_order_blocked'
  | 'analyzer_volatility'
  | 'no_safe_table_target';

interface RunRow {
  id?: string;
  publicationId?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: Array<{ key?: string; score?: number }>;
  falsePositiveAppliedCount?: number;
  falsePositiveApplied?: number;
  appliedTools?: Array<{ toolName?: string; outcome?: string; details?: unknown }>;
}

interface TableTarget {
  structRef: string;
  page: number;
  hasHeaders: boolean;
  totalCells: number;
  rowCount: number;
  cellsMisplacedCount: number;
  irregularRows: number;
  dominantColumnCount: number;
}

interface Stage157TableRow {
  id: string;
  publicationId: string;
  title: string;
  afterScore: number | null;
  afterGrade: string | null;
  headingStructure: number | null;
  readingOrder: number | null;
  altText: number | null;
  tableMarkup: number | null;
  falsePositiveApplied: number;
  tableApplied: number;
  tableRejectedOrNoEffect: number;
  firstTerminalTableReason: string | null;
  attemptedTableRefs: string[];
  headerTargets: TableTarget[];
  normalizeTargets: TableTarget[];
  tableClass: Stage157TableClass;
  implementable: boolean;
  reason: string;
}

interface Stage157TableReport {
  manifest: string;
  referenceRun: string;
  rows: Stage157TableRow[];
  decision: {
    classDistribution: Record<Stage157TableClass, number>;
    selectedRows: string[];
    recommendedDirection: 'implement_bounded_table_continuation' | 'diagnostic_only_no_safe_path';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage157-table-continuation-diagnostic.ts [options]

Options:
  --manifest <path>        Active low-grade tail manifest (default: ${DEFAULT_MANIFEST})
  --reference-run <dir>    Run directory with remediate.results.json (default: ${DEFAULT_REFERENCE_RUN})
  --out <dir>              Output diagnostic directory (default: ${DEFAULT_OUT})
  --file <id>              Limit to manifest id or publication id; repeatable
  --all                    Analyze every manifest row
  --help                   Show this help`;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function category(row: RunRow | undefined, key: string): number | null {
  return num(row?.afterCategories?.find(cat => cat.key === key)?.score);
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function detailNote(details: unknown): string | null {
  const parsed = parseDetails(details);
  if (typeof parsed?.['note'] === 'string') return parsed['note'];
  if (typeof parsed?.['raw'] === 'string') return parsed['raw'];
  return typeof details === 'string' ? details : null;
}

function targetRef(details: unknown): string | null {
  const parsed = parseDetails(details);
  const inv = parsed?.['invariants'];
  if (inv && typeof inv === 'object' && !Array.isArray(inv)) {
    const ref = (inv as Record<string, unknown>)['targetRef'];
    if (typeof ref === 'string' && ref.length > 0) return ref;
  }
  return null;
}

function tableTarget(table: DocumentSnapshot['tables'][number]): TableTarget {
  return {
    structRef: table.structRef ?? '',
    page: table.page,
    hasHeaders: Boolean(table.hasHeaders),
    totalCells: table.totalCells,
    rowCount: table.rowCount ?? 0,
    cellsMisplacedCount: table.cellsMisplacedCount ?? 0,
    irregularRows: table.irregularRows ?? 0,
    dominantColumnCount: table.dominantColumnCount ?? 0,
  };
}

function headerTargets(snapshot: DocumentSnapshot, attemptedRefs: Set<string>): TableTarget[] {
  return snapshot.tables
    .filter(table =>
      typeof table.structRef === 'string' &&
      table.structRef.length > 0 &&
      !attemptedRefs.has(table.structRef) &&
      !table.hasHeaders &&
      (table.cellsMisplacedCount ?? 0) === 0 &&
      (table.rowCount ?? 0) > 1 &&
      table.totalCells >= 4
    )
    .sort((a, b) => a.page - b.page || (a.structRef ?? '').localeCompare(b.structRef ?? ''))
    .map(tableTarget);
}

function normalizeTargets(snapshot: DocumentSnapshot, attemptedRefs: Set<string>): TableTarget[] {
  return snapshot.tables
    .filter(table =>
      typeof table.structRef === 'string' &&
      table.structRef.length > 0 &&
      !attemptedRefs.has(table.structRef) &&
      (
        (table.cellsMisplacedCount ?? 0) > 0 ||
        ((table.rowCount ?? 0) <= 1 && table.totalCells >= 4) ||
        (table.hasHeaders && (table.irregularRows ?? 0) >= 2 && (table.dominantColumnCount ?? 0) >= 2)
      )
    )
    .sort((a, b) =>
      (b.cellsMisplacedCount ?? 0) - (a.cellsMisplacedCount ?? 0) ||
      (b.irregularRows ?? 0) - (a.irregularRows ?? 0) ||
      a.page - b.page ||
      (a.structRef ?? '').localeCompare(b.structRef ?? '')
    )
    .map(tableTarget);
}

async function loadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(parsed) ? parsed as RunRow[] : [];
  const out = new Map<string, RunRow>();
  for (const row of rows) {
    if (row.publicationId) out.set(row.publicationId, row);
    if (row.id) out.set(row.id, row);
  }
  return out;
}

async function artifactPdfFor(runDir: string, row: EdgeMixManifestRow): Promise<string | null> {
  try {
    const files = await readdir(runDir);
    const found = files.find(file =>
      file.endsWith('.remediated.pdf') &&
      (file.startsWith(`${row.publicationId}-`) || file.startsWith(`${row.id}-`))
    );
    return found ? join(runDir, found) : null;
  } catch {
    return null;
  }
}

export function classifyStage157Table(input: {
  publicationId: string;
  afterScore: number | null;
  afterGrade: string | null;
  headingStructure: number | null;
  readingOrder: number | null;
  altText: number | null;
  tableMarkup: number | null;
  falsePositiveApplied: number;
  headerTargetCount: number;
  normalizeTargetCount: number;
}): Pick<Stage157TableRow, 'tableClass' | 'implementable' | 'reason'> {
  if (PARKED_IDS.has(input.publicationId)) {
    return { tableClass: 'analyzer_volatility', implementable: false, reason: 'parked analyzer/OCR volatility row' };
  }
  if (input.falsePositiveApplied > 0) {
    return { tableClass: 'no_safe_table_target', implementable: false, reason: 'reference run already has false-positive-applied evidence' };
  }
  if (input.afterGrade === 'A' || input.afterGrade === 'B' || (input.tableMarkup ?? 100) >= 80) {
    return { tableClass: 'no_safe_table_target', implementable: false, reason: 'row is already A/B or table_markup is not failing' };
  }
  if ((input.headingStructure ?? 100) < 80 || (input.readingOrder ?? 100) < 80) {
    return { tableClass: 'heading_or_reading_order_blocked', implementable: false, reason: 'heading or reading-order debt dominates this row' };
  }
  if (input.headerTargetCount > 0 && (input.altText ?? 100) < 80) {
    return { tableClass: 'mixed_table_alt_candidate', implementable: true, reason: 'safe table header targets remain alongside alt debt' };
  }
  if (input.headerTargetCount > 0) {
    return { tableClass: 'table_header_continuation_candidate', implementable: true, reason: 'safe unattempted table header targets remain' };
  }
  if (input.normalizeTargetCount > 0) {
    return { tableClass: 'table_normalize_continuation_candidate', implementable: true, reason: 'safe unattempted table normalization targets remain' };
  }
  return { tableClass: 'no_safe_table_target', implementable: false, reason: 'no content-backed unattempted table target remains' };
}

async function analyzeRow(row: EdgeMixManifestRow, runDir: string, runRows: Map<string, RunRow>): Promise<Stage157TableRow> {
  const runRow = runRows.get(row.publicationId) ?? runRows.get(row.id);
  const pdfPath = await artifactPdfFor(runDir, row) ?? row.absolutePath;
  const { snapshot } = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  const tableTools = (runRow?.appliedTools ?? []).filter(tool => tool.toolName && TABLE_TOOLS.has(tool.toolName));
  const attemptedTableRefs = tableTools.map(tool => targetRef(tool.details)).filter((ref): ref is string => Boolean(ref));
  const attempted = new Set(attemptedTableRefs);
  const headers = headerTargets(snapshot, attempted);
  const normalize = normalizeTargets(snapshot, attempted);
  const core = {
    afterScore: num(runRow?.afterScore),
    afterGrade: typeof runRow?.afterGrade === 'string' ? runRow.afterGrade : null,
    headingStructure: category(runRow, 'heading_structure'),
    readingOrder: category(runRow, 'reading_order'),
    altText: category(runRow, 'alt_text'),
    tableMarkup: category(runRow, 'table_markup'),
    falsePositiveApplied: Number(runRow?.falsePositiveAppliedCount ?? runRow?.falsePositiveApplied ?? 0),
  };
  const classified = classifyStage157Table({
    publicationId: row.publicationId,
    ...core,
    headerTargetCount: headers.length,
    normalizeTargetCount: normalize.length,
  });
  return {
    id: row.id,
    publicationId: row.publicationId,
    title: row.title,
    ...core,
    tableApplied: tableTools.filter(tool => tool.outcome === 'applied').length,
    tableRejectedOrNoEffect: tableTools.filter(tool => tool.outcome !== 'applied').length,
    firstTerminalTableReason: detailNote(tableTools.find(tool => tool.outcome !== 'applied')?.details),
    attemptedTableRefs,
    headerTargets: headers,
    normalizeTargets: normalize,
    ...classified,
  };
}

function buildReport(manifest: string, referenceRun: string, rows: Stage157TableRow[]): Stage157TableReport {
  const classDistribution = rows.reduce<Record<Stage157TableClass, number>>((acc, row) => {
    acc[row.tableClass] += 1;
    return acc;
  }, {
    table_header_continuation_candidate: 0,
    table_normalize_continuation_candidate: 0,
    mixed_table_alt_candidate: 0,
    heading_or_reading_order_blocked: 0,
    analyzer_volatility: 0,
    no_safe_table_target: 0,
  });
  const selectedRows = rows.filter(row => row.implementable).map(row => row.publicationId).sort();
  return {
    manifest,
    referenceRun,
    rows,
    decision: {
      classDistribution,
      selectedRows,
      recommendedDirection: selectedRows.length > 0 ? 'implement_bounded_table_continuation' : 'diagnostic_only_no_safe_path',
    },
  };
}

function renderMarkdown(report: Stage157TableReport): string {
  const lines = [
    '# Stage 157 Table Continuation Diagnostic',
    '',
    `Manifest: \`${report.manifest}\``,
    `Reference run: \`${report.referenceRun}\``,
    '',
    `Decision: \`${report.decision.recommendedDirection}\``,
    `Selected rows: ${report.decision.selectedRows.map(id => `\`${id}\``).join(', ') || 'none'}`,
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.decision.classDistribution).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| Row | Score | H | RO | Alt | Table | Class | Applied | Terminal | Header targets | Normalize targets | First terminal reason | Reason |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push(`| ${row.publicationId} | ${row.afterScore ?? 'n/a'} ${row.afterGrade ?? ''} | ${row.headingStructure ?? 'n/a'} | ${row.readingOrder ?? 'n/a'} | ${row.altText ?? 'n/a'} | ${row.tableMarkup ?? 'n/a'} | ${row.tableClass} | ${row.tableApplied} | ${row.tableRejectedOrNoEffect} | ${row.headerTargets.length} | ${row.normalizeTargets.length} | ${row.firstTerminalTableReason ?? ''} | ${row.reason} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let manifestPath = DEFAULT_MANIFEST;
  let referenceRun = DEFAULT_REFERENCE_RUN;
  let outDir = DEFAULT_OUT;
  const requested = new Set<string>();
  let analyzeAll = true;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--manifest') manifestPath = args[++i] ?? manifestPath;
    else if (arg === '--reference-run') referenceRun = args[++i] ?? referenceRun;
    else if (arg === '--out') outDir = args[++i] ?? outDir;
    else if (arg === '--file') {
      analyzeAll = false;
      requested.add(args[++i] ?? '');
    } else if (arg === '--all') {
      analyzeAll = true;
      requested.clear();
    } else if (arg === '--help') {
      console.log(usage());
      return;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  const manifestRows = await loadEdgeMixManifest(manifestPath);
  const selected = analyzeAll ? manifestRows : manifestRows.filter(row => requested.has(row.publicationId) || requested.has(row.id));
  const runRows = await loadRunRows(referenceRun);
  const rows: Stage157TableRow[] = [];
  for (const row of selected) rows.push(await analyzeRow(row, referenceRun, runRows));
  const report = buildReport(manifestPath, referenceRun, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage157-table-continuation-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage157-table-continuation-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
