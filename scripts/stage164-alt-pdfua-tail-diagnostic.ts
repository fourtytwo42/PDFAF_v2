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
const DEFAULT_LEGACY_RUN = 'Output/experiment-corpus-baseline/run-stage163-full-2026-04-30-r1';
const DEFAULT_ACTIVE_MANIFEST = 'Input/stage145-active-low-grade-tail/manifest.json';
const DEFAULT_ACTIVE_RUN = 'Output/stage145-low-grade-tail/run-stage162-active-tail-2026-04-30-r4';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage164-alt-pdfua-tail-diagnostic-2026-04-30-r1';

const LEGACY_PRIMARY_IDS = new Set(['figure-4754', 'font-4057', 'long-4680', 'fixture-inaccessible']);
const LEGACY_PARKED_IDS = new Set(['short-4176', 'structure-4076', 'long-4683']);
const LEGACY_CONTROL_IDS = new Set(['font-4156', 'font-4172', 'font-4699']);

const ACTIVE_CONTROL_IDS = new Set(['v1-v1-3468', 'v1-v1-4766', 'v1-v1-4761', 'v1-v1-4635']);
const ACTIVE_MATCHING_IDS = new Set(['orig-figure-4754', 'orig-font-4057', 'orig-long-4680', 'orig-fixture-inaccessible']);

export type Stage164AltPdfuaClass =
  | 'stable_checker_visible_alt_candidate'
  | 'alt_pdfua_mixed_candidate'
  | 'link_pdfua_primary_not_alt'
  | 'heading_or_analyzer_volatility'
  | 'visual_risk_or_no_safe_target';

type SourceKind = 'legacy_primary' | 'legacy_parked_control' | 'legacy_required_control' | 'active_matching' | 'active_required_control';

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

interface FigureToolSummary {
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

export interface Stage164Signals {
  altText: number | null;
  pdfUaCompliance: number | null;
  linkQuality: number | null;
  headingStructure: number | null;
  readingOrder: number | null;
  tableMarkup: number | null;
  checkerVisibleFigureCount: number;
  checkerVisibleFigureWithAltCount: number;
  checkerVisibleMissingAltCount: number;
  directSafeCheckerVisibleMissingAltCount: number;
  contentlessCheckerVisibleMissingAltCount: number;
  safeRoleMapRetagTargetCount: number;
  attemptedAltTargetRefs: string[];
  terminalFigureToolCount: number;
  scoreShapeFigureRejectionCount: number;
  invariantFigureFailureCount: number;
}

export interface Stage164DiagnosticRow {
  id: string;
  publicationId: string;
  title: string;
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
  signals: Stage164Signals;
  figureCandidates: FigureCandidateDiagnostic[];
  figureTools: FigureToolSummary[];
  altPdfuaClass: Stage164AltPdfuaClass;
  implementable: boolean;
  reason: string;
}

export interface Stage164DiagnosticReport {
  legacyRun: string;
  activeRun: string;
  activeManifest: string;
  rows: Stage164DiagnosticRow[];
  decision: {
    classDistribution: Record<Stage164AltPdfuaClass, number>;
    selectedRows: string[];
    recommendedDirection:
      | 'investigate_stable_checker_visible_alt_targets'
      | 'investigate_alt_pdfua_mixed_targets'
      | 'diagnostic_only_no_safe_alt_rule';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage164-alt-pdfua-tail-diagnostic.ts [options]

Options:
  --legacy-root <path>      Original corpus root (default: ${DEFAULT_LEGACY_ROOT})
  --legacy-run <dir>        Original-50 reference run (default: ${DEFAULT_LEGACY_RUN})
  --active-manifest <path>  Active-tail manifest (default: ${DEFAULT_ACTIVE_MANIFEST})
  --active-run <dir>        Active-tail reference run (default: ${DEFAULT_ACTIVE_RUN})
  --out <dir>               Output diagnostic directory (default: ${DEFAULT_OUT})
  --legacy-file <id>        Limit/add original-corpus row id; repeatable
  --active-file <id>        Limit/add active-tail publication id; repeatable
  --all-defaults            Use the default Stage 164 row set (default)
  --help                    Show this help`;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function categoryFromRun(row: RunRow | undefined, key: string, preferReanalyzed = true): number | null {
  const categories = preferReanalyzed && Array.isArray(row?.reanalyzedCategories)
    ? row?.reanalyzedCategories
    : row?.afterCategories;
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

function targetRefFromDetails(details: unknown): string | null {
  const parsed = parseDetails(details);
  const inv = parsed?.['invariants'];
  if (inv && typeof inv === 'object' && !Array.isArray(inv)) {
    const targetRef = (inv as Record<string, unknown>)['targetRef'];
    if (typeof targetRef === 'string' && targetRef.length > 0) return targetRef;
  }
  const debug = parsed?.['debug'];
  if (debug && typeof debug === 'object' && !Array.isArray(debug)) {
    const state = (debug as Record<string, unknown>)['replayState'];
    if (state && typeof state === 'object' && !Array.isArray(state)) {
      const targetRef = (state as Record<string, unknown>)['targetRef'];
      if (typeof targetRef === 'string' && targetRef.length > 0) return targetRef;
    }
  }
  return null;
}

function isFigureTool(toolName: string | undefined): boolean {
  return Boolean(toolName && [
    'normalize_nested_figure_containers',
    'canonicalize_figure_alt_ownership',
    'retag_as_figure',
    'set_figure_alt_text',
    'repair_alt_text_structure',
    'mark_figure_decorative',
  ].includes(toolName));
}

function summarizeFigureTools(row: RunRow | undefined): FigureToolSummary[] {
  return (row?.appliedTools ?? [])
    .filter(tool => isFigureTool(tool.toolName))
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
    }));
}

function buildSignals(result: AnalysisResult, row: RunRow | undefined, snapshot: DocumentSnapshot, candidates: FigureCandidateDiagnostic[]): Stage164Signals {
  const summary = summarizeFigureCandidates(candidates, row);
  const checkerVisibleMissingAlt = candidates.filter(candidate =>
    candidate.checkerVisible &&
    candidate.reachable &&
    !candidate.hasAlt
  );
  return {
    altText: categoryFromRun(row, 'alt_text') ?? categoryFromResult(result, 'alt_text'),
    pdfUaCompliance: categoryFromRun(row, 'pdf_ua_compliance') ?? categoryFromResult(result, 'pdf_ua_compliance'),
    linkQuality: categoryFromRun(row, 'link_quality') ?? categoryFromResult(result, 'link_quality'),
    headingStructure: categoryFromRun(row, 'heading_structure') ?? categoryFromResult(result, 'heading_structure'),
    readingOrder: categoryFromRun(row, 'reading_order') ?? categoryFromResult(result, 'reading_order'),
    tableMarkup: categoryFromRun(row, 'table_markup') ?? categoryFromResult(result, 'table_markup'),
    checkerVisibleFigureCount: summary.checkerVisibleFigureCount,
    checkerVisibleFigureWithAltCount: summary.checkerVisibleFigureWithAltCount,
    checkerVisibleMissingAltCount: checkerVisibleMissingAlt.length,
    directSafeCheckerVisibleMissingAltCount: checkerVisibleMissingAlt.filter(candidate => candidate.directContent && candidate.structRef && !summary.attemptedTargetRefs.includes(candidate.structRef)).length,
    contentlessCheckerVisibleMissingAltCount: checkerVisibleMissingAlt.filter(candidate => !candidate.directContent && candidate.subtreeMcidCount <= 0).length,
    safeRoleMapRetagTargetCount: summary.safeRoleMapRetagTargetCount,
    attemptedAltTargetRefs: summary.attemptedTargetRefs,
    terminalFigureToolCount: summary.terminalFigureToolCount,
    scoreShapeFigureRejectionCount: summary.scoreShapeFigureRejectionCount,
    invariantFigureFailureCount: summary.invariantFigureFailureCount,
  };
}

export function classifyStage164AltPdfua(input: {
  publicationId: string;
  sourceKind: SourceKind | string;
  falsePositiveApplied: number;
  signals: Stage164Signals;
}): Pick<Stage164DiagnosticRow, 'altPdfuaClass' | 'implementable' | 'reason'> {
  if (input.sourceKind === 'legacy_parked_control' || ['short-4176', 'structure-4076', 'long-4683'].includes(input.publicationId)) {
    return {
      altPdfuaClass: 'heading_or_analyzer_volatility',
      implementable: false,
      reason: 'parked protected/analyzer-volatility row; do not use for Stage 164 behavior',
    };
  }
  if (input.falsePositiveApplied > 0) {
    return {
      altPdfuaClass: 'visual_risk_or_no_safe_target',
      implementable: false,
      reason: 'reference row has false-positive-applied evidence',
    };
  }

  const signals = input.signals;
  const altLow = (signals.altText ?? 100) < 80;
  const pdfuaOrLinkLow = (signals.pdfUaCompliance ?? 100) < 80 || (signals.linkQuality ?? 100) < 80;
  const severeHeadingOrReadingOrder =
    (signals.headingStructure ?? 100) < 40 ||
    (signals.readingOrder ?? 100) < 40;
  const hasDirectSafeAltTarget = signals.directSafeCheckerVisibleMissingAltCount > 0;
  const hasRetagTarget = signals.safeRoleMapRetagTargetCount > 0;
  const onlyContentlessAltTargets =
    signals.checkerVisibleMissingAltCount > 0 &&
    signals.directSafeCheckerVisibleMissingAltCount === 0 &&
    signals.contentlessCheckerVisibleMissingAltCount > 0;

  if (severeHeadingOrReadingOrder && !hasDirectSafeAltTarget && !hasRetagTarget) {
    return {
      altPdfuaClass: 'heading_or_analyzer_volatility',
      implementable: false,
      reason: 'heading or reading-order debt is the primary limiter and no safe direct alt target remains',
    };
  }
  if (!altLow && pdfuaOrLinkLow) {
    return {
      altPdfuaClass: 'link_pdfua_primary_not_alt',
      implementable: false,
      reason: 'PDF/UA or link residual remains, but alt coverage is not the active limiter',
    };
  }
  if (altLow && hasDirectSafeAltTarget) {
    return {
      altPdfuaClass: pdfuaOrLinkLow ? 'alt_pdfua_mixed_candidate' : 'stable_checker_visible_alt_candidate',
      implementable: true,
      reason: `direct checker-visible missing-alt target(s) remain: ${signals.directSafeCheckerVisibleMissingAltCount}`,
    };
  }
  if (altLow && hasRetagTarget) {
    return {
      altPdfuaClass: 'alt_pdfua_mixed_candidate',
      implementable: true,
      reason: `safe role-map retag target(s) remain: ${signals.safeRoleMapRetagTargetCount}`,
    };
  }
  if (onlyContentlessAltTargets) {
    return {
      altPdfuaClass: 'visual_risk_or_no_safe_target',
      implementable: false,
      reason: 'remaining checker-visible missing-alt targets are not direct-content backed',
    };
  }
  return {
    altPdfuaClass: 'visual_risk_or_no_safe_target',
    implementable: false,
    reason: altLow ? 'low alt remains but no unattempted safe checker-visible target was found' : 'no safe Stage 164 alt/PDF-UA target',
  };
}

async function loadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(parsed) ? parsed as RunRow[] : [];
  const out = new Map<string, RunRow>();
  for (const row of rows) {
    if (row.id) out.set(row.id, row);
    if (row.publicationId) out.set(row.publicationId, row);
  }
  return out;
}

async function existingFile(path: string): Promise<string | null> {
  try {
    await access(path);
    return path;
  } catch {
    return null;
  }
}

async function artifactPdfFor(runDir: string, row: SourceRow): Promise<string | null> {
  const experimentPdf = await existingFile(join(runDir, 'pdfs', `${row.id}.pdf`));
  if (experimentPdf) return experimentPdf;
  const activeIdPdf = await existingFile(join(runDir, 'pdfs', `${row.publicationId}.pdf`));
  if (activeIdPdf) return activeIdPdf;
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

function normalizeLegacyTitle(row: RunRow): string {
  return (row.id ?? row.file ?? 'legacy-row').replace(/^(orig-)?/, '');
}

async function sourceRowsFromLegacyRun(
  legacyRun: string,
  legacyRoot: string,
  requestedIds: Set<string>,
): Promise<SourceRow[]> {
  const runRows = await loadRunRows(legacyRun);
  const ids = requestedIds.size > 0
    ? requestedIds
    : new Set([...LEGACY_PRIMARY_IDS, ...LEGACY_PARKED_IDS, ...LEGACY_CONTROL_IDS]);
  const rows: SourceRow[] = [];
  for (const id of ids) {
    const runRow = runRows.get(id);
    if (!runRow?.file) continue;
    const sourcePath = resolve(legacyRoot, runRow.file);
    const sourceKind: SourceKind = LEGACY_PRIMARY_IDS.has(id)
      ? 'legacy_primary'
      : LEGACY_PARKED_IDS.has(id)
        ? 'legacy_parked_control'
        : 'legacy_required_control';
    rows.push({
      id,
      publicationId: id,
      title: normalizeLegacyTitle(runRow),
      file: runRow.file,
      sourcePath,
      sourceKind,
      runDir: legacyRun,
      runRow,
    });
  }
  return rows;
}

async function sourceRowsFromActiveManifest(
  manifestPath: string,
  activeRun: string,
  requestedIds: Set<string>,
): Promise<SourceRow[]> {
  const manifestRows = await loadEdgeMixManifest(manifestPath);
  const runRows = await loadRunRows(activeRun);
  const ids = requestedIds.size > 0
    ? requestedIds
    : new Set([...ACTIVE_MATCHING_IDS, ...ACTIVE_CONTROL_IDS]);
  return manifestRows
    .filter(row => ids.has(row.publicationId) || ids.has(row.id))
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

async function analyzeSourceRow(row: SourceRow): Promise<Stage164DiagnosticRow> {
  const artifactPdf = await artifactPdfFor(row.runDir, row);
  const pdfPath = artifactPdf ?? row.sourcePath;
  const { result, snapshot } = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  const candidates = buildFigureCandidateDiagnostics(snapshot);
  const signals = buildSignals(result, row.runRow, snapshot, candidates);
  const falsePositiveApplied = Number(row.runRow?.falsePositiveAppliedCount ?? row.runRow?.falsePositiveApplied ?? 0);
  const classified = classifyStage164AltPdfua({
    publicationId: row.publicationId,
    sourceKind: row.sourceKind,
    falsePositiveApplied,
    signals,
  });
  return {
    id: row.id,
    publicationId: row.publicationId,
    title: row.title,
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
    figureCandidates: candidates,
    figureTools: summarizeFigureTools(row.runRow),
    ...classified,
  };
}

function buildReport(
  legacyRun: string,
  activeRun: string,
  activeManifest: string,
  rows: Stage164DiagnosticRow[],
): Stage164DiagnosticReport {
  const classDistribution = rows.reduce<Record<Stage164AltPdfuaClass, number>>((acc, row) => {
    acc[row.altPdfuaClass] += 1;
    return acc;
  }, {
    stable_checker_visible_alt_candidate: 0,
    alt_pdfua_mixed_candidate: 0,
    link_pdfua_primary_not_alt: 0,
    heading_or_analyzer_volatility: 0,
    visual_risk_or_no_safe_target: 0,
  });
  const selectedRows = rows
    .filter(row => row.implementable)
    .map(row => row.publicationId)
    .sort();
  const hasStableAlt = rows.some(row => row.implementable && row.altPdfuaClass === 'stable_checker_visible_alt_candidate');
  const hasMixedAlt = rows.some(row => row.implementable && row.altPdfuaClass === 'alt_pdfua_mixed_candidate');
  return {
    legacyRun,
    activeRun,
    activeManifest,
    rows,
    decision: {
      classDistribution,
      selectedRows,
      recommendedDirection: hasStableAlt
        ? 'investigate_stable_checker_visible_alt_targets'
        : hasMixedAlt
          ? 'investigate_alt_pdfua_mixed_targets'
          : 'diagnostic_only_no_safe_alt_rule',
    },
  };
}

function renderMarkdown(report: Stage164DiagnosticReport): string {
  const lines = [
    '# Stage 164 Alt/PDF-UA Tail Diagnostic',
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
    '| Row | Kind | Score | Reanalyzed | Analyzed | From artifact | Alt | PDF/UA | Link | H | RO | Table | Checker alt | Direct safe | Retag safe | Terminal figure tools | Class | Reason |',
    '| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    const s = row.signals;
    lines.push(`| ${row.publicationId} | ${row.sourceKind} | ${row.benchmarkScore ?? 'n/a'} ${row.benchmarkGrade ?? ''} | ${row.reanalyzedScore ?? 'n/a'} ${row.reanalyzedGrade ?? ''} | ${row.analyzedScore} ${row.analyzedGrade} | ${row.analyzedFromArtifact ? 'yes' : 'no'} | ${s.altText ?? 'n/a'} | ${s.pdfUaCompliance ?? 'n/a'} | ${s.linkQuality ?? 'n/a'} | ${s.headingStructure ?? 'n/a'} | ${s.readingOrder ?? 'n/a'} | ${s.tableMarkup ?? 'n/a'} | ${s.checkerVisibleFigureWithAltCount}/${s.checkerVisibleFigureCount} | ${s.directSafeCheckerVisibleMissingAltCount} | ${s.safeRoleMapRetagTargetCount} | ${s.terminalFigureToolCount} | ${row.altPdfuaClass} | ${row.reason} |`);
  }

  lines.push('', '## Implementable Evidence', '');
  for (const row of report.rows.filter(item => item.implementable)) {
    lines.push(`### ${row.publicationId}`);
    lines.push(`- Analyzed PDF: \`${row.analyzedPdf}\`${row.analyzedFromArtifact ? '' : ' (source PDF; no final artifact was available)'}`);
    lines.push(`- Attempted figure refs: ${row.signals.attemptedAltTargetRefs.map(ref => `\`${ref}\``).join(', ') || 'none'}`);
    const targets = row.figureCandidates
      .filter(candidate => candidate.checkerVisible && !candidate.hasAlt && candidate.directContent)
      .slice(0, 8)
      .map(candidate => `\`${candidate.structRef}\` p${candidate.page + 1} role=${candidate.rawRole ?? candidate.resolvedRole ?? 'n/a'}`);
    lines.push(`- Direct checker-visible missing-alt targets: ${targets.join(', ') || 'none'}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let legacyRoot = DEFAULT_LEGACY_ROOT;
  let legacyRun = DEFAULT_LEGACY_RUN;
  let activeManifest = DEFAULT_ACTIVE_MANIFEST;
  let activeRun = DEFAULT_ACTIVE_RUN;
  let outDir = DEFAULT_OUT;
  const legacyRequested = new Set<string>();
  const activeRequested = new Set<string>();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--legacy-root') legacyRoot = args[++i] ?? legacyRoot;
    else if (arg === '--legacy-run') legacyRun = args[++i] ?? legacyRun;
    else if (arg === '--active-manifest') activeManifest = args[++i] ?? activeManifest;
    else if (arg === '--active-run') activeRun = args[++i] ?? activeRun;
    else if (arg === '--out') outDir = args[++i] ?? outDir;
    else if (arg === '--legacy-file') legacyRequested.add(args[++i] ?? '');
    else if (arg === '--active-file') activeRequested.add(args[++i] ?? '');
    else if (arg === '--all-defaults') {
      legacyRequested.clear();
      activeRequested.clear();
    } else if (arg === '--help') {
      console.log(usage());
      return;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  const legacyRows = await sourceRowsFromLegacyRun(legacyRun, legacyRoot, legacyRequested);
  const activeRows = await sourceRowsFromActiveManifest(activeManifest, activeRun, activeRequested);
  const rows: Stage164DiagnosticRow[] = [];
  for (const row of [...legacyRows, ...activeRows]) rows.push(await analyzeSourceRow(row));

  const report = buildReport(legacyRun, activeRun, activeManifest, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage164-alt-pdfua-tail-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage164-alt-pdfua-tail-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
