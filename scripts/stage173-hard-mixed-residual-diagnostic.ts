#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import {
  buildFigureCandidateDiagnostics,
  summarizeFigureCandidates,
  type FigureCandidateDiagnostic,
} from './stage50-figure-residual-diagnostic.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_HARD_MANIFEST = 'Input/from_sibling_pdfaf_v1_hard_1/manifest.json';
const DEFAULT_HARD_RUN = 'Output/from_sibling_pdfaf_v1_hard_1/run-stage172-target-ocr-heading-2026-05-01-r1';
const DEFAULT_LEGACY_ROOT = 'Input/experiment-corpus';
const DEFAULT_LEGACY_RUN = 'Output/experiment-corpus-baseline/run-stage170-full-2026-05-01-r1';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_hard_1/stage173-hard-mixed-residual-diagnostic-2026-05-01-r1';

const HARD_DEFAULT_IDS = new Set(['v1-4213', 'v1-4767', 'v1-3475', 'v1-3577']);
const LEGACY_DEFAULT_IDS = new Set([
  'figure-4754',
  'long-4680',
  'font-4057',
  'fixture-inaccessible',
  'font-4156',
  'font-4172',
  'font-4699',
]);
const PRIMARY_IDS = new Set(['v1-4213', '4213']);

const FIGURE_TOOLS = new Set([
  'normalize_nested_figure_containers',
  'canonicalize_figure_alt_ownership',
  'set_figure_alt_text',
  'retag_as_figure',
  'repair_alt_text_structure',
  'mark_figure_decorative',
]);
const TABLE_TOOLS = new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']);
const PDFUA_TOOLS = new Set([
  'remap_orphan_mcids_as_artifacts',
  'repair_structure_conformance',
  'mark_untagged_content_as_artifact',
  'finalize_pdfua_near_pass_artifact_cleanup',
  'repair_native_link_structure',
]);
const RELEVANT_TOOLS = new Set([...FIGURE_TOOLS, ...TABLE_TOOLS, ...PDFUA_TOOLS]);

type SourceKind = 'hard_primary' | 'hard_control' | 'legacy_control';

export type Stage173MixedClass =
  | 'safe_alt_ownership_candidate'
  | 'safe_table_repair_candidate'
  | 'safe_pdfua_orphan_cleanup_candidate'
  | 'mixed_requires_ordered_transaction'
  | 'no_single_safe_path';

interface RunCategory {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface RunTool {
  toolName?: string;
  outcome?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  stage?: number;
  round?: number;
  source?: string;
  details?: unknown;
}

interface RunRow {
  id?: string;
  publicationId?: string;
  title?: string;
  file?: string;
  localFile?: string;
  beforeScore?: number;
  beforeGrade?: string;
  afterScore?: number;
  afterGrade?: string;
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  afterCategories?: RunCategory[];
  reanalyzedCategories?: RunCategory[];
  falsePositiveApplied?: number;
  falsePositiveAppliedCount?: number;
  appliedTools?: RunTool[];
}

interface SourceRow {
  id: string;
  publicationId: string;
  title: string;
  file: string;
  sourcePath: string;
  sourceKind: SourceKind;
  runDir: string;
  runRow?: RunRow;
}

interface CategoryScores {
  heading_structure: number | null;
  reading_order: number | null;
  alt_text: number | null;
  table_markup: number | null;
  pdf_ua_compliance: number | null;
  link_quality: number | null;
}

interface Stage173TableTarget {
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

interface ToolSummary {
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number | null;
  stage: number | null;
  round: number | null;
  source: string | null;
  targetRef: string | null;
  note: string | null;
  categoryBefore: Partial<Record<keyof CategoryScores, number>>;
  categoryAfter: Partial<Record<keyof CategoryScores, number>>;
}

interface Stage173Signals {
  checkerVisibleFigureCount: number;
  checkerVisibleWithAltCount: number;
  checkerVisibleMissingAltCount: number;
  safeUnattemptedAltTargetCount: number;
  safeUnattemptedAltTargets: Array<Pick<FigureCandidateDiagnostic, 'structRef' | 'page' | 'hasAlt' | 'directContent' | 'subtreeMcidCount'>>;
  attemptedAltTargetRefs: string[];
  nonFigureWithAltCount: number;
  nestedFigureAltCount: number;
  orphanedAltEmptyElementCount: number;
  tableCount: number;
  stronglyIrregularTableCount: number;
  safeHeaderTableTargets: Stage173TableTarget[];
  safeNormalizeTableTargets: Stage173TableTarget[];
  attemptedTableRefs: string[];
  orphanMcidCount: number;
  suspectedPathPaintOutsideMc: number;
  taggedAnnotationRiskCount: number;
  linkAnnotationsMissingStructure: number;
  linkAnnotationsMissingStructParent: number;
  pagesMissingTabsS: number;
  pdfuaOrphanOnly: boolean;
}

export interface Stage173ClassificationInput {
  altText: number | null;
  tableMarkup: number | null;
  pdfUaCompliance: number | null;
  falsePositiveApplied: number;
  safeUnattemptedAltTargetCount: number;
  safeTableTargetCount: number;
  orphanMcidCount: number;
  pdfuaOrphanOnly: boolean;
}

export interface Stage173Classification {
  classification: Stage173MixedClass;
  implementable: boolean;
  reason: string;
}

interface Stage173Row {
  id: string;
  publicationId: string;
  sourceKind: SourceKind;
  title: string;
  file: string;
  analyzedPdf: string | null;
  analyzedSource: 'remediated_pdf' | 'source_pdf' | 'missing_pdf';
  benchmarkScore: number | null;
  benchmarkGrade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  analysisScore: number | null;
  analysisGrade: string | null;
  categories: CategoryScores;
  falsePositiveApplied: number;
  signals: Stage173Signals | null;
  figureCandidates: FigureCandidateDiagnostic[];
  relevantTools: ToolSummary[];
  classification: Stage173Classification;
}

interface Stage173Report {
  generatedAt: string;
  hardManifest: string;
  hardRun: string;
  legacyRun: string;
  rows: Stage173Row[];
  decision: {
    classDistribution: Record<Stage173MixedClass, number>;
    primaryClass: Stage173MixedClass | null;
    selectedRows: string[];
    recommendedDirection:
      | 'implement_single_alt_ownership_path'
      | 'implement_single_table_repair_path'
      | 'implement_single_pdfua_orphan_cleanup_path'
      | 'diagnostic_only_plan_ordered_transaction'
      | 'diagnostic_only_no_single_safe_path';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage173-hard-mixed-residual-diagnostic.ts [options]

Options:
  --manifest <path>      Hard holdout manifest (default: ${DEFAULT_HARD_MANIFEST})
  --run <dir>            Stage 172 hard written-PDF run (default: ${DEFAULT_HARD_RUN})
  --legacy-root <path>   Original corpus root for controls (default: ${DEFAULT_LEGACY_ROOT})
  --legacy-run <dir>     Original-50 run for controls (default: ${DEFAULT_LEGACY_RUN})
  --out <dir>            Diagnostic output directory (default: ${DEFAULT_OUT})
  --file <id>            Add/limit hard-holdout id/publication id; repeatable
  --legacy-file <id>     Add/limit original-corpus control id; repeatable
  --no-legacy-controls   Do not include original-corpus controls
  --help                 Show this help`;
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function repeatedArg(flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) values.push(process.argv[index + 1]!);
  }
  return values;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function categoryScore(categories: RunCategory[] | undefined, key: keyof CategoryScores): number | null {
  const category = categories?.find(item => item.key === key);
  return category?.applicable === false ? null : numberOrNull(category?.score);
}

function analysisCategoryScore(result: AnalysisResult | null, key: keyof CategoryScores): number | null {
  const category = result?.categories.find(item => item.key === key);
  return category?.applicable === false ? null : numberOrNull(category?.score);
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string') return null;
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function nestedRecord(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function targetRefFromDetails(details: unknown): string | null {
  const parsed = parseDetails(details);
  const invariants = nestedRecord(parsed, 'invariants');
  if (typeof invariants?.['targetRef'] === 'string') return invariants['targetRef'];
  const debug = nestedRecord(parsed, 'debug');
  if (typeof debug?.['targetRef'] === 'string') return debug['targetRef'];
  const replayState = nestedRecord(debug, 'replayState');
  if (typeof replayState?.['targetRef'] === 'string') return replayState['targetRef'];
  return null;
}

function detailNote(details: unknown): string | null {
  const parsed = parseDetails(details);
  if (typeof parsed?.['note'] === 'string') return parsed['note'];
  if (typeof parsed?.['raw'] === 'string') return parsed['raw'];
  return typeof details === 'string' ? details.slice(0, 180) : null;
}

function replayCategoryScores(details: unknown, phase: 'Before' | 'After'): Partial<Record<keyof CategoryScores, number>> {
  const parsed = parseDetails(details);
  const replayState = nestedRecord(nestedRecord(parsed, 'debug'), 'replayState');
  const scores = nestedRecord(replayState, `categoryScores${phase}`);
  const out: Partial<Record<keyof CategoryScores, number>> = {};
  for (const key of ['heading_structure', 'reading_order', 'alt_text', 'table_markup', 'pdf_ua_compliance', 'link_quality'] as const) {
    const value = scores?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function summarizeTools(row: RunRow | undefined): ToolSummary[] {
  return (row?.appliedTools ?? [])
    .filter(tool => typeof tool.toolName === 'string' && RELEVANT_TOOLS.has(tool.toolName))
    .map(tool => ({
      toolName: tool.toolName ?? '',
      outcome: tool.outcome ?? 'unknown',
      scoreBefore: numberOrNull(tool.scoreBefore),
      scoreAfter: numberOrNull(tool.scoreAfter),
      delta: numberOrNull(tool.delta),
      stage: numberOrNull(tool.stage),
      round: numberOrNull(tool.round),
      source: typeof tool.source === 'string' ? tool.source : null,
      targetRef: targetRefFromDetails(tool.details),
      note: detailNote(tool.details),
      categoryBefore: replayCategoryScores(tool.details, 'Before'),
      categoryAfter: replayCategoryScores(tool.details, 'After'),
    }));
}

function attemptedRefs(row: RunRow | undefined, tools: Set<string>): Set<string> {
  return new Set(
    (row?.appliedTools ?? [])
      .filter(tool => typeof tool.toolName === 'string' && tools.has(tool.toolName))
      .map(tool => targetRefFromDetails(tool.details))
      .filter((value): value is string => Boolean(value)),
  );
}

function toTableTarget(table: DocumentSnapshot['tables'][number], tableClass: Stage173TableTarget['tableClass']): Stage173TableTarget {
  return {
    structRef: table.structRef ?? '',
    page: table.page,
    tableClass,
    hasHeaders: table.hasHeaders,
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

function safeHeaderTargets(snapshot: DocumentSnapshot, attempted: Set<string>): Stage173TableTarget[] {
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
    .map(table => toTableTarget(table, 'missing_headers'));
}

function safeNormalizeTargets(snapshot: DocumentSnapshot, attempted: Set<string>): Stage173TableTarget[] {
  const targets: Stage173TableTarget[] = [];
  for (const table of snapshot.tables) {
    if (!table.structRef || attempted.has(table.structRef)) continue;
    if ((table.cellsMisplacedCount ?? 0) > 0) {
      targets.push(toTableTarget(table, 'direct_cells_under_table'));
    } else if ((table.rowCount ?? 0) <= 1 && table.totalCells >= 4) {
      targets.push(toTableTarget(table, 'rowless_dense_table'));
    } else if (
      table.hasHeaders &&
      (table.cellsMisplacedCount ?? 0) === 0 &&
      (table.rowCount ?? 0) > 1 &&
      (table.irregularRows ?? 0) >= 2 &&
      (table.dominantColumnCount ?? 0) >= 2
    ) {
      targets.push(toTableTarget(table, 'strongly_irregular_rows'));
    }
  }
  return targets.sort((a, b) =>
    b.cellsMisplacedCount - a.cellsMisplacedCount ||
    b.irregularRows - a.irregularRows ||
    a.page - b.page ||
    a.structRef.localeCompare(b.structRef)
  );
}

function buildSignals(snapshot: DocumentSnapshot, row: RunRow | undefined, figureCandidates: FigureCandidateDiagnostic[]): Stage173Signals {
  const figureSummary = summarizeFigureCandidates(figureCandidates, row);
  const attemptedAlt = new Set(figureSummary.attemptedTargetRefs);
  const checkerVisible = figureCandidates.filter(candidate => candidate.checkerVisible && candidate.reachable);
  const safeUnattemptedAltTargets = checkerVisible
    .filter(candidate =>
      !candidate.hasAlt &&
      Boolean(candidate.structRef) &&
      !attemptedAlt.has(candidate.structRef) &&
      (candidate.directContent || candidate.subtreeMcidCount > 0)
    )
    .map(candidate => ({
      structRef: candidate.structRef,
      page: candidate.page,
      hasAlt: candidate.hasAlt,
      directContent: candidate.directContent,
      subtreeMcidCount: candidate.subtreeMcidCount,
    }));

  const attemptedTable = attemptedRefs(row, TABLE_TOOLS);
  const headerTargets = safeHeaderTargets(snapshot, attemptedTable);
  const normalizeTargets = safeNormalizeTargets(snapshot, attemptedTable);
  const taggedAudit = snapshot.taggedContentAudit;
  const pdfuaSignals = snapshot.detectionProfile?.pdfUaSignals;
  const annotation = snapshot.annotationAccessibility ?? snapshot.detectionProfile?.annotationSignals;
  const orphanMcidCount = taggedAudit?.orphanMcidCount ?? pdfuaSignals?.orphanMcidCount ?? snapshot.orphanMcids?.length ?? 0;
  const suspectedPathPaintOutsideMc = taggedAudit?.suspectedPathPaintOutsideMc ?? pdfuaSignals?.suspectedPathPaintOutsideMc ?? 0;
  const taggedAnnotationRiskCount = pdfuaSignals?.taggedAnnotationRiskCount ?? 0;
  const linkAnnotationsMissingStructure = annotation?.linkAnnotationsMissingStructure ?? 0;
  const linkAnnotationsMissingStructParent = annotation?.linkAnnotationsMissingStructParent ?? 0;
  const pagesMissingTabsS = annotation?.pagesMissingTabsS ?? 0;
  const pdfuaOrphanOnly =
    orphanMcidCount > 0 &&
    suspectedPathPaintOutsideMc === 0 &&
    taggedAnnotationRiskCount === 0 &&
    linkAnnotationsMissingStructure === 0 &&
    linkAnnotationsMissingStructParent === 0;

  return {
    checkerVisibleFigureCount: checkerVisible.length,
    checkerVisibleWithAltCount: checkerVisible.filter(candidate => candidate.hasAlt).length,
    checkerVisibleMissingAltCount: checkerVisible.filter(candidate => !candidate.hasAlt).length,
    safeUnattemptedAltTargetCount: safeUnattemptedAltTargets.length,
    safeUnattemptedAltTargets,
    attemptedAltTargetRefs: figureSummary.attemptedTargetRefs,
    nonFigureWithAltCount: snapshot.acrobatStyleAltRisks?.nonFigureWithAltCount ?? 0,
    nestedFigureAltCount: snapshot.acrobatStyleAltRisks?.nestedFigureAltCount ?? 0,
    orphanedAltEmptyElementCount: snapshot.acrobatStyleAltRisks?.orphanedAltEmptyElementCount ?? 0,
    tableCount: snapshot.tables.length,
    stronglyIrregularTableCount: snapshot.detectionProfile?.tableSignals.stronglyIrregularTableCount ?? 0,
    safeHeaderTableTargets: headerTargets,
    safeNormalizeTableTargets: normalizeTargets,
    attemptedTableRefs: [...attemptedTable].sort(),
    orphanMcidCount,
    suspectedPathPaintOutsideMc,
    taggedAnnotationRiskCount,
    linkAnnotationsMissingStructure,
    linkAnnotationsMissingStructParent,
    pagesMissingTabsS,
    pdfuaOrphanOnly,
  };
}

export function classifyStage173MixedResidual(input: Stage173ClassificationInput): Stage173Classification {
  if (input.falsePositiveApplied > 0) {
    return {
      classification: 'no_single_safe_path',
      implementable: false,
      reason: 'reference row already has false-positive-applied evidence',
    };
  }

  const alt = input.altText ?? 100;
  const table = input.tableMarkup ?? 100;
  const pdfua = input.pdfUaCompliance ?? 100;
  const lowAlt = alt < 80;
  const lowTable = table < 80;
  const lowPdfua = pdfua < 80;
  const lowCount = [lowAlt, lowTable, lowPdfua].filter(Boolean).length;
  const hasAltPath = lowAlt && input.safeUnattemptedAltTargetCount > 0;
  const hasTablePath = lowTable && input.safeTableTargetCount > 0;
  const hasPdfuaPath = lowPdfua && input.pdfuaOrphanOnly && input.orphanMcidCount > 0;

  if (lowCount === 0) {
    return {
      classification: 'no_single_safe_path',
      implementable: false,
      reason: 'alt, table, and PDF/UA categories are already above the Stage 173 target floor',
    };
  }
  if (lowCount === 1 && hasAltPath) {
    return {
      classification: 'safe_alt_ownership_candidate',
      implementable: true,
      reason: `${input.safeUnattemptedAltTargetCount} unattempted checker-visible content-backed figure target(s) remain`,
    };
  }
  if (lowCount === 1 && hasTablePath) {
    return {
      classification: 'safe_table_repair_candidate',
      implementable: true,
      reason: `${input.safeTableTargetCount} unattempted content-backed table repair target(s) remain`,
    };
  }
  if (lowCount === 1 && hasPdfuaPath) {
    return {
      classification: 'safe_pdfua_orphan_cleanup_candidate',
      implementable: true,
      reason: `${input.orphanMcidCount} orphan MCID(s) and no competing alt/table blocker`,
    };
  }
  if (lowCount >= 2 && (hasAltPath || hasTablePath || hasPdfuaPath)) {
    return {
      classification: 'mixed_requires_ordered_transaction',
      implementable: false,
      reason: `multiple low categories need ordering: alt:${alt} table:${table} pdfua:${pdfua}`,
    };
  }
  return {
    classification: 'no_single_safe_path',
    implementable: false,
    reason: `no independent safe target for low categories alt:${alt} table:${table} pdfua:${pdfua}`,
  };
}

async function loadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(parsed) ? parsed as RunRow[] : Object.values(parsed as Record<string, RunRow>);
  const map = new Map<string, RunRow>();
  for (const row of rows) {
    if (row.id) map.set(row.id, row);
    if (row.publicationId) map.set(row.publicationId, row);
  }
  return map;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findRemediatedPdf(runDir: string, id: string, publicationId: string): Promise<string | null> {
  for (const candidate of [join(runDir, 'pdfs', `${id}.pdf`), join(runDir, 'pdfs', `${publicationId}.pdf`)]) {
    if (await exists(candidate)) return candidate;
  }
  const files = await readdir(runDir).catch(() => []);
  const found = files.find(name =>
    name.endsWith('.remediated.pdf') &&
    (name.startsWith(`${publicationId}-`) || name.startsWith(`${id}-`) || name.includes(id))
  );
  return found ? join(runDir, found) : null;
}

async function hardSourceRows(manifestPath: string, runDir: string, requested: Set<string>): Promise<SourceRow[]> {
  const manifestRows = await loadEdgeMixManifest(manifestPath);
  const runRows = await loadRunRows(runDir);
  const selected = requested.size > 0 ? requested : HARD_DEFAULT_IDS;
  return manifestRows
    .filter(row => selected.has(row.id) || selected.has(row.publicationId))
    .map((row: EdgeMixManifestRow) => ({
      id: row.id,
      publicationId: row.publicationId,
      title: row.title,
      file: row.localFile,
      sourcePath: row.absolutePath,
      sourceKind: PRIMARY_IDS.has(row.id) || PRIMARY_IDS.has(row.publicationId) ? 'hard_primary' : 'hard_control',
      runDir,
      runRow: runRows.get(row.id) ?? runRows.get(row.publicationId),
    }));
}

async function legacySourceRows(legacyRoot: string, legacyRun: string, requested: Set<string>): Promise<SourceRow[]> {
  const runRows = await loadRunRows(legacyRun);
  const selected = requested.size > 0 ? requested : LEGACY_DEFAULT_IDS;
  const rows: SourceRow[] = [];
  for (const id of selected) {
    const runRow = runRows.get(id);
    if (!runRow?.file) continue;
    rows.push({
      id,
      publicationId: id,
      title: runRow.title ?? id,
      file: runRow.file,
      sourcePath: resolve(legacyRoot, runRow.file),
      sourceKind: 'legacy_control',
      runDir: legacyRun,
      runRow,
    });
  }
  return rows;
}

async function analyzeSourceRow(row: SourceRow): Promise<Stage173Row> {
  const artifact = await findRemediatedPdf(row.runDir, row.id, row.publicationId);
  const pdfPath = artifact ?? row.sourcePath;
  const canAnalyze = await exists(pdfPath);
  const analyzed = canAnalyze ? await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true }) : null;
  const result = analyzed?.result ?? null;
  const snapshot = analyzed?.snapshot ?? null;
  const categories: CategoryScores = {
    heading_structure: categoryScore(row.runRow?.reanalyzedCategories ?? row.runRow?.afterCategories, 'heading_structure') ?? analysisCategoryScore(result, 'heading_structure'),
    reading_order: categoryScore(row.runRow?.reanalyzedCategories ?? row.runRow?.afterCategories, 'reading_order') ?? analysisCategoryScore(result, 'reading_order'),
    alt_text: categoryScore(row.runRow?.reanalyzedCategories ?? row.runRow?.afterCategories, 'alt_text') ?? analysisCategoryScore(result, 'alt_text'),
    table_markup: categoryScore(row.runRow?.reanalyzedCategories ?? row.runRow?.afterCategories, 'table_markup') ?? analysisCategoryScore(result, 'table_markup'),
    pdf_ua_compliance: categoryScore(row.runRow?.reanalyzedCategories ?? row.runRow?.afterCategories, 'pdf_ua_compliance') ?? analysisCategoryScore(result, 'pdf_ua_compliance'),
    link_quality: categoryScore(row.runRow?.reanalyzedCategories ?? row.runRow?.afterCategories, 'link_quality') ?? analysisCategoryScore(result, 'link_quality'),
  };
  const falsePositiveApplied = Number(row.runRow?.falsePositiveAppliedCount ?? row.runRow?.falsePositiveApplied ?? 0);
  const figureCandidates = snapshot ? buildFigureCandidateDiagnostics(snapshot) : [];
  const signals = snapshot ? buildSignals(snapshot, row.runRow, figureCandidates) : null;
  const classification = classifyStage173MixedResidual({
    altText: categories.alt_text,
    tableMarkup: categories.table_markup,
    pdfUaCompliance: categories.pdf_ua_compliance,
    falsePositiveApplied,
    safeUnattemptedAltTargetCount: signals?.safeUnattemptedAltTargetCount ?? 0,
    safeTableTargetCount: (signals?.safeHeaderTableTargets.length ?? 0) + (signals?.safeNormalizeTableTargets.length ?? 0),
    orphanMcidCount: signals?.orphanMcidCount ?? 0,
    pdfuaOrphanOnly: signals?.pdfuaOrphanOnly ?? false,
  });
  return {
    id: row.id,
    publicationId: row.publicationId,
    sourceKind: row.sourceKind,
    title: row.title,
    file: row.file,
    analyzedPdf: canAnalyze ? pdfPath : null,
    analyzedSource: canAnalyze ? (artifact ? 'remediated_pdf' : 'source_pdf') : 'missing_pdf',
    benchmarkScore: numberOrNull(row.runRow?.afterScore),
    benchmarkGrade: typeof row.runRow?.afterGrade === 'string' ? row.runRow.afterGrade : null,
    reanalyzedScore: numberOrNull(row.runRow?.reanalyzedScore),
    reanalyzedGrade: typeof row.runRow?.reanalyzedGrade === 'string' ? row.runRow.reanalyzedGrade : null,
    analysisScore: result?.score ?? null,
    analysisGrade: result?.grade ?? null,
    categories,
    falsePositiveApplied,
    signals,
    figureCandidates,
    relevantTools: summarizeTools(row.runRow),
    classification,
  };
}

function buildReport(hardManifest: string, hardRun: string, legacyRun: string, rows: Stage173Row[]): Stage173Report {
  const classDistribution = rows.reduce<Record<Stage173MixedClass, number>>((acc, row) => {
    acc[row.classification.classification] += 1;
    return acc;
  }, {
    safe_alt_ownership_candidate: 0,
    safe_table_repair_candidate: 0,
    safe_pdfua_orphan_cleanup_candidate: 0,
    mixed_requires_ordered_transaction: 0,
    no_single_safe_path: 0,
  });
  const primary = rows.find(row => row.sourceKind === 'hard_primary');
  const selectedRows = rows.filter(row => row.sourceKind === 'hard_primary' && row.classification.implementable).map(row => row.id);
  let recommendedDirection: Stage173Report['decision']['recommendedDirection'] = 'diagnostic_only_no_single_safe_path';
  if (primary?.classification.classification === 'safe_alt_ownership_candidate') recommendedDirection = 'implement_single_alt_ownership_path';
  else if (primary?.classification.classification === 'safe_table_repair_candidate') recommendedDirection = 'implement_single_table_repair_path';
  else if (primary?.classification.classification === 'safe_pdfua_orphan_cleanup_candidate') recommendedDirection = 'implement_single_pdfua_orphan_cleanup_path';
  else if (primary?.classification.classification === 'mixed_requires_ordered_transaction') recommendedDirection = 'diagnostic_only_plan_ordered_transaction';
  return {
    generatedAt: new Date().toISOString(),
    hardManifest: resolve(hardManifest),
    hardRun: resolve(hardRun),
    legacyRun: resolve(legacyRun),
    rows,
    decision: {
      classDistribution,
      primaryClass: primary?.classification.classification ?? null,
      selectedRows,
      recommendedDirection,
    },
  };
}

function renderToolDelta(tool: ToolSummary): string {
  const categories = ['alt_text', 'table_markup', 'pdf_ua_compliance', 'link_quality'] as const;
  const deltas = categories
    .map(key => {
      const before = tool.categoryBefore[key];
      const after = tool.categoryAfter[key];
      return typeof before === 'number' || typeof after === 'number' ? `${key}:${before ?? 'n/a'}->${after ?? 'n/a'}` : null;
    })
    .filter(Boolean)
    .join(',');
  return `${tool.toolName}:${tool.outcome}:${tool.scoreBefore ?? 'n/a'}->${tool.scoreAfter ?? 'n/a'}${tool.targetRef ? `@${tool.targetRef}` : ''}${deltas ? ` [${deltas}]` : ''}${tool.note ? ` (${tool.note})` : ''}`;
}

function renderMarkdown(report: Stage173Report): string {
  const lines = [
    '# Stage 173 Hard-Holdout Mixed Residual Diagnostic',
    '',
    `Hard run: \`${report.hardRun}\``,
    `Legacy control run: \`${report.legacyRun}\``,
    '',
    'Legacy controls are included for regression context; when the run did not write PDFs, their structural evidence is analyzed from source PDFs and should not drive Stage 173 behavior.',
    '',
    `Decision: \`${report.decision.recommendedDirection}\``,
    `Primary class: \`${report.decision.primaryClass ?? 'none'}\``,
    `Selected rows: ${report.decision.selectedRows.map(id => `\`${id}\``).join(', ') || 'none'}`,
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.decision.classDistribution).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| Row | Kind | Run | Analysis | H | RO | Alt | Table | PDF/UA | Link | CV figures | CV alt | Safe alt | Safe table | Orphans | Class | Reason |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    const s = row.signals;
    lines.push(`| ${[
      `\`${row.id}\``,
      row.sourceKind,
      `${row.reanalyzedScore ?? row.benchmarkScore ?? 'n/a'} ${row.reanalyzedGrade ?? row.benchmarkGrade ?? ''}`.trim(),
      `${row.analysisScore ?? 'n/a'} ${row.analysisGrade ?? ''}`.trim(),
      row.categories.heading_structure ?? 'n/a',
      row.categories.reading_order ?? 'n/a',
      row.categories.alt_text ?? 'n/a',
      row.categories.table_markup ?? 'n/a',
      row.categories.pdf_ua_compliance ?? 'n/a',
      row.categories.link_quality ?? 'n/a',
      s?.checkerVisibleFigureCount ?? 'n/a',
      s?.checkerVisibleWithAltCount ?? 'n/a',
      s?.safeUnattemptedAltTargetCount ?? 'n/a',
      (s?.safeHeaderTableTargets.length ?? 0) + (s?.safeNormalizeTableTargets.length ?? 0),
      s?.orphanMcidCount ?? 'n/a',
      row.classification.classification,
      row.classification.reason,
    ].join(' | ')} |`);
  }

  for (const row of report.rows.filter(item => item.sourceKind === 'hard_primary' || item.sourceKind === 'hard_control')) {
    const s = row.signals;
    lines.push('', `## ${row.id}`, '');
    lines.push(`- Title: ${row.title}`);
    lines.push(`- Analyzed PDF: ${row.analyzedPdf ? `\`${row.analyzedPdf}\` (${row.analyzedSource})` : 'missing'}`);
    lines.push(`- Classification: \`${row.classification.classification}\` - ${row.classification.reason}`);
    if (s) {
      lines.push(`- Figure evidence: checker-visible ${s.checkerVisibleFigureCount}, with alt ${s.checkerVisibleWithAltCount}, missing alt ${s.checkerVisibleMissingAltCount}, safe unattempted ${s.safeUnattemptedAltTargetCount}`);
      lines.push(`- Safe alt targets: ${s.safeUnattemptedAltTargets.map(target => `${target.structRef}@p${target.page}`).join(', ') || 'none'}`);
      lines.push(`- Attempted alt refs: ${s.attemptedAltTargetRefs.map(ref => `\`${ref}\``).join(', ') || 'none'}`);
      lines.push(`- Orphaned/nested alt evidence: nonFigureWithAlt=${s.nonFigureWithAltCount}, nestedFigureAlt=${s.nestedFigureAltCount}, orphanedAltEmpty=${s.orphanedAltEmptyElementCount}`);
      lines.push(`- Table evidence: tables=${s.tableCount}, stronglyIrregular=${s.stronglyIrregularTableCount}, safeHeaderTargets=${s.safeHeaderTableTargets.length}, safeNormalizeTargets=${s.safeNormalizeTableTargets.length}`);
      lines.push(`- Safe table refs: ${[...s.safeHeaderTableTargets, ...s.safeNormalizeTableTargets].map(target => `${target.structRef}:${target.tableClass}@p${target.page}`).join(', ') || 'none'}`);
      lines.push(`- PDF/UA evidence: orphanMcids=${s.orphanMcidCount}, pathPaintOutsideMC=${s.suspectedPathPaintOutsideMc}, taggedAnnotationRisk=${s.taggedAnnotationRiskCount}, linkMissingStructure=${s.linkAnnotationsMissingStructure}, linkMissingStructParent=${s.linkAnnotationsMissingStructParent}, pagesMissingTabsS=${s.pagesMissingTabsS}, orphanOnly=${s.pdfuaOrphanOnly}`);
    }
    lines.push(`- Relevant tools: ${row.relevantTools.map(renderToolDelta).join(' | ') || 'none'}`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const hardManifest = argValue('--manifest') ?? DEFAULT_HARD_MANIFEST;
  const hardRun = argValue('--run') ?? DEFAULT_HARD_RUN;
  const legacyRoot = argValue('--legacy-root') ?? DEFAULT_LEGACY_ROOT;
  const legacyRun = argValue('--legacy-run') ?? DEFAULT_LEGACY_RUN;
  const outDir = argValue('--out') ?? DEFAULT_OUT;
  const hardRequested = new Set(repeatedArg('--file'));
  const legacyRequested = new Set(repeatedArg('--legacy-file'));

  const rows = await hardSourceRows(hardManifest, hardRun, hardRequested);
  if (!process.argv.includes('--no-legacy-controls')) {
    rows.push(...await legacySourceRows(legacyRoot, legacyRun, legacyRequested));
  }

  const analyzedRows: Stage173Row[] = [];
  for (const row of rows) analyzedRows.push(await analyzeSourceRow(row));
  const report = buildReport(hardManifest, hardRun, legacyRun, analyzedRows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage173-hard-mixed-residual-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage173-hard-mixed-residual-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 173 hard mixed residual diagnostic to ${outDir}`);
  console.log(JSON.stringify(report.decision, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
