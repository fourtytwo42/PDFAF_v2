#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_LEGACY_ROOT = 'Input/experiment-corpus';
const DEFAULT_LEGACY_RUN = 'Output/experiment-corpus-baseline/run-stage163-full-2026-04-30-r1';
const DEFAULT_ACTIVE_MANIFEST = 'Input/stage145-active-low-grade-tail/manifest.json';
const DEFAULT_ACTIVE_RUN = 'Output/stage145-low-grade-tail/run-stage162-active-tail-2026-04-30-r4';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage165-link-parenttree-diagnostic-2026-04-30-r1';

const LEGACY_PRIMARY_IDS = new Set(['fixture-inaccessible']);
const ACTIVE_PRIMARY_IDS = new Set(['orig-fixture-inaccessible', 'v1-v1-legacy-004-pdfaf-fixture-inaccessible']);
const PARKED_IDS = new Set(['short-4176', 'structure-4076', 'long-4683']);
const REQUIRED_CONTROL_IDS = new Set([
  'font-4156',
  'font-4172',
  'font-4699',
  'v1-v1-3468',
  'v1-v1-4766',
  'v1-v1-4761',
]);

type SourceKind = 'legacy_primary' | 'active_primary' | 'parked_control' | 'required_control';

export type Stage165LinkParentTreeClass =
  | 'safe_link_parenttree_repair_candidate'
  | 'link_contents_only_candidate'
  | 'annotation_order_only_candidate'
  | 'protected_or_analyzer_volatility'
  | 'visual_or_no_safe_link_target';

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
  afterDetectionProfile?: { annotationSignals?: Partial<Stage165AnnotationSignals> };
  reanalyzedDetectionProfile?: { annotationSignals?: Partial<Stage165AnnotationSignals> };
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

interface CleanupToolSummary {
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number | null;
  stage: number | null;
  round: number | null;
  source: string | null;
  note: string | null;
}

export interface Stage165AnnotationSignals {
  pagesMissingTabsS: number;
  pagesAnnotationOrderDiffers: number;
  linkAnnotationsMissingStructure: number;
  nonLinkAnnotationsMissingStructure: number;
  linkAnnotationsMissingStructParent: number;
  nonLinkAnnotationsMissingStructParent: number;
}

export interface Stage165Signals extends Stage165AnnotationSignals {
  pdfUaCompliance: number | null;
  linkQuality: number | null;
  headingStructure: number | null;
  readingOrder: number | null;
  altText: number | null;
  tableMarkup: number | null;
  linkCount: number;
  structureTreeDepth: number | null;
}

export interface Stage165DiagnosticRow {
  id: string;
  publicationId: string;
  title: string;
  sourceKind: SourceKind;
  file: string;
  benchmarkScore: number | null;
  benchmarkGrade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  analyzedScore: number | null;
  analyzedGrade: string | null;
  analyzedPdf: string | null;
  analyzedFromArtifact: boolean;
  falsePositiveApplied: number;
  signals: Stage165Signals;
  linkFindings: string[];
  pdfUaFindings: string[];
  linkTools: CleanupToolSummary[];
  linkParentTreeClass: Stage165LinkParentTreeClass;
  implementable: boolean;
  reason: string;
}

export interface Stage165DiagnosticReport {
  legacyRun: string;
  activeRun: string;
  activeManifest: string;
  rows: Stage165DiagnosticRow[];
  decision: {
    classDistribution: Record<Stage165LinkParentTreeClass, number>;
    selectedRows: string[];
    recommendedDirection:
      | 'implement_link_parenttree_repair'
      | 'investigate_link_contents_or_tabs'
      | 'diagnostic_only_no_safe_link_rule';
  };
}

const LINK_TOOLS = new Set([
  'repair_native_link_structure',
  'tag_unowned_annotations',
  'set_link_annotation_contents',
  'normalize_annotation_tab_order',
]);

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage165-link-parenttree-diagnostic.ts [options]

Options:
  --legacy-root <path>      Original corpus root (default: ${DEFAULT_LEGACY_ROOT})
  --legacy-run <dir>        Original-50 reference run (default: ${DEFAULT_LEGACY_RUN})
  --active-manifest <path>  Active-tail manifest (default: ${DEFAULT_ACTIVE_MANIFEST})
  --active-run <dir>        Active-tail reference run (default: ${DEFAULT_ACTIVE_RUN})
  --out <dir>               Output diagnostic directory (default: ${DEFAULT_OUT})
  --legacy-file <id>        Limit/add original-corpus row id; repeatable
  --active-file <id>        Limit/add active-tail publication id; repeatable
  --all-defaults            Use the default Stage 165 row set (default)
  --help                    Show this help`;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function categoryFromResult(result: AnalysisResult | null, key: string): number | null {
  return numberOrNull(result?.categories.find(category => category.key === key)?.score);
}

function categoryFromRun(row: RunRow | undefined, key: string): number | null {
  const categories = Array.isArray(row?.reanalyzedCategories) ? row?.reanalyzedCategories : row?.afterCategories;
  return numberOrNull(categories?.find(category => category.key === key)?.score);
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

function linkToolSummary(row: RunRow | undefined): CleanupToolSummary[] {
  return (row?.appliedTools ?? [])
    .filter(tool => tool.toolName && LINK_TOOLS.has(tool.toolName))
    .map(tool => ({
      toolName: tool.toolName ?? '',
      outcome: tool.outcome ?? 'unknown',
      scoreBefore: numberOrNull(tool.scoreBefore),
      scoreAfter: numberOrNull(tool.scoreAfter),
      delta: numberOrNull(tool.delta),
      stage: numberOrNull(tool.stage),
      round: numberOrNull(tool.round),
      source: typeof tool.source === 'string' ? tool.source : null,
      note: detailNote(tool.details),
    }));
}

function runAnnotationSignals(row: RunRow | undefined): Partial<Stage165AnnotationSignals> {
  return row?.reanalyzedDetectionProfile?.annotationSignals ?? row?.afterDetectionProfile?.annotationSignals ?? {};
}

function categoryForSignals(
  result: AnalysisResult | null,
  row: RunRow | undefined,
  key: string,
  preferAnalyzed: boolean,
): number | null {
  return preferAnalyzed
    ? categoryFromResult(result, key) ?? categoryFromRun(row, key)
    : categoryFromRun(row, key) ?? categoryFromResult(result, key);
}

function signalSummary(
  result: AnalysisResult | null,
  snapshot: DocumentSnapshot | null,
  row: RunRow | undefined,
  preferAnalyzed: boolean,
): Stage165Signals {
  const annotation = preferAnalyzed
    ? snapshot?.detectionProfile?.annotationSignals ?? snapshot?.annotationAccessibility ?? runAnnotationSignals(row)
    : runAnnotationSignals(row) ?? snapshot?.detectionProfile?.annotationSignals ?? snapshot?.annotationAccessibility;
  const reading = snapshot?.detectionProfile?.readingOrderSignals;
  return {
    pdfUaCompliance: categoryForSignals(result, row, 'pdf_ua_compliance', preferAnalyzed),
    linkQuality: categoryForSignals(result, row, 'link_quality', preferAnalyzed),
    headingStructure: categoryForSignals(result, row, 'heading_structure', preferAnalyzed),
    readingOrder: categoryForSignals(result, row, 'reading_order', preferAnalyzed),
    altText: categoryForSignals(result, row, 'alt_text', preferAnalyzed),
    tableMarkup: categoryForSignals(result, row, 'table_markup', preferAnalyzed),
    linkCount: snapshot?.links.length ?? 0,
    structureTreeDepth: numberOrNull(reading?.structureTreeDepth),
    pagesMissingTabsS: annotation?.pagesMissingTabsS ?? 0,
    pagesAnnotationOrderDiffers: annotation?.pagesAnnotationOrderDiffers ?? 0,
    linkAnnotationsMissingStructure: annotation?.linkAnnotationsMissingStructure ?? 0,
    nonLinkAnnotationsMissingStructure: annotation?.nonLinkAnnotationsMissingStructure ?? 0,
    linkAnnotationsMissingStructParent: annotation?.linkAnnotationsMissingStructParent ?? 0,
    nonLinkAnnotationsMissingStructParent: annotation?.nonLinkAnnotationsMissingStructParent ?? 0,
  };
}

function coreStable(signals: Stage165Signals): boolean {
  return (
    (signals.headingStructure ?? 0) >= 75 &&
    (signals.readingOrder ?? 0) >= 70 &&
    (signals.altText ?? 0) >= 70 &&
    (signals.tableMarkup ?? 100) >= 80
  );
}

export function classifyStage165LinkParentTree(input: {
  id: string;
  publicationId: string;
  sourceKind: SourceKind;
  falsePositiveApplied: number;
  signals: Stage165Signals;
}): Pick<Stage165DiagnosticRow, 'linkParentTreeClass' | 'implementable' | 'reason'> {
  if (PARKED_IDS.has(input.id) || PARKED_IDS.has(input.publicationId)) {
    return {
      linkParentTreeClass: 'protected_or_analyzer_volatility',
      implementable: false,
      reason: 'parked protected/analyzer-volatility control row',
    };
  }
  if (input.falsePositiveApplied > 0) {
    return {
      linkParentTreeClass: 'visual_or_no_safe_link_target',
      implementable: false,
      reason: 'reference run already has false-positive-applied evidence',
    };
  }

  const linkOwnershipDebt = input.signals.linkAnnotationsMissingStructure + input.signals.linkAnnotationsMissingStructParent;
  const nonLinkOwnershipDebt = input.signals.nonLinkAnnotationsMissingStructure + input.signals.nonLinkAnnotationsMissingStructParent;
  const linkLimited = (input.signals.linkQuality ?? 100) < 80 || (input.signals.pdfUaCompliance ?? 100) < 90;

  if (linkOwnershipDebt > 0 && linkOwnershipDebt <= 24 && linkLimited && coreStable(input.signals)) {
    const isPrimary = input.sourceKind === 'legacy_primary' || input.sourceKind === 'active_primary';
    return {
      linkParentTreeClass: 'safe_link_parenttree_repair_candidate',
      implementable: isPrimary,
      reason: `${linkOwnershipDebt} link annotation ParentTree/StructParent ownership issue(s) on a stable near-pass row`,
    };
  }
  if (input.signals.pagesMissingTabsS > 0 || input.signals.pagesAnnotationOrderDiffers > 0) {
    return {
      linkParentTreeClass: 'annotation_order_only_candidate',
      implementable: false,
      reason: 'annotation order or /Tabs evidence is present without a safe link ParentTree ownership target',
    };
  }
  if (linkLimited && linkOwnershipDebt === 0 && nonLinkOwnershipDebt === 0) {
    return {
      linkParentTreeClass: 'link_contents_only_candidate',
      implementable: false,
      reason: 'link/PDF-UA is limited but link annotation ownership is already present',
    };
  }
  return {
    linkParentTreeClass: 'visual_or_no_safe_link_target',
    implementable: false,
    reason: coreStable(input.signals)
      ? 'no bounded link ParentTree ownership target remains'
      : 'core structural categories are lower-priority blockers than link ownership',
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function artifactPdfFor(runDir: string, id: string, publicationId: string): Promise<string | null> {
  const candidates = [
    join(runDir, 'pdfs', `${id}.pdf`),
    join(runDir, 'pdfs', `${publicationId}.pdf`),
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  try {
    const files = await readdir(runDir);
    const found = files.find(file =>
      file.endsWith('.remediated.pdf') &&
      (file.startsWith(`${publicationId}-`) || file.startsWith(`${id}-`))
    );
    return found ? join(runDir, found) : null;
  } catch {
    return null;
  }
}

async function analyzeSource(row: SourceRow): Promise<{ result: AnalysisResult | null; snapshot: DocumentSnapshot | null; pdf: string | null; artifact: boolean }> {
  const artifact = await artifactPdfFor(row.runDir, row.id, row.publicationId);
  const pdfPath = artifact ?? row.sourcePath;
  if (!(await fileExists(pdfPath))) {
    return { result: null, snapshot: null, pdf: null, artifact: false };
  }
  const { result, snapshot } = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  return { result, snapshot, pdf: pdfPath, artifact: Boolean(artifact) };
}

async function buildLegacyRows(root: string, runDir: string, ids: Set<string>, rowsById: Map<string, RunRow>): Promise<SourceRow[]> {
  const out: SourceRow[] = [];
  for (const id of ids) {
    const row = rowsById.get(id);
    if (!row?.file) continue;
    const sourceKind: SourceKind = LEGACY_PRIMARY_IDS.has(id)
      ? 'legacy_primary'
      : PARKED_IDS.has(id)
        ? 'parked_control'
        : 'required_control';
    out.push({
      id,
      publicationId: id,
      title: id,
      file: row.file,
      sourcePath: join(root, row.file),
      sourceKind,
      runDir,
      runRow: row,
    });
  }
  return out;
}

function activeSourceKind(publicationId: string): SourceKind {
  if (ACTIVE_PRIMARY_IDS.has(publicationId)) return 'active_primary';
  if (PARKED_IDS.has(publicationId) || [...PARKED_IDS].some(id => publicationId.includes(id))) return 'parked_control';
  return 'required_control';
}

async function buildActiveRows(manifestPath: string, runDir: string, ids: Set<string>, rowsById: Map<string, RunRow>): Promise<SourceRow[]> {
  const manifest = await loadEdgeMixManifest(manifestPath);
  return manifest
    .filter((row: EdgeMixManifestRow) => ids.has(row.publicationId) || ids.has(row.id))
    .map((row: EdgeMixManifestRow) => ({
      id: row.id,
      publicationId: row.publicationId,
      title: row.title,
      file: row.localFile,
      sourcePath: row.absolutePath,
      sourceKind: activeSourceKind(row.publicationId),
      runDir,
      runRow: rowsById.get(row.publicationId) ?? rowsById.get(row.id),
    }));
}

async function analyzeRow(row: SourceRow): Promise<Stage165DiagnosticRow> {
  const analyzed = await analyzeSource(row);
  const runRow = row.runRow;
  const signals = signalSummary(analyzed.result, analyzed.snapshot, runRow, analyzed.artifact);
  const falsePositiveApplied = Number(runRow?.falsePositiveAppliedCount ?? runRow?.falsePositiveApplied ?? 0);
  const classified = classifyStage165LinkParentTree({
    id: row.id,
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
    benchmarkScore: numberOrNull(runRow?.afterScore),
    benchmarkGrade: typeof runRow?.afterGrade === 'string' ? runRow.afterGrade : null,
    reanalyzedScore: numberOrNull(runRow?.reanalyzedScore),
    reanalyzedGrade: typeof runRow?.reanalyzedGrade === 'string' ? runRow.reanalyzedGrade : null,
    analyzedScore: numberOrNull(analyzed.result?.score),
    analyzedGrade: typeof analyzed.result?.grade === 'string' ? analyzed.result.grade : null,
    analyzedPdf: analyzed.pdf,
    analyzedFromArtifact: analyzed.artifact,
    falsePositiveApplied,
    signals,
    linkFindings: analyzed.result?.findings.filter(finding => finding.category === 'link_quality').map(finding => finding.message) ?? [],
    pdfUaFindings: analyzed.result?.findings.filter(finding => finding.category === 'pdf_ua_compliance').map(finding => finding.message) ?? [],
    linkTools: linkToolSummary(runRow),
    ...classified,
  };
}

function buildReport(
  legacyRun: string,
  activeRun: string,
  activeManifest: string,
  rows: Stage165DiagnosticRow[],
): Stage165DiagnosticReport {
  const classDistribution = rows.reduce<Record<Stage165LinkParentTreeClass, number>>((acc, row) => {
    acc[row.linkParentTreeClass] += 1;
    return acc;
  }, {
    safe_link_parenttree_repair_candidate: 0,
    link_contents_only_candidate: 0,
    annotation_order_only_candidate: 0,
    protected_or_analyzer_volatility: 0,
    visual_or_no_safe_link_target: 0,
  });
  const selectedRows = rows.filter(row => row.implementable).map(row => row.publicationId).sort();
  const linkContentsOrTabs = rows.some(row =>
    row.linkParentTreeClass === 'link_contents_only_candidate' ||
    row.linkParentTreeClass === 'annotation_order_only_candidate'
  );
  return {
    legacyRun,
    activeRun,
    activeManifest,
    rows,
    decision: {
      classDistribution,
      selectedRows,
      recommendedDirection: selectedRows.length > 0
        ? 'implement_link_parenttree_repair'
        : linkContentsOrTabs
          ? 'investigate_link_contents_or_tabs'
          : 'diagnostic_only_no_safe_link_rule',
    },
  };
}

function renderMarkdown(report: Stage165DiagnosticReport): string {
  const lines = [
    '# Stage 165 Link Annotation ParentTree Diagnostic',
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
    '| Row | Kind | Run score | Analyzed | Link | PDF/UA | H | RO | Alt | Table | Link debt | Missing SP | Tabs/order | Link tools | Class | Reason |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
    ...report.rows.map(row => {
      const s = row.signals;
      const linkTools = row.linkTools.length
        ? `${row.linkTools.filter(tool => tool.outcome === 'applied').length}/${row.linkTools.length}`
        : '0/0';
      return `| ${row.publicationId} | ${row.sourceKind} | ${row.reanalyzedScore ?? row.benchmarkScore ?? 'n/a'} | ${row.analyzedScore ?? 'n/a'} | ${s.linkQuality ?? 'n/a'} | ${s.pdfUaCompliance ?? 'n/a'} | ${s.headingStructure ?? 'n/a'} | ${s.readingOrder ?? 'n/a'} | ${s.altText ?? 'n/a'} | ${s.tableMarkup ?? 'n/a'} | ${s.linkAnnotationsMissingStructure} | ${s.linkAnnotationsMissingStructParent} | ${s.pagesMissingTabsS}/${s.pagesAnnotationOrderDiffers} | ${linkTools} | ${row.linkParentTreeClass} | ${row.reason} |`;
    }),
    '',
    '## Link/PDF-UA Findings',
    '',
    ...report.rows.flatMap(row => [
      `### ${row.publicationId}`,
      '',
      `Analyzed PDF: ${row.analyzedPdf ? `\`${row.analyzedPdf}\`` : 'not available'}${row.analyzedFromArtifact ? ' (artifact)' : ''}`,
      '',
      `Link findings: ${row.linkFindings.length ? row.linkFindings.join('; ') : 'none'}`,
      '',
      `PDF/UA findings: ${row.pdfUaFindings.length ? row.pdfUaFindings.join('; ') : 'none'}`,
      '',
      `Link tools: ${row.linkTools.length ? row.linkTools.map(tool => `${tool.toolName}:${tool.outcome}${tool.note ? `(${tool.note})` : ''}`).join('; ') : 'none'}`,
      '',
    ]),
  ];
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv: string[]): {
  legacyRoot: string;
  legacyRun: string;
  activeManifest: string;
  activeRun: string;
  out: string;
  legacyIds: Set<string>;
  activeIds: Set<string>;
} {
  const args = {
    legacyRoot: DEFAULT_LEGACY_ROOT,
    legacyRun: DEFAULT_LEGACY_RUN,
    activeManifest: DEFAULT_ACTIVE_MANIFEST,
    activeRun: DEFAULT_ACTIVE_RUN,
    out: DEFAULT_OUT,
    legacyIds: new Set<string>(),
    activeIds: new Set<string>(),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    if (arg === '--legacy-root') args.legacyRoot = next();
    else if (arg === '--legacy-run') args.legacyRun = next();
    else if (arg === '--active-manifest') args.activeManifest = next();
    else if (arg === '--active-run') args.activeRun = next();
    else if (arg === '--out') args.out = next();
    else if (arg === '--legacy-file') args.legacyIds.add(next());
    else if (arg === '--active-file') args.activeIds.add(next());
    else if (arg === '--all-defaults') {
      // Defaults are applied below.
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  if (args.legacyIds.size === 0 && args.activeIds.size === 0) {
    for (const id of [...LEGACY_PRIMARY_IDS, ...PARKED_IDS, 'font-4156', 'font-4172', 'font-4699']) {
      args.legacyIds.add(id);
    }
    for (const id of [...ACTIVE_PRIMARY_IDS, 'v1-v1-3468', 'v1-v1-4766', 'v1-v1-4761']) {
      args.activeIds.add(id);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const legacyRunRows = await loadRunRows(args.legacyRun);
  const activeRunRows = await loadRunRows(args.activeRun);
  const legacyRows = await buildLegacyRows(args.legacyRoot, args.legacyRun, args.legacyIds, legacyRunRows);
  const activeRows = await buildActiveRows(args.activeManifest, args.activeRun, args.activeIds, activeRunRows);
  const rows: Stage165DiagnosticRow[] = [];
  for (const row of [...legacyRows, ...activeRows]) {
    rows.push(await analyzeRow(row));
  }
  const report = buildReport(args.legacyRun, args.activeRun, args.activeManifest, rows);
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'stage165-link-parenttree-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.out, 'stage165-link-parenttree-diagnostic.md'), renderMarkdown(report));
  console.log(`Wrote ${join(args.out, 'stage165-link-parenttree-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
