#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/stage145-active-low-grade-tail/manifest.json';
const DEFAULT_REFERENCE_RUN = 'Output/stage145-low-grade-tail/run-stage156-active-tail-baseline-2026-04-29-r1';
const DEFAULT_OUT = 'Output/stage145-low-grade-tail/stage161-table-target-diagnostic-2026-04-30-r1';

const PARKED_IDS = new Set(['v1-v1-3451', 'v1-v1-3459', 'v1-v1-3602', 'v1-v1-4485', 'v1-v1-4171', 'v1-v1-4683', 'v1-v1-4694', 'orig-long-4680', 'orig-structure-4076']);
const PRIMARY_IDS = new Set(['v1-v1-4147', 'v1-v1-4453', 'v1-v1-4735', 'orig-font-4057']);
const TABLE_TOOLS = new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']);

export type Stage161TableTargetClass =
  | 'stable_explicit_table_target'
  | 'stable_mixed_table_alt_target'
  | 'heading_or_reading_order_blocked'
  | 'analyzer_or_route_volatility'
  | 'not_table_target'
  | 'no_safe_table_target';

interface RunRow {
  id?: string;
  publicationId?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: Array<{ key?: string; score?: number }>;
  falsePositiveAppliedCount?: number;
  falsePositiveApplied?: number;
  appliedTools?: Array<{ toolName?: string; outcome?: string; details?: unknown; scoreBefore?: number; scoreAfter?: number; delta?: number }>;
}

export interface Stage161TableTarget {
  structRef: string;
  page: number;
  tableClass: 'missing_headers' | 'direct_cells_under_table' | 'rowless_dense_table' | 'strongly_irregular_rows';
  hasHeaders: boolean;
  totalCells: number;
  rowCount: number;
  cellsMisplacedCount: number;
  irregularRows: number;
  dominantColumnCount: number;
  reachable: boolean | null;
  directContent: boolean | null;
  subtreeMcidCount: number | null;
}

export interface Stage161DiagnosticRow {
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
  analyzedPdf: string;
  attemptedTableRefs: string[];
  appliedTableTools: number;
  terminalTableTools: number;
  firstTerminalNoEffectReason: string | null;
  safeHeaderTargets: Stage161TableTarget[];
  safeNormalizeTargets: Stage161TableTarget[];
  tableClass: Stage161TableTargetClass;
  implementable: boolean;
  reason: string;
}

export interface Stage161DiagnosticReport {
  manifest: string;
  referenceRun: string;
  rows: Stage161DiagnosticRow[];
  decision: {
    classDistribution: Record<Stage161TableTargetClass, number>;
    selectedRows: string[];
    recommendedDirection: 'implement_explicit_table_targeting' | 'diagnostic_only_no_safe_path';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage161-table-target-diagnostic.ts [options]

Options:
  --manifest <path>        Active low-grade tail manifest (default: ${DEFAULT_MANIFEST})
  --reference-run <dir>    Run directory with remediate.results.json (default: ${DEFAULT_REFERENCE_RUN})
  --out <dir>              Output diagnostic directory (default: ${DEFAULT_OUT})
  --file <id>              Limit to manifest id or publication id; repeatable
  --all                    Analyze every manifest row
  --help                   Show this help`;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function categoryScore(row: RunRow | undefined, key: string): number | null {
  return numberOrNull(row?.afterCategories?.find(category => category.key === key)?.score);
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

function targetRef(details: unknown): string | null {
  const parsed = parseDetails(details);
  const inv = parsed?.['invariants'];
  if (inv && typeof inv === 'object' && !Array.isArray(inv)) {
    const ref = (inv as Record<string, unknown>)['targetRef'];
    if (typeof ref === 'string' && ref.length > 0) return ref;
  }
  const debug = parsed?.['debug'];
  if (debug && typeof debug === 'object' && !Array.isArray(debug)) {
    const ref = (debug as Record<string, unknown>)['targetRef'];
    if (typeof ref === 'string' && ref.length > 0) return ref;
  }
  return null;
}

function noEffectReason(details: unknown): string | null {
  const parsed = parseDetails(details);
  if (typeof parsed?.['note'] === 'string') return parsed['note'];
  if (typeof parsed?.['raw'] === 'string') return parsed['raw'];
  return typeof details === 'string' ? details.slice(0, 160) : null;
}

function toTarget(table: DocumentSnapshot['tables'][number], tableClass: Stage161TableTarget['tableClass']): Stage161TableTarget {
  return {
    structRef: table.structRef ?? '',
    page: table.page,
    tableClass,
    hasHeaders: Boolean(table.hasHeaders),
    totalCells: table.totalCells,
    rowCount: table.rowCount ?? 0,
    cellsMisplacedCount: table.cellsMisplacedCount ?? 0,
    irregularRows: table.irregularRows ?? 0,
    dominantColumnCount: table.dominantColumnCount ?? 0,
    reachable: typeof table.reachable === 'boolean' ? table.reachable : null,
    directContent: typeof table.directContent === 'boolean' ? table.directContent : null,
    subtreeMcidCount: typeof table.subtreeMcidCount === 'number' ? table.subtreeMcidCount : null,
  };
}

function safeHeaderTargets(snapshot: DocumentSnapshot, attemptedRefs: Set<string>): Stage161TableTarget[] {
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
    .map(table => toTarget(table, 'missing_headers'));
}

function safeNormalizeTargets(snapshot: DocumentSnapshot, attemptedRefs: Set<string>): Stage161TableTarget[] {
  const targets: Stage161TableTarget[] = [];
  for (const table of snapshot.tables) {
    if (!table.structRef || attemptedRefs.has(table.structRef)) continue;
    if ((table.cellsMisplacedCount ?? 0) > 0) {
      targets.push(toTarget(table, 'direct_cells_under_table'));
    } else if ((table.rowCount ?? 0) <= 1 && table.totalCells >= 4) {
      targets.push(toTarget(table, 'rowless_dense_table'));
    } else if (table.hasHeaders && (table.irregularRows ?? 0) >= 2 && (table.dominantColumnCount ?? 0) >= 2) {
      targets.push(toTarget(table, 'strongly_irregular_rows'));
    }
  }
  return targets.sort((a, b) =>
    b.cellsMisplacedCount - a.cellsMisplacedCount ||
    b.irregularRows - a.irregularRows ||
    a.page - b.page ||
    a.structRef.localeCompare(b.structRef)
  );
}

export function classifyStage161TableTarget(input: {
  publicationId: string;
  afterGrade: string | null;
  headingStructure: number | null;
  readingOrder: number | null;
  altText: number | null;
  tableMarkup: number | null;
  falsePositiveApplied: number;
  safeHeaderTargetCount: number;
  safeNormalizeTargetCount: number;
}): Pick<Stage161DiagnosticRow, 'tableClass' | 'implementable' | 'reason'> {
  if (PARKED_IDS.has(input.publicationId)) {
    return { tableClass: 'analyzer_or_route_volatility', implementable: false, reason: 'parked analyzer/OCR/route-volatility row' };
  }
  if (input.falsePositiveApplied > 0) {
    return { tableClass: 'no_safe_table_target', implementable: false, reason: 'reference run already has false-positive-applied evidence' };
  }
  if (input.afterGrade === 'A' || input.afterGrade === 'B' || (input.tableMarkup ?? 100) >= 80) {
    return { tableClass: 'not_table_target', implementable: false, reason: 'row is already A/B or table_markup is not failing' };
  }
  if ((input.headingStructure ?? 100) < 80 || (input.readingOrder ?? 100) < 80) {
    return { tableClass: 'heading_or_reading_order_blocked', implementable: false, reason: 'heading or reading-order debt dominates before table work' };
  }
  const targetCount = input.safeHeaderTargetCount + input.safeNormalizeTargetCount;
  if (targetCount === 0) {
    return { tableClass: 'no_safe_table_target', implementable: false, reason: 'no distinct unattempted content-backed table ref remains' };
  }
  if ((input.altText ?? 100) < 80) {
    return { tableClass: 'stable_mixed_table_alt_target', implementable: true, reason: 'stable table targets remain alongside alt debt' };
  }
  if (PRIMARY_IDS.has(input.publicationId)) {
    return { tableClass: 'stable_explicit_table_target', implementable: true, reason: 'primary stable table-residual row has explicit unattempted target refs' };
  }
  return { tableClass: 'stable_explicit_table_target', implementable: true, reason: 'explicit unattempted table target refs remain' };
}

async function loadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(parsed) ? parsed as RunRow[] : [];
  const map = new Map<string, RunRow>();
  for (const row of rows) {
    if (row.publicationId) map.set(row.publicationId, row);
    if (row.id) map.set(row.id, row);
  }
  return map;
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

async function analyzeRow(row: EdgeMixManifestRow, runDir: string, runRows: Map<string, RunRow>): Promise<Stage161DiagnosticRow> {
  const runRow = runRows.get(row.publicationId) ?? runRows.get(row.id);
  const pdfPath = await artifactPdfFor(runDir, row) ?? row.absolutePath;
  const { snapshot } = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  const tableTools = (runRow?.appliedTools ?? []).filter(tool => tool.toolName && TABLE_TOOLS.has(tool.toolName));
  const attemptedTableRefs = tableTools.map(tool => targetRef(tool.details)).filter((ref): ref is string => Boolean(ref));
  const attempted = new Set(attemptedTableRefs);
  const headers = safeHeaderTargets(snapshot, attempted);
  const normalize = safeNormalizeTargets(snapshot, attempted);
  const core = {
    afterScore: numberOrNull(runRow?.afterScore),
    afterGrade: typeof runRow?.afterGrade === 'string' ? runRow.afterGrade : null,
    headingStructure: categoryScore(runRow, 'heading_structure'),
    readingOrder: categoryScore(runRow, 'reading_order'),
    altText: categoryScore(runRow, 'alt_text'),
    tableMarkup: categoryScore(runRow, 'table_markup'),
    falsePositiveApplied: Number(runRow?.falsePositiveAppliedCount ?? runRow?.falsePositiveApplied ?? 0),
  };
  const classified = classifyStage161TableTarget({
    publicationId: row.publicationId,
    ...core,
    safeHeaderTargetCount: headers.length,
    safeNormalizeTargetCount: normalize.length,
  });
  return {
    id: row.id,
    publicationId: row.publicationId,
    title: row.title,
    ...core,
    analyzedPdf: pdfPath,
    attemptedTableRefs,
    appliedTableTools: tableTools.filter(tool => tool.outcome === 'applied').length,
    terminalTableTools: tableTools.filter(tool => tool.outcome !== 'applied').length,
    firstTerminalNoEffectReason: noEffectReason(tableTools.find(tool => tool.outcome !== 'applied')?.details),
    safeHeaderTargets: headers,
    safeNormalizeTargets: normalize,
    ...classified,
  };
}

function buildReport(manifest: string, referenceRun: string, rows: Stage161DiagnosticRow[]): Stage161DiagnosticReport {
  const classDistribution = rows.reduce<Record<Stage161TableTargetClass, number>>((acc, row) => {
    acc[row.tableClass] += 1;
    return acc;
  }, {
    stable_explicit_table_target: 0,
    stable_mixed_table_alt_target: 0,
    heading_or_reading_order_blocked: 0,
    analyzer_or_route_volatility: 0,
    not_table_target: 0,
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
      recommendedDirection: selectedRows.length > 0 ? 'implement_explicit_table_targeting' : 'diagnostic_only_no_safe_path',
    },
  };
}

function renderMarkdown(report: Stage161DiagnosticReport): string {
  const lines = [
    '# Stage 161 Table Target Diagnostic',
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
    '| Row | Score | H | RO | Alt | Table | Class | Applied | Terminal | Attempted refs | Header targets | Normalize targets | First terminal | Reason |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push(`| ${row.publicationId} | ${row.afterScore ?? 'n/a'} ${row.afterGrade ?? ''} | ${row.headingStructure ?? 'n/a'} | ${row.readingOrder ?? 'n/a'} | ${row.altText ?? 'n/a'} | ${row.tableMarkup ?? 'n/a'} | ${row.tableClass} | ${row.appliedTableTools} | ${row.terminalTableTools} | ${row.attemptedTableRefs.length} | ${row.safeHeaderTargets.length} | ${row.safeNormalizeTargets.length} | ${row.firstTerminalNoEffectReason ?? ''} | ${row.reason} |`);
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
  const selected = analyzeAll
    ? manifestRows
    : manifestRows.filter(row => requested.has(row.publicationId) || requested.has(row.id));
  const runRows = await loadRunRows(referenceRun);
  const rows: Stage161DiagnosticRow[] = [];
  for (const row of selected) rows.push(await analyzeRow(row, referenceRun, runRows));
  const report = buildReport(manifestPath, referenceRun, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage161-table-target-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage161-table-target-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
