#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import {
  buildFigureCandidateDiagnostics,
  summarizeFigureCandidates,
  type FigureCandidateDiagnostic,
} from './stage50-figure-residual-diagnostic.js';

const DEFAULT_LEGACY_ROOT = 'Input/experiment-corpus';
const DEFAULT_REFERENCE_RUN = 'Output/experiment-corpus-baseline/run-stage178-full-2026-05-02-r1';
const DEFAULT_HARD_ROOT = 'Input/from_sibling_pdfaf_v1_hard_2';
const DEFAULT_HARD_RUN = 'Output/from_sibling_pdfaf_v1_hard_2/run-stage178-hard2-smoke-2026-05-02-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage179-partial-alt-ownership-diagnostic-2026-05-02-r1';

const PRIMARY_IDS = new Set(['structure-4131', 'font-3437', 'font-3448', 'font-3529', 'figure-4702', 'font-4156']);
const SECONDARY_IDS = new Set(['figure-4754', 'font-4057', 'long-4516']);
const PARKED_IDS = new Set(['structure-4076', 'short-4176', 'long-4683', 'short-4214']);
const REGRESSION_IDS = new Set(['font-4172', 'font-4699', 'fixture-inaccessible', 'long-4680', 'long-4700']);
const HARD_CONTROL_PUBLICATION_IDS = new Set(['3510', '4705']);

export type Stage179PartialAltClass =
  | 'hidden_checker_alt_target_candidate'
  | 'orphan_figure_alt_ownership_candidate'
  | 'decorative_artifact_candidate'
  | 'alt_pdfua_path_paint_candidate'
  | 'mixed_table_or_heading_not_alt_first'
  | 'protected_or_analyzer_volatility'
  | 'no_safe_target';

type RowKind = 'primary' | 'secondary_mixed' | 'parked_control' | 'regression_control' | 'hard_control';

interface RunToolRow {
  toolName?: string;
  outcome?: string;
  details?: unknown;
  scoreBefore?: number;
  scoreAfter?: number;
  stage?: number;
  round?: number;
}

interface RunRow {
  id?: string;
  publicationId?: string;
  file?: string;
  localFile?: string;
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

export interface Stage179Signals {
  altText: number | null;
  pdfUaCompliance: number | null;
  linkQuality: number | null;
  headingStructure: number | null;
  readingOrder: number | null;
  tableMarkup: number | null;
  figureCount: number;
  figureWithAltCount: number;
  checkerVisibleFigureCount: number;
  checkerVisibleFigureWithAltCount: number;
  directSafeCheckerVisibleMissingAltCount: number;
  safeRoleMapRetagTargetCount: number;
  attemptedAltTargetRefs: string[];
  nonFigureWithAltCount: number;
  emptyNonFigureAltActualCount: number;
  nestedFigureAltCount: number;
  orphanedAltEmptyElementCount: number;
  orphanMcidCount: number;
  suspectedPathPaintOutsideMc: number;
  taggedAnnotationRiskCount: number;
  imageOnlyPageCount: number;
}

export interface Stage179DiagnosticRow {
  id: string;
  rowKind: RowKind;
  file: string;
  analyzedPdf: string;
  analyzedFromArtifact: boolean;
  benchmarkScore: number | null;
  benchmarkGrade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  analyzedScore: number;
  analyzedGrade: string;
  falsePositiveApplied: number;
  signals: Stage179Signals;
  figureCandidates: FigureCandidateDiagnostic[];
  figureTools: Array<{
    toolName: string;
    outcome: string;
    scoreBefore: number | null;
    scoreAfter: number | null;
    targetRef: string | null;
    note: string | null;
  }>;
  partialAltClass: Stage179PartialAltClass;
  implementable: boolean;
  reason: string;
}

export interface Stage179DiagnosticReport {
  referenceRun: string;
  hardRun: string;
  rows: Stage179DiagnosticRow[];
  decision: {
    classDistribution: Record<Stage179PartialAltClass, number>;
    selectedRows: string[];
    recommendedDirection:
      | 'try_empty_nonfigure_alt_cleanup'
      | 'try_hidden_checker_alt_targeting'
      | 'try_decorative_artifact_cleanup'
      | 'try_pdfua_path_paint_cleanup'
      | 'diagnostic_only_no_safe_rule';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage179-partial-alt-ownership-diagnostic.ts [options]

Options:
  --legacy-root <path>      Original corpus root (default: ${DEFAULT_LEGACY_ROOT})
  --reference-run <dir>     Stage 178 or target run (default: ${DEFAULT_REFERENCE_RUN})
  --hard-root <path>        Hard-holdout-2 input root (default: ${DEFAULT_HARD_ROOT})
  --hard-run <dir>          Hard-holdout-2 control run (default: ${DEFAULT_HARD_RUN})
  --out <dir>               Output diagnostic directory (default: ${DEFAULT_OUT})
  --file <id>               Limit/add original-corpus row id; repeatable
  --hard-file <id>          Limit/add hard-holdout publication id; repeatable
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

function detailNote(details: unknown): string | null {
  const parsed = parseDetails(details);
  if (typeof parsed?.['note'] === 'string') return parsed['note'];
  if (typeof parsed?.['raw'] === 'string') return parsed['raw'];
  return typeof details === 'string' ? details.slice(0, 180) : null;
}

function isFigureTool(toolName: string | undefined): boolean {
  return Boolean(toolName && [
    'normalize_nested_figure_containers',
    'canonicalize_figure_alt_ownership',
    'retag_as_figure',
    'set_figure_alt_text',
    'repair_alt_text_structure',
    'mark_figure_decorative',
    'repair_annotation_alt_text',
  ].includes(toolName));
}

function summarizeFigureTools(row: RunRow | undefined): Stage179DiagnosticRow['figureTools'] {
  return (row?.appliedTools ?? [])
    .filter(tool => isFigureTool(tool.toolName))
    .map(tool => ({
      toolName: tool.toolName ?? '',
      outcome: tool.outcome ?? 'unknown',
      scoreBefore: numberOrNull(tool.scoreBefore),
      scoreAfter: numberOrNull(tool.scoreAfter),
      targetRef: targetRefFromDetails(tool.details),
      note: detailNote(tool.details),
    }));
}

function buildSignals(result: AnalysisResult, row: RunRow | undefined, snapshot: DocumentSnapshot, candidates: FigureCandidateDiagnostic[]): Stage179Signals {
  const summary = summarizeFigureCandidates(candidates, row);
  const attempted = new Set(summary.attemptedTargetRefs);
  const directSafe = candidates.filter(candidate =>
    candidate.checkerVisible &&
    candidate.reachable &&
    candidate.directContent &&
    !candidate.hasAlt &&
    candidate.structRef &&
    !attempted.has(candidate.structRef)
  );
  const pdfUa = snapshot.detectionProfile?.pdfUaSignals;
  const risks = snapshot.acrobatStyleAltRisks;
  const figures = snapshot.figures.filter(figure => !figure.isArtifact);
  return {
    altText: categoryFromRun(row, 'alt_text') ?? categoryFromResult(result, 'alt_text'),
    pdfUaCompliance: categoryFromRun(row, 'pdf_ua_compliance') ?? categoryFromResult(result, 'pdf_ua_compliance'),
    linkQuality: categoryFromRun(row, 'link_quality') ?? categoryFromResult(result, 'link_quality'),
    headingStructure: categoryFromRun(row, 'heading_structure') ?? categoryFromResult(result, 'heading_structure'),
    readingOrder: categoryFromRun(row, 'reading_order') ?? categoryFromResult(result, 'reading_order'),
    tableMarkup: categoryFromRun(row, 'table_markup') ?? categoryFromResult(result, 'table_markup'),
    figureCount: figures.length,
    figureWithAltCount: figures.filter(figure => figure.hasAlt && (figure.altText?.trim() ?? '').length > 0).length,
    checkerVisibleFigureCount: summary.checkerVisibleFigureCount,
    checkerVisibleFigureWithAltCount: summary.checkerVisibleFigureWithAltCount,
    directSafeCheckerVisibleMissingAltCount: directSafe.length,
    safeRoleMapRetagTargetCount: summary.safeRoleMapRetagTargetCount,
    attemptedAltTargetRefs: summary.attemptedTargetRefs,
    nonFigureWithAltCount: risks?.nonFigureWithAltCount ?? 0,
    emptyNonFigureAltActualCount: risks?.emptyNonFigureAltActualCount ?? 0,
    nestedFigureAltCount: risks?.nestedFigureAltCount ?? 0,
    orphanedAltEmptyElementCount: risks?.orphanedAltEmptyElementCount ?? 0,
    orphanMcidCount: pdfUa?.orphanMcidCount ?? 0,
    suspectedPathPaintOutsideMc: pdfUa?.suspectedPathPaintOutsideMc ?? 0,
    taggedAnnotationRiskCount: pdfUa?.taggedAnnotationRiskCount ?? 0,
    imageOnlyPageCount: snapshot.imageOnlyPageCount,
  };
}

export function classifyStage179PartialAlt(input: {
  id: string;
  rowKind: RowKind | string;
  falsePositiveApplied: number;
  signals: Stage179Signals;
}): Pick<Stage179DiagnosticRow, 'partialAltClass' | 'implementable' | 'reason'> {
  if (input.rowKind === 'parked_control' || PARKED_IDS.has(input.id)) {
    return {
      partialAltClass: 'protected_or_analyzer_volatility',
      implementable: false,
      reason: 'parked protected/analyzer-volatility row; do not use for Stage 179 behavior',
    };
  }
  if (input.falsePositiveApplied > 0) {
    return {
      partialAltClass: 'no_safe_target',
      implementable: false,
      reason: 'reference row has false-positive-applied evidence',
    };
  }

  const s = input.signals;
  const altLow = (s.altText ?? 100) < 90;
  const stableCore =
    (s.headingStructure ?? 100) >= 80 &&
    (s.readingOrder ?? 100) >= 80 &&
    (s.tableMarkup ?? 100) >= 80 &&
    (s.linkQuality ?? 100) >= 80;

  if (!stableCore && altLow) {
    return {
      partialAltClass: 'mixed_table_or_heading_not_alt_first',
      implementable: false,
      reason: 'alt is low, but heading/reading-order/table/link debt makes this unsafe for a single partial-alt stage',
    };
  }
  if (altLow && stableCore && s.directSafeCheckerVisibleMissingAltCount > 0) {
    return {
      partialAltClass: 'hidden_checker_alt_target_candidate',
      implementable: true,
      reason: `direct checker-visible missing-alt target(s) remain: ${s.directSafeCheckerVisibleMissingAltCount}`,
    };
  }
  if (
    altLow &&
    stableCore &&
    s.figureCount === 0 &&
    s.checkerVisibleFigureCount === 0 &&
    s.emptyNonFigureAltActualCount > 0 &&
    s.emptyNonFigureAltActualCount === s.nonFigureWithAltCount
  ) {
    return {
      partialAltClass: 'orphan_figure_alt_ownership_candidate',
      implementable: true,
      reason: `empty non-Figure /Alt or /ActualText risk(s) can be stripped safely: ${s.emptyNonFigureAltActualCount}`,
    };
  }
  if (altLow && stableCore && s.figureCount > 0 && s.safeRoleMapRetagTargetCount > 0) {
    return {
      partialAltClass: 'orphan_figure_alt_ownership_candidate',
      implementable: true,
      reason: `safe role-map/ownership target(s) remain: ${s.safeRoleMapRetagTargetCount}`,
    };
  }
  if (altLow && stableCore && s.figureCount === 0 && s.suspectedPathPaintOutsideMc > 0 && s.nonFigureWithAltCount === 0) {
    return {
      partialAltClass: 'decorative_artifact_candidate',
      implementable: true,
      reason: `path-paint-only decorative candidate evidence exists: ${s.suspectedPathPaintOutsideMc}`,
    };
  }
  if (!altLow && (s.pdfUaCompliance ?? 100) < 80 && (s.orphanMcidCount > 0 || s.suspectedPathPaintOutsideMc > 0)) {
    return {
      partialAltClass: 'alt_pdfua_path_paint_candidate',
      implementable: true,
      reason: 'alt is stable but PDF/UA path-paint/orphan cleanup evidence remains',
    };
  }
  return {
    partialAltClass: 'no_safe_target',
    implementable: false,
    reason: altLow ? 'low/partial alt remains but no content-backed Stage 179 repair target was found' : 'no Stage 179 partial-alt target',
  };
}

async function loadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(parsed) ? parsed as RunRow[] : [];
  return new Map(rows.flatMap(row => {
    const keys = [row.id, row.publicationId].filter((value): value is string => typeof value === 'string' && value.length > 0);
    return keys.map(key => [key, row] as const);
  }));
}

async function existing(path: string): Promise<string | null> {
  try {
    await access(path);
    return path;
  } catch {
    return null;
  }
}

function rowKindFor(id: string): RowKind {
  if (PRIMARY_IDS.has(id)) return 'primary';
  if (SECONDARY_IDS.has(id)) return 'secondary_mixed';
  if (PARKED_IDS.has(id)) return 'parked_control';
  if (REGRESSION_IDS.has(id)) return 'regression_control';
  return 'hard_control';
}

async function artifactPdfFor(runDir: string, id: string): Promise<string | null> {
  return existing(join(runDir, 'pdfs', `${id}.pdf`));
}

async function analyzeRunRow(input: {
  id: string;
  row: RunRow;
  rowKind: RowKind;
  root: string;
  runDir: string;
}): Promise<Stage179DiagnosticRow> {
  const file = input.row.file ?? input.row.localFile;
  if (!file) throw new Error(`Run row ${input.id} is missing file`);
  const artifactPdf = await artifactPdfFor(input.runDir, input.id) ?? await artifactPdfFor(input.runDir, input.row.id ?? input.id);
  const sourcePdf = resolve(input.root, file);
  const pdfPath = artifactPdf ?? sourcePdf;
  const { result, snapshot } = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  const candidates = buildFigureCandidateDiagnostics(snapshot);
  const signals = buildSignals(result, input.row, snapshot, candidates);
  const falsePositiveApplied = Number(input.row.falsePositiveAppliedCount ?? input.row.falsePositiveApplied ?? 0);
  const classified = classifyStage179PartialAlt({
    id: input.id,
    rowKind: input.rowKind,
    falsePositiveApplied,
    signals,
  });
  return {
    id: input.id,
    rowKind: input.rowKind,
    file,
    analyzedPdf: pdfPath,
    analyzedFromArtifact: Boolean(artifactPdf),
    benchmarkScore: numberOrNull(input.row.afterScore),
    benchmarkGrade: typeof input.row.afterGrade === 'string' ? input.row.afterGrade : null,
    reanalyzedScore: numberOrNull(input.row.reanalyzedScore),
    reanalyzedGrade: typeof input.row.reanalyzedGrade === 'string' ? input.row.reanalyzedGrade : null,
    analyzedScore: result.score,
    analyzedGrade: result.grade,
    falsePositiveApplied,
    signals,
    figureCandidates: candidates,
    figureTools: summarizeFigureTools(input.row),
    ...classified,
  };
}

function buildReport(referenceRun: string, hardRun: string, rows: Stage179DiagnosticRow[]): Stage179DiagnosticReport {
  const classDistribution = rows.reduce<Record<Stage179PartialAltClass, number>>((acc, row) => {
    acc[row.partialAltClass] += 1;
    return acc;
  }, {
    hidden_checker_alt_target_candidate: 0,
    orphan_figure_alt_ownership_candidate: 0,
    decorative_artifact_candidate: 0,
    alt_pdfua_path_paint_candidate: 0,
    mixed_table_or_heading_not_alt_first: 0,
    protected_or_analyzer_volatility: 0,
    no_safe_target: 0,
  });
  const selectedRows = rows.filter(row => row.implementable && row.rowKind === 'primary').map(row => row.id).sort();
  const recommendedDirection = rows.some(row => row.partialAltClass === 'orphan_figure_alt_ownership_candidate' && row.signals.emptyNonFigureAltActualCount > 0)
    ? 'try_empty_nonfigure_alt_cleanup'
    : rows.some(row => row.partialAltClass === 'hidden_checker_alt_target_candidate')
      ? 'try_hidden_checker_alt_targeting'
      : rows.some(row => row.partialAltClass === 'decorative_artifact_candidate')
        ? 'try_decorative_artifact_cleanup'
        : rows.some(row => row.partialAltClass === 'alt_pdfua_path_paint_candidate')
          ? 'try_pdfua_path_paint_cleanup'
          : 'diagnostic_only_no_safe_rule';
  return {
    referenceRun,
    hardRun,
    rows,
    decision: { classDistribution, selectedRows, recommendedDirection },
  };
}

function renderMarkdown(report: Stage179DiagnosticReport): string {
  const lines = [
    '# Stage 179 Partial-Alt Ownership Diagnostic',
    '',
    `Reference run: \`${report.referenceRun}\``,
    `Hard-control run: \`${report.hardRun}\``,
    `Decision: \`${report.decision.recommendedDirection}\``,
    `Selected primary rows: ${report.decision.selectedRows.map(id => `\`${id}\``).join(', ') || 'none'}`,
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.decision.classDistribution).map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '| Row | Kind | Score | Reanalyzed | Analyzed | Artifact | Alt | PDF/UA | H | RO | Table | Figures | Checker alt | Direct safe | NonFigAlt | EmptyNonFig | Path | Orphan MCID | Class | Reason |',
    '| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    const s = row.signals;
    lines.push(`| ${row.id} | ${row.rowKind} | ${row.benchmarkScore ?? 'n/a'} ${row.benchmarkGrade ?? ''} | ${row.reanalyzedScore ?? 'n/a'} ${row.reanalyzedGrade ?? ''} | ${row.analyzedScore} ${row.analyzedGrade} | ${row.analyzedFromArtifact ? 'yes' : 'no'} | ${s.altText ?? 'n/a'} | ${s.pdfUaCompliance ?? 'n/a'} | ${s.headingStructure ?? 'n/a'} | ${s.readingOrder ?? 'n/a'} | ${s.tableMarkup ?? 'n/a'} | ${s.figureWithAltCount}/${s.figureCount} | ${s.checkerVisibleFigureWithAltCount}/${s.checkerVisibleFigureCount} | ${s.directSafeCheckerVisibleMissingAltCount} | ${s.nonFigureWithAltCount} | ${s.emptyNonFigureAltActualCount} | ${s.suspectedPathPaintOutsideMc} | ${s.orphanMcidCount} | ${row.partialAltClass} | ${row.reason} |`);
  }
  lines.push('', '## Selected Evidence', '');
  for (const row of report.rows.filter(item => item.implementable)) {
    const attempted = new Set(row.signals.attemptedAltTargetRefs);
    const direct = row.figureCandidates
      .filter(candidate => candidate.checkerVisible && candidate.reachable && candidate.directContent && !candidate.hasAlt && !attempted.has(candidate.structRef))
      .slice(0, 10)
      .map(candidate => `\`${candidate.structRef}\` p${candidate.page + 1}`);
    lines.push(`### ${row.id}`);
    lines.push(`- Analyzed PDF: \`${row.analyzedPdf}\`${row.analyzedFromArtifact ? '' : ' (source PDF; no final artifact was available)'}`);
    lines.push(`- Attempted alt refs: ${row.signals.attemptedAltTargetRefs.map(ref => `\`${ref}\``).join(', ') || 'none'}`);
    lines.push(`- Direct safe missing-alt refs: ${direct.join(', ') || 'none'}`);
    lines.push(`- Acrobat-style alt risks: nonFigure=${row.signals.nonFigureWithAltCount}, emptyNonFigure=${row.signals.emptyNonFigureAltActualCount}, nestedFigure=${row.signals.nestedFigureAltCount}, orphanedAltEmpty=${row.signals.orphanedAltEmptyElementCount}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let legacyRoot = DEFAULT_LEGACY_ROOT;
  let referenceRun = DEFAULT_REFERENCE_RUN;
  let hardRoot = DEFAULT_HARD_ROOT;
  let hardRun = DEFAULT_HARD_RUN;
  let outDir = DEFAULT_OUT;
  const requested = new Set<string>();
  const requestedHard = new Set<string>();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--legacy-root') legacyRoot = args[++i] ?? legacyRoot;
    else if (arg === '--reference-run') referenceRun = args[++i] ?? referenceRun;
    else if (arg === '--hard-root') hardRoot = args[++i] ?? hardRoot;
    else if (arg === '--hard-run') hardRun = args[++i] ?? hardRun;
    else if (arg === '--out') outDir = args[++i] ?? outDir;
    else if (arg === '--file') requested.add(args[++i] ?? '');
    else if (arg === '--hard-file') requestedHard.add(args[++i] ?? '');
    else if (arg === '--help') {
      console.log(usage());
      return;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  const ids = requested.size > 0
    ? requested
    : new Set([...PRIMARY_IDS, ...SECONDARY_IDS, ...PARKED_IDS, ...REGRESSION_IDS]);
  const hardIds = requestedHard.size > 0 ? requestedHard : HARD_CONTROL_PUBLICATION_IDS;
  const runRows = await loadRunRows(referenceRun);
  const hardRows = await loadRunRows(hardRun).catch(() => new Map<string, RunRow>());
  const rows: Stage179DiagnosticRow[] = [];

  for (const id of ids) {
    const row = runRows.get(id);
    if (!row) continue;
    rows.push(await analyzeRunRow({ id, row, rowKind: rowKindFor(id), root: legacyRoot, runDir: referenceRun }));
  }
  for (const id of hardIds) {
    const row = hardRows.get(id) ?? hardRows.get(`v1-${id}`);
    if (!row) continue;
    rows.push(await analyzeRunRow({ id: `v1-${id}`, row, rowKind: 'hard_control', root: hardRoot, runDir: hardRun }));
  }

  const report = buildReport(referenceRun, hardRun, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage179-partial-alt-ownership-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage179-partial-alt-ownership-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
