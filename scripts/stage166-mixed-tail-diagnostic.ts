#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import {
  buildFigureCandidateDiagnostics,
  type FigureCandidateDiagnostic,
  summarizeFigureCandidates,
} from './stage50-figure-residual-diagnostic.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_LEGACY_ROOT = 'Input/experiment-corpus';
const DEFAULT_LEGACY_RUN = 'Output/experiment-corpus-baseline/run-stage165-full-2026-04-30-r1';
const DEFAULT_ACTIVE_MANIFEST = 'Input/stage145-active-low-grade-tail/manifest.json';
const DEFAULT_ACTIVE_RUN = 'Output/stage145-low-grade-tail/run-stage162-active-tail-2026-04-30-r4';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage166-mixed-tail-diagnostic-2026-04-30-r1';

const LEGACY_PRIMARY_IDS = new Set(['figure-4754', 'font-4057']);
const LEGACY_PARKED_IDS = new Set(['structure-4076', 'long-4683', 'short-4214', 'long-4516']);
const LEGACY_CONTROL_IDS = new Set(['fixture-inaccessible', 'font-4156', 'font-4172', 'font-4699']);
const ACTIVE_CONTROL_IDS = new Set(['v1-v1-3468', 'v1-v1-4766', 'v1-v1-4761']);
const ACTIVE_MATCHING_IDS = new Set(['orig-figure-4754', 'orig-font-4057', 'orig-fixture-inaccessible']);

type SourceKind = 'legacy_primary' | 'legacy_parked_control' | 'legacy_required_control' | 'active_matching' | 'active_required_control';

export type Stage166MixedTailClass =
  | 'figure_title_bookmark_heading_candidate'
  | 'stable_table_continuation_candidate'
  | 'safe_alt_target_with_pdfua_stable'
  | 'mixed_alt_pdfua_not_safe'
  | 'protected_or_analyzer_volatility'
  | 'no_safe_candidate';

interface RunToolRow {
  toolName?: string;
  outcome?: string;
  details?: unknown;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  stage?: number;
  round?: number;
  source?: string;
}

interface RunRow {
  id?: string;
  publicationId?: string;
  file?: string;
  afterScore?: number;
  afterGrade?: string;
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  afterCategories?: Array<{ key?: string; score?: number }>;
  reanalyzedCategories?: Array<{ key?: string; score?: number }>;
  falsePositiveAppliedCount?: number;
  falsePositiveApplied?: number;
  appliedTools?: RunToolRow[];
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
}

export interface Stage166Signals {
  titleLanguage: number | null;
  headingStructure: number | null;
  bookmarks: number | null;
  altText: number | null;
  pdfUaCompliance: number | null;
  tableMarkup: number | null;
  linkQuality: number | null;
  readingOrder: number | null;
  metadataTitle: string | null;
  bookmarkCount: number;
  firstBookmarkTitles: string[];
  headingCount: number;
  h1Count: number;
  headingTreeDepth: number | null;
  checkerVisibleFigureCount: number;
  checkerVisibleMissingAltCount: number;
  directSafeCheckerVisibleMissingAltCount: number;
  safeRoleMapRetagTargetCount: number;
  attemptedAltTargetRefs: string[];
  irregularTableCount: number;
  stronglyIrregularTableCount: number;
  unattemptedStrongTableRefs: string[];
}

export interface Stage166DiagnosticRow {
  id: string;
  publicationId: string;
  sourceKind: SourceKind;
  file: string;
  benchmarkScore: number | null;
  benchmarkGrade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  analyzedScore: number;
  analyzedGrade: string;
  analyzedPdf: string;
  analyzedFromArtifact: boolean;
  falsePositiveApplied: number;
  signals: Stage166Signals;
  figureCandidates: FigureCandidateDiagnostic[];
  relevantTools: ToolSummary[];
  mixedTailClass: Stage166MixedTailClass;
  implementable: boolean;
  reason: string;
}

export interface Stage166DiagnosticReport {
  legacyRun: string;
  activeRun: string;
  activeManifest: string;
  rows: Stage166DiagnosticRow[];
  decision: {
    classDistribution: Record<Stage166MixedTailClass, number>;
    selectedRows: string[];
    recommendedDirection:
      | 'implement_title_heading_topup'
      | 'investigate_stable_table_targets'
      | 'diagnostic_only_no_safe_mixed_tail_rule';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage166-mixed-tail-diagnostic.ts [options]

Options:
  --legacy-root <path>      Original corpus root (default: ${DEFAULT_LEGACY_ROOT})
  --legacy-run <dir>        Original-50 reference run (default: ${DEFAULT_LEGACY_RUN})
  --active-manifest <path>  Active-tail manifest (default: ${DEFAULT_ACTIVE_MANIFEST})
  --active-run <dir>        Active-tail reference run (default: ${DEFAULT_ACTIVE_RUN})
  --out <dir>               Output diagnostic directory (default: ${DEFAULT_OUT})
  --legacy-file <id>        Limit/add original-corpus row id; repeatable
  --active-file <id>        Limit/add active-tail publication id; repeatable
  --all-defaults            Use the default Stage 166 row set (default)
  --help                    Show this help`;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function categoryFromRun(row: RunRow | undefined, key: string): number | null {
  const categories = Array.isArray(row?.reanalyzedCategories) ? row?.reanalyzedCategories : row?.afterCategories;
  return numberOrNull(categories?.find(category => category.key === key)?.score);
}

function categoryFromResult(result: AnalysisResult, key: string): number | null {
  return numberOrNull(result.categories.find(category => category.key === key)?.score);
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
  if (typeof details === 'string') return details.slice(0, 220);
  return null;
}

function mutationTargetRef(details: unknown): string | null {
  const parsed = parseDetails(details);
  const invariants = parsed?.['invariants'];
  if (invariants && typeof invariants === 'object' && !Array.isArray(invariants)) {
    const ref = (invariants as Record<string, unknown>)['targetRef'];
    if (typeof ref === 'string' && ref.length > 0) return ref;
  }
  return null;
}

function relevantTool(row: RunToolRow): boolean {
  return Boolean(row.toolName && [
    'set_document_title',
    'set_document_language',
    'replace_bookmarks_from_headings',
    'post_pass_bookmarks',
    'add_page_outline_bookmarks',
    'create_heading_from_tagged_visible_anchor',
    'create_heading_from_candidate',
    'normalize_heading_hierarchy',
    'set_figure_alt_text',
    'retag_as_figure',
    'repair_alt_text_structure',
    'normalize_table_structure',
    'set_table_header_cells',
    'repair_native_table_headers',
    'repair_native_link_structure',
  ].includes(row.toolName));
}

function summarizeTools(row: RunRow | undefined): ToolSummary[] {
  return (row?.appliedTools ?? []).filter(relevantTool).map(tool => ({
    toolName: tool.toolName ?? '',
    outcome: tool.outcome ?? 'unknown',
    scoreBefore: numberOrNull(tool.scoreBefore),
    scoreAfter: numberOrNull(tool.scoreAfter),
    delta: numberOrNull(tool.delta),
    stage: numberOrNull(tool.stage),
    round: numberOrNull(tool.round),
    source: typeof tool.source === 'string' ? tool.source : null,
    targetRef: mutationTargetRef(tool.details),
    note: detailNote(tool.details),
  }));
}

function attemptedRefs(row: RunRow | undefined, toolName: string): Set<string> {
  return new Set(
    (row?.appliedTools ?? [])
      .filter(tool => tool.toolName === toolName)
      .map(tool => mutationTargetRef(tool.details))
      .filter((ref): ref is string => Boolean(ref)),
  );
}

function buildSignals(result: AnalysisResult, row: RunRow | undefined, snapshot: DocumentSnapshot, candidates: FigureCandidateDiagnostic[]): Stage166Signals {
  const figureSummary = summarizeFigureCandidates(candidates, row);
  const checkerVisibleMissingAlt = candidates.filter(candidate => candidate.checkerVisible && candidate.reachable && !candidate.hasAlt);
  const attemptedTableRefs = attemptedRefs(row, 'normalize_table_structure');
  const unattemptedStrongTableRefs = snapshot.tables
    .filter(table =>
      table.structRef &&
      !attemptedTableRefs.has(table.structRef) &&
      table.hasHeaders &&
      (table.cellsMisplacedCount ?? 0) === 0 &&
      (table.rowCount ?? 0) > 1 &&
      (table.irregularRows ?? 0) >= 2 &&
      (table.dominantColumnCount ?? 0) >= 2
    )
    .sort((a, b) => (b.irregularRows ?? 0) - (a.irregularRows ?? 0) || a.page - b.page || (a.structRef ?? '').localeCompare(b.structRef ?? ''))
    .map(table => table.structRef!)
    .slice(0, 8);
  return {
    titleLanguage: categoryFromRun(row, 'title_language') ?? categoryFromResult(result, 'title_language'),
    headingStructure: categoryFromRun(row, 'heading_structure') ?? categoryFromResult(result, 'heading_structure'),
    bookmarks: categoryFromRun(row, 'bookmarks') ?? categoryFromResult(result, 'bookmarks'),
    altText: categoryFromRun(row, 'alt_text') ?? categoryFromResult(result, 'alt_text'),
    pdfUaCompliance: categoryFromRun(row, 'pdf_ua_compliance') ?? categoryFromResult(result, 'pdf_ua_compliance'),
    tableMarkup: categoryFromRun(row, 'table_markup') ?? categoryFromResult(result, 'table_markup'),
    linkQuality: categoryFromRun(row, 'link_quality') ?? categoryFromResult(result, 'link_quality'),
    readingOrder: categoryFromRun(row, 'reading_order') ?? categoryFromResult(result, 'reading_order'),
    metadataTitle: snapshot.metadata.title?.trim() || null,
    bookmarkCount: snapshot.bookmarks.length,
    firstBookmarkTitles: snapshot.bookmarks.slice(0, 6).map(bookmark => bookmark.title),
    headingCount: snapshot.headings.length,
    h1Count: snapshot.headings.filter(heading => heading.level === 1).length,
    headingTreeDepth: numberOrNull(snapshot.detectionProfile?.headingSignals.headingTreeDepth),
    checkerVisibleFigureCount: figureSummary.checkerVisibleFigureCount,
    checkerVisibleMissingAltCount: checkerVisibleMissingAlt.length,
    directSafeCheckerVisibleMissingAltCount: checkerVisibleMissingAlt.filter(candidate =>
      candidate.directContent &&
      candidate.structRef &&
      !figureSummary.attemptedTargetRefs.includes(candidate.structRef)
    ).length,
    safeRoleMapRetagTargetCount: figureSummary.safeRoleMapRetagTargetCount,
    attemptedAltTargetRefs: figureSummary.attemptedTargetRefs,
    irregularTableCount: snapshot.detectionProfile?.tableSignals.irregularTableCount ?? 0,
    stronglyIrregularTableCount: snapshot.detectionProfile?.tableSignals.stronglyIrregularTableCount ?? 0,
    unattemptedStrongTableRefs,
  };
}

export function classifyStage166MixedTail(input: {
  publicationId: string;
  sourceKind: SourceKind | string;
  falsePositiveApplied: number;
  signals: Stage166Signals;
}): Pick<Stage166DiagnosticRow, 'mixedTailClass' | 'implementable' | 'reason'> {
  if (
    input.sourceKind === 'legacy_parked_control' ||
    ['structure-4076', 'long-4683', 'short-4214', 'long-4516'].includes(input.publicationId)
  ) {
    return {
      mixedTailClass: 'protected_or_analyzer_volatility',
      implementable: false,
      reason: 'parked protected/analyzer-volatility row; do not use for Stage 166 behavior',
    };
  }
  if (input.falsePositiveApplied > 0) {
    return {
      mixedTailClass: 'no_safe_candidate',
      implementable: false,
      reason: 'reference row has false-positive-applied evidence',
    };
  }
  const s = input.signals;
  const canTopupNavigation =
    (s.titleLanguage ?? 100) < 100 &&
    (s.headingStructure ?? 100) < 90 &&
    s.h1Count > 1 &&
    s.headingCount >= 4 &&
    (s.readingOrder ?? 0) >= 90;
  if (canTopupNavigation) {
    return {
      mixedTailClass: 'figure_title_bookmark_heading_candidate',
      implementable: input.sourceKind === 'legacy_primary' || input.sourceKind === 'active_matching',
      reason: `filename-like/weak title plus duplicate H1 heading debt (${s.h1Count} H1s, ${s.headingCount} headings)`,
    };
  }
  const tableCandidate =
    (s.tableMarkup ?? 100) < 80 &&
    (s.headingStructure ?? 0) >= 80 &&
    (s.readingOrder ?? 0) >= 80 &&
    s.stronglyIrregularTableCount > 0 &&
    s.unattemptedStrongTableRefs.length > 0;
  if (tableCandidate) {
    return {
      mixedTailClass: 'stable_table_continuation_candidate',
      implementable: input.sourceKind === 'legacy_primary' || input.sourceKind === 'active_matching',
      reason: `unattempted content-backed strongly-irregular table refs remain: ${s.unattemptedStrongTableRefs.length}`,
    };
  }
  if ((s.altText ?? 100) < 80 && s.directSafeCheckerVisibleMissingAltCount > 0 && (s.pdfUaCompliance ?? 0) >= 80) {
    return {
      mixedTailClass: 'safe_alt_target_with_pdfua_stable',
      implementable: input.sourceKind === 'legacy_primary' || input.sourceKind === 'active_matching',
      reason: `direct checker-visible missing-alt targets remain with PDF/UA stable: ${s.directSafeCheckerVisibleMissingAltCount}`,
    };
  }
  if ((s.altText ?? 100) < 80 && (s.directSafeCheckerVisibleMissingAltCount > 0 || s.safeRoleMapRetagTargetCount > 0)) {
    return {
      mixedTailClass: 'mixed_alt_pdfua_not_safe',
      implementable: false,
      reason: 'alt targets exist, but another core category or PDF/UA is the active risk',
    };
  }
  return {
    mixedTailClass: 'no_safe_candidate',
    implementable: false,
    reason: 'no safe Stage 166 mixed-tail target',
  };
}

async function loadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(parsed) ? parsed as RunRow[] : Object.values(parsed as Record<string, RunRow>);
  const out = new Map<string, RunRow>();
  for (const row of rows) {
    if (row.id) out.set(row.id, row);
    if (row.publicationId) out.set(row.publicationId, row);
  }
  return out;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function artifactPdfFor(runDir: string, row: SourceRow): Promise<string | null> {
  for (const candidate of [join(runDir, 'pdfs', `${row.id}.pdf`), join(runDir, 'pdfs', `${row.publicationId}.pdf`)]) {
    if (await exists(candidate)) return candidate;
  }
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

async function sourceRowsFromLegacyRun(legacyRun: string, legacyRoot: string, ids: Set<string>): Promise<SourceRow[]> {
  const runRows = await loadRunRows(legacyRun);
  const selected = ids.size > 0 ? ids : new Set([...LEGACY_PRIMARY_IDS, ...LEGACY_PARKED_IDS, ...LEGACY_CONTROL_IDS]);
  const rows: SourceRow[] = [];
  for (const id of selected) {
    const runRow = runRows.get(id);
    if (!runRow?.file) continue;
    rows.push({
      id,
      publicationId: id,
      title: id,
      file: runRow.file,
      sourcePath: resolve(legacyRoot, runRow.file),
      sourceKind: LEGACY_PRIMARY_IDS.has(id)
        ? 'legacy_primary'
        : LEGACY_PARKED_IDS.has(id)
          ? 'legacy_parked_control'
          : 'legacy_required_control',
      runDir: legacyRun,
      runRow,
    });
  }
  return rows;
}

async function sourceRowsFromActiveManifest(manifestPath: string, activeRun: string, ids: Set<string>): Promise<SourceRow[]> {
  const manifestRows = await loadEdgeMixManifest(manifestPath);
  const runRows = await loadRunRows(activeRun);
  const selected = ids.size > 0 ? ids : new Set([...ACTIVE_MATCHING_IDS, ...ACTIVE_CONTROL_IDS]);
  return manifestRows
    .filter(row => selected.has(row.publicationId) || selected.has(row.id))
    .map((row: EdgeMixManifestRow) => ({
      id: row.id,
      publicationId: row.publicationId,
      title: row.title,
      file: row.localFile,
      sourcePath: row.absolutePath,
      sourceKind: ACTIVE_MATCHING_IDS.has(row.publicationId) ? 'active_matching' : 'active_required_control',
      runDir: activeRun,
      runRow: runRows.get(row.publicationId) ?? runRows.get(row.id),
    }));
}

async function analyzeSourceRow(row: SourceRow): Promise<Stage166DiagnosticRow> {
  const artifactPdf = await artifactPdfFor(row.runDir, row);
  const pdfPath = artifactPdf ?? row.sourcePath;
  const { result, snapshot } = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  const figureCandidates = buildFigureCandidateDiagnostics(snapshot);
  const signals = buildSignals(result, row.runRow, snapshot, figureCandidates);
  const falsePositiveApplied = Number(row.runRow?.falsePositiveAppliedCount ?? row.runRow?.falsePositiveApplied ?? 0);
  const classified = classifyStage166MixedTail({
    publicationId: row.publicationId,
    sourceKind: row.sourceKind,
    falsePositiveApplied,
    signals,
  });
  return {
    id: row.id,
    publicationId: row.publicationId,
    sourceKind: row.sourceKind,
    file: row.file,
    benchmarkScore: numberOrNull(row.runRow?.afterScore),
    benchmarkGrade: typeof row.runRow?.afterGrade === 'string' ? row.runRow.afterGrade : null,
    reanalyzedScore: numberOrNull(row.runRow?.reanalyzedScore),
    reanalyzedGrade: typeof row.runRow?.reanalyzedGrade === 'string' ? row.runRow.reanalyzedGrade : null,
    analyzedScore: result.score,
    analyzedGrade: result.grade,
    analyzedPdf: pdfPath,
    analyzedFromArtifact: Boolean(artifactPdf),
    falsePositiveApplied,
    signals,
    figureCandidates,
    relevantTools: summarizeTools(row.runRow),
    ...classified,
  };
}

function buildReport(legacyRun: string, activeRun: string, activeManifest: string, rows: Stage166DiagnosticRow[]): Stage166DiagnosticReport {
  const classDistribution = rows.reduce<Record<Stage166MixedTailClass, number>>((acc, row) => {
    acc[row.mixedTailClass] += 1;
    return acc;
  }, {
    figure_title_bookmark_heading_candidate: 0,
    stable_table_continuation_candidate: 0,
    safe_alt_target_with_pdfua_stable: 0,
    mixed_alt_pdfua_not_safe: 0,
    protected_or_analyzer_volatility: 0,
    no_safe_candidate: 0,
  });
  const selectedRows = rows.filter(row => row.implementable).map(row => row.publicationId).sort();
  return {
    legacyRun,
    activeRun,
    activeManifest,
    rows,
    decision: {
      classDistribution,
      selectedRows,
      recommendedDirection: rows.some(row => row.implementable && row.mixedTailClass === 'figure_title_bookmark_heading_candidate')
        ? 'implement_title_heading_topup'
        : rows.some(row => row.implementable && row.mixedTailClass === 'stable_table_continuation_candidate')
          ? 'investigate_stable_table_targets'
          : 'diagnostic_only_no_safe_mixed_tail_rule',
    },
  };
}

function renderMarkdown(report: Stage166DiagnosticReport): string {
  const lines = [
    '# Stage 166 Stable Mixed Tail Diagnostic',
    '',
    `Legacy run: \`${report.legacyRun}\``,
    `Active run: \`${report.activeRun}\``,
    `Active manifest: \`${report.activeManifest}\``,
    '',
    `Decision: \`${report.decision.recommendedDirection}\``,
    `Selected rows: ${report.decision.selectedRows.map(id => `\`${id}\``).join(', ') || 'none'}`,
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.decision.classDistribution).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| Row | Kind | Run | Analyzed | Title | H | H1/Headings | Bookmarks | Alt | PDF/UA | Table | Link | RO | Direct alt | Retag | Strong table refs | Class | Reason |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    const s = row.signals;
    lines.push(`| ${row.publicationId} | ${row.sourceKind} | ${row.reanalyzedScore ?? row.benchmarkScore ?? 'n/a'} ${row.reanalyzedGrade ?? row.benchmarkGrade ?? ''} | ${row.analyzedScore} ${row.analyzedGrade} | ${s.titleLanguage ?? 'n/a'} | ${s.headingStructure ?? 'n/a'} | ${s.h1Count}/${s.headingCount} | ${s.bookmarks ?? 'n/a'} (${s.bookmarkCount}) | ${s.altText ?? 'n/a'} | ${s.pdfUaCompliance ?? 'n/a'} | ${s.tableMarkup ?? 'n/a'} | ${s.linkQuality ?? 'n/a'} | ${s.readingOrder ?? 'n/a'} | ${s.directSafeCheckerVisibleMissingAltCount} | ${s.safeRoleMapRetagTargetCount} | ${s.unattemptedStrongTableRefs.length} | ${row.mixedTailClass} | ${row.reason} |`);
  }

  lines.push('', '## Evidence Details', '');
  for (const row of report.rows.filter(item => item.implementable || item.sourceKind === 'legacy_primary')) {
    const s = row.signals;
    lines.push(`### ${row.publicationId}`);
    lines.push(`- Analyzed PDF: \`${row.analyzedPdf}\`${row.analyzedFromArtifact ? ' (artifact)' : ''}`);
    lines.push(`- Metadata title: ${s.metadataTitle ? `\`${s.metadataTitle}\`` : 'none'}`);
    lines.push(`- First bookmarks: ${s.firstBookmarkTitles.map(title => `\`${title}\``).join(', ') || 'none'}`);
    lines.push(`- Attempted figure refs: ${s.attemptedAltTargetRefs.map(ref => `\`${ref}\``).join(', ') || 'none'}`);
    lines.push(`- Unattempted strong table refs: ${s.unattemptedStrongTableRefs.map(ref => `\`${ref}\``).join(', ') || 'none'}`);
    lines.push(`- Relevant tools: ${row.relevantTools.map(tool => `${tool.toolName}:${tool.outcome}${tool.note ? `(${tool.note})` : ''}`).join('; ') || 'none'}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let legacyRoot = DEFAULT_LEGACY_ROOT;
  let legacyRun = DEFAULT_LEGACY_RUN;
  let activeManifest = DEFAULT_ACTIVE_MANIFEST;
  let activeRun = DEFAULT_ACTIVE_RUN;
  let out = DEFAULT_OUT;
  const legacyIds = new Set<string>();
  const activeIds = new Set<string>();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    if (arg === '--legacy-root') legacyRoot = next();
    else if (arg === '--legacy-run') legacyRun = next();
    else if (arg === '--active-manifest') activeManifest = next();
    else if (arg === '--active-run') activeRun = next();
    else if (arg === '--out') out = next();
    else if (arg === '--legacy-file') legacyIds.add(next());
    else if (arg === '--active-file') activeIds.add(next());
    else if (arg === '--all-defaults') {
      legacyIds.clear();
      activeIds.clear();
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      return;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  const legacyRows = await sourceRowsFromLegacyRun(legacyRun, legacyRoot, legacyIds);
  const activeRows = await sourceRowsFromActiveManifest(activeManifest, activeRun, activeIds);
  const rows: Stage166DiagnosticRow[] = [];
  for (const row of [...legacyRows, ...activeRows]) rows.push(await analyzeSourceRow(row));
  const report = buildReport(legacyRun, activeRun, activeManifest, rows);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage166-mixed-tail-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(out, 'stage166-mixed-tail-diagnostic.md'), renderMarkdown(report));
  console.log(`Wrote ${join(out, 'stage166-mixed-tail-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
