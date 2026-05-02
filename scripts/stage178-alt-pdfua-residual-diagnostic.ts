#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import {
  buildFigureCandidateDiagnostics,
  type FigureCandidateDiagnostic,
  summarizeFigureCandidates,
} from './stage50-figure-residual-diagnostic.js';

const DEFAULT_LEGACY_ROOT = 'Input/experiment-corpus';
const DEFAULT_REFERENCE_RUN = 'Output/experiment-corpus-baseline/run-stage177-full-2026-05-02-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage178-alt-pdfua-residual-diagnostic-2026-05-02-r1';

const PRIMARY_IDS = new Set([
  'figure-4702',
  'figure-4754',
  'structure-4131',
  'font-3437',
  'font-3448',
  'font-3529',
  'font-4156',
  'long-4700',
]);
const MIXED_IDS = new Set(['font-4057', 'long-4680']);
const PARKED_IDS = new Set(['long-4683', 'structure-4076', 'short-4214']);

export type Stage178AltPdfuaClass =
  | 'stable_checker_visible_alt_candidate'
  | 'stable_alt_ownership_repair_candidate'
  | 'alt_pdfua_orphan_cleanup_candidate'
  | 'mixed_alt_table_heading_candidate'
  | 'protected_or_analyzer_volatility'
  | 'no_safe_target';

type RowKind = 'primary' | 'mixed' | 'parked_control' | 'extra_control';

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

export interface Stage178Signals {
  altText: number | null;
  pdfUaCompliance: number | null;
  linkQuality: number | null;
  headingStructure: number | null;
  readingOrder: number | null;
  tableMarkup: number | null;
  checkerVisibleFigureCount: number;
  checkerVisibleFigureWithAltCount: number;
  directSafeCheckerVisibleMissingAltCount: number;
  safeRoleMapRetagTargetCount: number;
  attemptedAltTargetRefs: string[];
  terminalFigureToolCount: number;
  orphanMcidCount: number;
  suspectedPathPaintOutsideMc: number;
  taggedAnnotationRiskCount: number;
}

export interface Stage178DiagnosticRow {
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
  signals: Stage178Signals;
  figureCandidates: FigureCandidateDiagnostic[];
  figureTools: Array<{
    toolName: string;
    outcome: string;
    scoreBefore: number | null;
    scoreAfter: number | null;
    targetRef: string | null;
    note: string | null;
  }>;
  altPdfuaClass: Stage178AltPdfuaClass;
  implementable: boolean;
  reason: string;
}

export interface Stage178DiagnosticReport {
  referenceRun: string;
  rows: Stage178DiagnosticRow[];
  decision: {
    classDistribution: Record<Stage178AltPdfuaClass, number>;
    selectedRows: string[];
    recommendedDirection:
      | 'try_protected_weak_alt_continuation'
      | 'try_alt_ownership_repair'
      | 'try_pdfua_orphan_cleanup'
      | 'diagnostic_only_no_safe_rule';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage178-alt-pdfua-residual-diagnostic.ts [options]

Options:
  --legacy-root <path>      Original corpus root (default: ${DEFAULT_LEGACY_ROOT})
  --reference-run <dir>     Stage 177 or candidate run (default: ${DEFAULT_REFERENCE_RUN})
  --out <dir>               Output diagnostic directory (default: ${DEFAULT_OUT})
  --file <id>               Limit/add row id; repeatable
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

function summarizeFigureTools(row: RunRow | undefined): Stage178DiagnosticRow['figureTools'] {
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

function buildSignals(result: AnalysisResult, row: RunRow | undefined, snapshot: DocumentSnapshot, candidates: FigureCandidateDiagnostic[]): Stage178Signals {
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
  return {
    altText: categoryFromRun(row, 'alt_text') ?? categoryFromResult(result, 'alt_text'),
    pdfUaCompliance: categoryFromRun(row, 'pdf_ua_compliance') ?? categoryFromResult(result, 'pdf_ua_compliance'),
    linkQuality: categoryFromRun(row, 'link_quality') ?? categoryFromResult(result, 'link_quality'),
    headingStructure: categoryFromRun(row, 'heading_structure') ?? categoryFromResult(result, 'heading_structure'),
    readingOrder: categoryFromRun(row, 'reading_order') ?? categoryFromResult(result, 'reading_order'),
    tableMarkup: categoryFromRun(row, 'table_markup') ?? categoryFromResult(result, 'table_markup'),
    checkerVisibleFigureCount: summary.checkerVisibleFigureCount,
    checkerVisibleFigureWithAltCount: summary.checkerVisibleFigureWithAltCount,
    directSafeCheckerVisibleMissingAltCount: directSafe.length,
    safeRoleMapRetagTargetCount: summary.safeRoleMapRetagTargetCount,
    attemptedAltTargetRefs: summary.attemptedTargetRefs,
    terminalFigureToolCount: summary.terminalFigureToolCount,
    orphanMcidCount: pdfUa?.orphanMcidCount ?? 0,
    suspectedPathPaintOutsideMc: pdfUa?.suspectedPathPaintOutsideMc ?? 0,
    taggedAnnotationRiskCount: pdfUa?.taggedAnnotationRiskCount ?? 0,
  };
}

export function classifyStage178AltPdfua(input: {
  id: string;
  rowKind: RowKind | string;
  falsePositiveApplied: number;
  signals: Stage178Signals;
}): Pick<Stage178DiagnosticRow, 'altPdfuaClass' | 'implementable' | 'reason'> {
  if (input.rowKind === 'parked_control' || PARKED_IDS.has(input.id)) {
    return {
      altPdfuaClass: 'protected_or_analyzer_volatility',
      implementable: false,
      reason: 'parked protected/analyzer-volatility row; do not use for Stage 178 behavior',
    };
  }
  if (input.falsePositiveApplied > 0) {
    return {
      altPdfuaClass: 'no_safe_target',
      implementable: false,
      reason: 'reference row has false-positive-applied evidence',
    };
  }

  const s = input.signals;
  const altLow = (s.altText ?? 100) < 80;
  const pdfuaLow = (s.pdfUaCompliance ?? 100) < 80;
  const stableCore =
    (s.headingStructure ?? 100) >= 60 &&
    (s.readingOrder ?? 100) >= 80 &&
    (s.tableMarkup ?? 100) >= 80;
  const hasPdfUaCleanupEvidence =
    s.orphanMcidCount > 0 ||
    s.suspectedPathPaintOutsideMc > 0 ||
    s.taggedAnnotationRiskCount > 0;

  if (altLow && stableCore && s.directSafeCheckerVisibleMissingAltCount > 0) {
    return {
      altPdfuaClass: 'stable_checker_visible_alt_candidate',
      implementable: true,
      reason: `direct checker-visible missing-alt target(s) remain: ${s.directSafeCheckerVisibleMissingAltCount}`,
    };
  }
  if (altLow && stableCore && s.safeRoleMapRetagTargetCount > 0) {
    return {
      altPdfuaClass: 'stable_alt_ownership_repair_candidate',
      implementable: true,
      reason: `safe role-map alt ownership target(s) remain: ${s.safeRoleMapRetagTargetCount}`,
    };
  }
  if (!altLow && pdfuaLow && hasPdfUaCleanupEvidence && (s.linkQuality ?? 100) >= 80) {
    return {
      altPdfuaClass: 'alt_pdfua_orphan_cleanup_candidate',
      implementable: true,
      reason: 'PDF/UA residual has concrete orphan/path-paint cleanup evidence with alt already stable',
    };
  }
  if (altLow && ((s.headingStructure ?? 100) < 80 || (s.tableMarkup ?? 100) < 80 || pdfuaLow)) {
    return {
      altPdfuaClass: 'mixed_alt_table_heading_candidate',
      implementable: false,
      reason: 'alt is low, but the row is mixed with heading/table/PDF-UA debt; do not use for single-path Stage 178 behavior',
    };
  }
  return {
    altPdfuaClass: 'no_safe_target',
    implementable: false,
    reason: altLow ? 'low alt remains but no unattempted stable safe target was found' : 'no Stage 178 alt/PDF-UA target',
  };
}

async function loadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(parsed) ? parsed as RunRow[] : [];
  return new Map(rows.filter(row => row.id).map(row => [row.id!, row]));
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
  if (MIXED_IDS.has(id)) return 'mixed';
  if (PARKED_IDS.has(id)) return 'parked_control';
  return 'extra_control';
}

async function artifactPdfFor(runDir: string, id: string): Promise<string | null> {
  return existing(join(runDir, 'pdfs', `${id}.pdf`));
}

async function analyzeRow(id: string, row: RunRow, legacyRoot: string, referenceRun: string): Promise<Stage178DiagnosticRow> {
  if (!row.file) throw new Error(`Run row ${id} is missing file`);
  const artifactPdf = await artifactPdfFor(referenceRun, id);
  const sourcePdf = resolve(legacyRoot, row.file);
  const pdfPath = artifactPdf ?? sourcePdf;
  const { result, snapshot } = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  const candidates = buildFigureCandidateDiagnostics(snapshot);
  const signals = buildSignals(result, row, snapshot, candidates);
  const falsePositiveApplied = Number(row.falsePositiveAppliedCount ?? row.falsePositiveApplied ?? 0);
  const classified = classifyStage178AltPdfua({
    id,
    rowKind: rowKindFor(id),
    falsePositiveApplied,
    signals,
  });
  return {
    id,
    rowKind: rowKindFor(id),
    file: row.file,
    analyzedPdf: pdfPath,
    analyzedFromArtifact: Boolean(artifactPdf),
    benchmarkScore: numberOrNull(row.afterScore),
    benchmarkGrade: typeof row.afterGrade === 'string' ? row.afterGrade : null,
    reanalyzedScore: numberOrNull(row.reanalyzedScore),
    reanalyzedGrade: typeof row.reanalyzedGrade === 'string' ? row.reanalyzedGrade : null,
    analyzedScore: result.score,
    analyzedGrade: result.grade,
    falsePositiveApplied,
    signals,
    figureCandidates: candidates,
    figureTools: summarizeFigureTools(row),
    ...classified,
  };
}

function buildReport(referenceRun: string, rows: Stage178DiagnosticRow[]): Stage178DiagnosticReport {
  const classDistribution = rows.reduce<Record<Stage178AltPdfuaClass, number>>((acc, row) => {
    acc[row.altPdfuaClass] += 1;
    return acc;
  }, {
    stable_checker_visible_alt_candidate: 0,
    stable_alt_ownership_repair_candidate: 0,
    alt_pdfua_orphan_cleanup_candidate: 0,
    mixed_alt_table_heading_candidate: 0,
    protected_or_analyzer_volatility: 0,
    no_safe_target: 0,
  });
  const selectedRows = rows.filter(row => row.implementable).map(row => row.id).sort();
  const recommendedDirection = rows.some(row => row.altPdfuaClass === 'stable_checker_visible_alt_candidate')
    ? 'try_protected_weak_alt_continuation'
    : rows.some(row => row.altPdfuaClass === 'stable_alt_ownership_repair_candidate')
      ? 'try_alt_ownership_repair'
      : rows.some(row => row.altPdfuaClass === 'alt_pdfua_orphan_cleanup_candidate')
        ? 'try_pdfua_orphan_cleanup'
        : 'diagnostic_only_no_safe_rule';
  return {
    referenceRun,
    rows,
    decision: { classDistribution, selectedRows, recommendedDirection },
  };
}

function renderMarkdown(report: Stage178DiagnosticReport): string {
  const lines = [
    '# Stage 178 Alt/PDF-UA Residual Diagnostic',
    '',
    `Reference run: \`${report.referenceRun}\``,
    `Decision: \`${report.decision.recommendedDirection}\``,
    `Selected rows: ${report.decision.selectedRows.map(id => `\`${id}\``).join(', ') || 'none'}`,
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.decision.classDistribution).map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '| Row | Kind | Score | Reanalyzed | Analyzed | Artifact | Alt | PDF/UA | Link | H | RO | Table | Checker alt | Direct safe | Retag safe | PDF/UA evidence | Class | Reason |',
    '| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    const s = row.signals;
    lines.push(`| ${row.id} | ${row.rowKind} | ${row.benchmarkScore ?? 'n/a'} ${row.benchmarkGrade ?? ''} | ${row.reanalyzedScore ?? 'n/a'} ${row.reanalyzedGrade ?? ''} | ${row.analyzedScore} ${row.analyzedGrade} | ${row.analyzedFromArtifact ? 'yes' : 'no'} | ${s.altText ?? 'n/a'} | ${s.pdfUaCompliance ?? 'n/a'} | ${s.linkQuality ?? 'n/a'} | ${s.headingStructure ?? 'n/a'} | ${s.readingOrder ?? 'n/a'} | ${s.tableMarkup ?? 'n/a'} | ${s.checkerVisibleFigureWithAltCount}/${s.checkerVisibleFigureCount} | ${s.directSafeCheckerVisibleMissingAltCount} | ${s.safeRoleMapRetagTargetCount} | orphan=${s.orphanMcidCount}, path=${s.suspectedPathPaintOutsideMc}, annot=${s.taggedAnnotationRiskCount} | ${row.altPdfuaClass} | ${row.reason} |`);
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
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let legacyRoot = DEFAULT_LEGACY_ROOT;
  let referenceRun = DEFAULT_REFERENCE_RUN;
  let outDir = DEFAULT_OUT;
  const requested = new Set<string>();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--legacy-root') legacyRoot = args[++i] ?? legacyRoot;
    else if (arg === '--reference-run') referenceRun = args[++i] ?? referenceRun;
    else if (arg === '--out') outDir = args[++i] ?? outDir;
    else if (arg === '--file') requested.add(args[++i] ?? '');
    else if (arg === '--help') {
      console.log(usage());
      return;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  const ids = requested.size > 0
    ? requested
    : new Set([...PRIMARY_IDS, ...MIXED_IDS, ...PARKED_IDS]);
  const runRows = await loadRunRows(referenceRun);
  const rows: Stage178DiagnosticRow[] = [];
  for (const id of ids) {
    const row = runRows.get(id);
    if (!row) continue;
    rows.push(await analyzeRow(id, row, legacyRoot, referenceRun));
  }
  const report = buildReport(referenceRun, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage178-alt-pdfua-residual-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage178-alt-pdfua-residual-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
