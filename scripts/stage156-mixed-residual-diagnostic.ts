#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/stage145-active-low-grade-tail/manifest.json';
const DEFAULT_REFERENCE_RUN = 'Output/stage145-low-grade-tail/run-stage156-active-tail-baseline-2026-04-29-r1';
const DEFAULT_OUT = 'Output/stage145-low-grade-tail/stage156-mixed-residual-diagnostic-2026-04-29-r1';

const PARKED_IDS = new Set([
  'v1-v1-3451',
  'v1-v1-3459',
  'v1-v1-3602',
  'v1-v1-4485',
  'v1-v1-4683',
  'v1-v1-4171',
  'orig-structure-4076',
]);

const FIGURE_TOOLS = new Set(['set_figure_alt_text', 'retag_as_figure', 'repair_alt_text_structure']);
const TABLE_TOOLS = new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']);

export type Stage156ResidualClass =
  | 'safe_figure_alt_continuation'
  | 'safe_table_markup_continuation'
  | 'mixed_alt_table_candidate'
  | 'heading_or_reading_order_not_this_stage'
  | 'analyzer_volatility'
  | 'no_safe_target';

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

export interface Stage156DiagnosticRow {
  id: string;
  publicationId: string;
  title: string;
  file: string;
  afterScore: number | null;
  afterGrade: string | null;
  headingStructure: number | null;
  readingOrder: number | null;
  altText: number | null;
  tableMarkup: number | null;
  pdfUa: number | null;
  falsePositiveApplied: number;
  analyzedPdf: string;
  safeFigureAltTargets: string[];
  safeTableHeaderTargets: string[];
  safeTableNormalizeTargets: string[];
  setAltApplied: number;
  setAltRejectedOrNoEffect: number;
  retagApplied: number;
  tableApplied: number;
  tableRejectedOrNoEffect: number;
  attemptedFigureRefs: string[];
  attemptedTableRefs: string[];
  residualClass: Stage156ResidualClass;
  recommendedFirstPath: 'figure_alt' | 'table' | 'none';
  reason: string;
}

export interface Stage156DiagnosticReport {
  manifest: string;
  referenceRun: string;
  rows: Stage156DiagnosticRow[];
  decision: {
    classDistribution: Record<Stage156ResidualClass, number>;
    selectedRows: string[];
    recommendedPath: 'figure_alt_continuation' | 'table_continuation' | 'diagnostic_only';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage156-mixed-residual-diagnostic.ts [options]

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
  const found = row?.afterCategories?.find(category => category.key === key);
  return numberOrNull(found?.score);
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

function isFigureRole(role: unknown): boolean {
  return String(role ?? '').replace(/^\//, '').toLowerCase() === 'figure';
}

function safeFigureAltTargets(snapshot: DocumentSnapshot, attempted: Set<string>): string[] {
  return (snapshot.checkerFigureTargets ?? [])
    .filter(target =>
      target.reachable &&
      target.directContent &&
      !target.isArtifact &&
      !target.hasAlt &&
      typeof target.structRef === 'string' &&
      target.structRef.length > 0 &&
      !attempted.has(target.structRef) &&
      isFigureRole(target.resolvedRole ?? target.role)
    )
    .map(target => target.structRef!)
    .sort();
}

function safeTableHeaderTargets(snapshot: DocumentSnapshot, attempted: Set<string>): string[] {
  return snapshot.tables
    .filter(table =>
      typeof table.structRef === 'string' &&
      table.structRef.length > 0 &&
      !attempted.has(table.structRef) &&
      !table.hasHeaders &&
      (table.cellsMisplacedCount ?? 0) === 0 &&
      (table.rowCount ?? 0) > 1 &&
      table.totalCells >= 4
    )
    .sort((a, b) => a.page - b.page || (a.structRef ?? '').localeCompare(b.structRef ?? ''))
    .map(table => table.structRef!);
}

function safeTableNormalizeTargets(snapshot: DocumentSnapshot, attempted: Set<string>): string[] {
  return snapshot.tables
    .filter(table =>
      typeof table.structRef === 'string' &&
      table.structRef.length > 0 &&
      !attempted.has(table.structRef) &&
      (
        (table.cellsMisplacedCount ?? 0) > 0 ||
        ((table.rowCount ?? 0) <= 1 && table.totalCells >= 4) ||
        (table.hasHeaders && (table.irregularRows ?? 0) >= 2 && (table.dominantColumnCount ?? 0) >= 2)
      )
    )
    .sort((a, b) => a.page - b.page || (a.structRef ?? '').localeCompare(b.structRef ?? ''))
    .map(table => table.structRef!);
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
  let files: string[];
  try {
    files = await readdir(runDir);
  } catch {
    return null;
  }
  const found = files.find(file =>
    file.endsWith('.remediated.pdf') &&
    (file.startsWith(`${row.publicationId}-`) || file.startsWith(`${row.id}-`))
  );
  return found ? join(runDir, found) : null;
}

export function classifyStage156Residual(input: {
  publicationId: string;
  afterScore: number | null;
  afterGrade: string | null;
  headingStructure: number | null;
  readingOrder: number | null;
  altText: number | null;
  tableMarkup: number | null;
  falsePositiveApplied: number;
  safeFigureAltCount: number;
  safeTableHeaderCount: number;
  safeTableNormalizeCount: number;
}): Pick<Stage156DiagnosticRow, 'residualClass' | 'recommendedFirstPath' | 'reason'> {
  if (PARKED_IDS.has(input.publicationId)) {
    return { residualClass: 'analyzer_volatility', recommendedFirstPath: 'none', reason: 'parked from prior OCR/analyzer-volatility evidence' };
  }
  if (input.falsePositiveApplied > 0) {
    return { residualClass: 'no_safe_target', recommendedFirstPath: 'none', reason: 'reference run already has false-positive-applied evidence' };
  }
  if (input.afterGrade === 'A' || input.afterGrade === 'B') {
    return { residualClass: 'no_safe_target', recommendedFirstPath: 'none', reason: 'already A/B in reference run' };
  }
  const headingOrReadingBlocked = (input.headingStructure ?? 100) < 50 || (input.readingOrder ?? 100) < 50;
  const figureCandidate = (input.altText ?? 100) < 80 && input.safeFigureAltCount > 0;
  const tableCandidate = (input.tableMarkup ?? 100) < 80 && (input.safeTableHeaderCount + input.safeTableNormalizeCount) > 0;
  if (figureCandidate && tableCandidate) {
    const first = (input.tableMarkup ?? 100) <= (input.altText ?? 100) ? 'table' : 'figure_alt';
    return { residualClass: 'mixed_alt_table_candidate', recommendedFirstPath: first, reason: 'both reachable missing-alt figures and table repair targets remain' };
  }
  if (figureCandidate) {
    return { residualClass: 'safe_figure_alt_continuation', recommendedFirstPath: 'figure_alt', reason: 'reachable checker-visible missing-alt figure targets remain' };
  }
  if (tableCandidate) {
    return { residualClass: 'safe_table_markup_continuation', recommendedFirstPath: 'table', reason: 'content-backed table normalization/header targets remain' };
  }
  if (headingOrReadingBlocked) {
    return { residualClass: 'heading_or_reading_order_not_this_stage', recommendedFirstPath: 'none', reason: 'dominant blocker is heading or reading order' };
  }
  return { residualClass: 'no_safe_target', recommendedFirstPath: 'none', reason: 'no safe figure/table continuation target found' };
}

async function analyzeRow(row: EdgeMixManifestRow, runDir: string, runRows: Map<string, RunRow>): Promise<Stage156DiagnosticRow> {
  const runRow = runRows.get(row.publicationId) ?? runRows.get(row.id);
  const pdfPath = await artifactPdfFor(runDir, row) ?? row.absolutePath;
  const { snapshot } = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  const tools = runRow?.appliedTools ?? [];
  const figureToolRows = tools.filter(tool => tool.toolName && FIGURE_TOOLS.has(tool.toolName));
  const tableToolRows = tools.filter(tool => tool.toolName && TABLE_TOOLS.has(tool.toolName));
  const attemptedFigureRefs = figureToolRows.map(tool => targetRef(tool.details)).filter((ref): ref is string => Boolean(ref));
  const attemptedTableRefs = tableToolRows.map(tool => targetRef(tool.details)).filter((ref): ref is string => Boolean(ref));
  const figureTargets = safeFigureAltTargets(snapshot, new Set(attemptedFigureRefs));
  const tableHeaderTargets = safeTableHeaderTargets(snapshot, new Set(attemptedTableRefs));
  const tableNormalizeTargets = safeTableNormalizeTargets(snapshot, new Set(attemptedTableRefs));
  const core = {
    afterScore: numberOrNull(runRow?.afterScore),
    afterGrade: typeof runRow?.afterGrade === 'string' ? runRow.afterGrade : null,
    headingStructure: categoryScore(runRow, 'heading_structure'),
    readingOrder: categoryScore(runRow, 'reading_order'),
    altText: categoryScore(runRow, 'alt_text'),
    tableMarkup: categoryScore(runRow, 'table_markup'),
    falsePositiveApplied: Number(runRow?.falsePositiveAppliedCount ?? runRow?.falsePositiveApplied ?? 0),
  };
  const classified = classifyStage156Residual({
    publicationId: row.publicationId,
    ...core,
    safeFigureAltCount: figureTargets.length,
    safeTableHeaderCount: tableHeaderTargets.length,
    safeTableNormalizeCount: tableNormalizeTargets.length,
  });
  return {
    id: row.id,
    publicationId: row.publicationId,
    title: row.title,
    file: row.localFile,
    ...core,
    pdfUa: categoryScore(runRow, 'pdf_ua_compliance'),
    analyzedPdf: pdfPath,
    safeFigureAltTargets: figureTargets,
    safeTableHeaderTargets: tableHeaderTargets,
    safeTableNormalizeTargets: tableNormalizeTargets,
    setAltApplied: figureToolRows.filter(tool => tool.toolName === 'set_figure_alt_text' && tool.outcome === 'applied').length,
    setAltRejectedOrNoEffect: figureToolRows.filter(tool => tool.toolName === 'set_figure_alt_text' && tool.outcome !== 'applied').length,
    retagApplied: figureToolRows.filter(tool => tool.toolName === 'retag_as_figure' && tool.outcome === 'applied').length,
    tableApplied: tableToolRows.filter(tool => tool.outcome === 'applied').length,
    tableRejectedOrNoEffect: tableToolRows.filter(tool => tool.outcome !== 'applied').length,
    attemptedFigureRefs,
    attemptedTableRefs,
    ...classified,
  };
}

export function buildStage156Report(manifest: string, referenceRun: string, rows: Stage156DiagnosticRow[]): Stage156DiagnosticReport {
  const classDistribution = rows.reduce<Record<Stage156ResidualClass, number>>((acc, row) => {
    acc[row.residualClass] += 1;
    return acc;
  }, {
    safe_figure_alt_continuation: 0,
    safe_table_markup_continuation: 0,
    mixed_alt_table_candidate: 0,
    heading_or_reading_order_not_this_stage: 0,
    analyzer_volatility: 0,
    no_safe_target: 0,
  });
  const selectedRows = rows
    .filter(row => row.recommendedFirstPath !== 'none')
    .map(row => row.publicationId)
    .sort();
  const tableSelections = rows.filter(row => row.recommendedFirstPath === 'table').length;
  const figureSelections = rows.filter(row => row.recommendedFirstPath === 'figure_alt').length;
  return {
    manifest,
    referenceRun,
    rows,
    decision: {
      classDistribution,
      selectedRows,
      recommendedPath: selectedRows.length === 0
        ? 'diagnostic_only'
        : (figureSelections >= tableSelections ? 'figure_alt_continuation' : 'table_continuation'),
    },
  };
}

function renderMarkdown(report: Stage156DiagnosticReport): string {
  const lines = [
    '# Stage 156 Mixed Residual Diagnostic',
    '',
    `Manifest: \`${report.manifest}\``,
    `Reference run: \`${report.referenceRun}\``,
    '',
    `Recommended path: \`${report.decision.recommendedPath}\``,
    `Selected rows: ${report.decision.selectedRows.map(id => `\`${id}\``).join(', ') || 'none'}`,
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.decision.classDistribution).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| Row | Score | H | RO | Alt | Table | Class | First path | Safe figs | Safe table headers | Safe table normalize | Reason |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | --- |',
  ];
  for (const row of report.rows) {
    lines.push(`| ${row.publicationId} | ${row.afterScore ?? 'n/a'} ${row.afterGrade ?? ''} | ${row.headingStructure ?? 'n/a'} | ${row.readingOrder ?? 'n/a'} | ${row.altText ?? 'n/a'} | ${row.tableMarkup ?? 'n/a'} | ${row.residualClass} | ${row.recommendedFirstPath} | ${row.safeFigureAltTargets.length} | ${row.safeTableHeaderTargets.length} | ${row.safeTableNormalizeTargets.length} | ${row.reason} |`);
  }
  lines.push('');
  lines.push('Stage 156 behavior should only target one proven continuation family and must preserve false-positive-applied at 0.');
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
  const rowsToAnalyze = analyzeAll
    ? manifestRows
    : manifestRows.filter(row => requested.has(row.publicationId) || requested.has(row.id));
  const runRows = await loadRunRows(referenceRun);
  const rows: Stage156DiagnosticRow[] = [];
  for (const row of rowsToAnalyze) rows.push(await analyzeRow(row, referenceRun, runRows));
  const report = buildStage156Report(manifestPath, referenceRun, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage156-mixed-residual-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage156-mixed-residual-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
