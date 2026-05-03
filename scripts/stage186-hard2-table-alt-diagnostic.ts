#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage186Hard2TableAlt,
  collectStage186TargetRefs,
  stage186AltTargets,
  stage186TableTargets,
  type Stage186Decision,
} from '../src/services/remediation/stage186Hard2TableAlt.js';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_hard_2/manifest.json';
const DEFAULT_RUN = 'Output/from_sibling_pdfaf_v1_hard_2/run-stage184-hard2-full-2026-05-03-r1';
const DEFAULT_LEGACY_RUN = 'Output/experiment-corpus-baseline/run-stage183-full-2026-05-03-r1';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_hard_2/stage186-hard2-table-alt-diagnostic-2026-05-03-r1';

const HARD_DEFAULT_IDS = new Set([
  'v1-4105',
  '4105',
  'v1-3510',
  '3510',
  'v1-4705',
  '4705',
  'v1-3508',
  '3508',
]);
const LEGACY_DEFAULT_IDS = new Set([
  'figure-4754',
  'font-4057',
  'font-4172',
  'fixture-inaccessible',
  'font-4156',
  'font-4699',
]);

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
  localFile?: string | null;
  afterScore?: number;
  afterGrade?: string;
  reanalyzedScore?: number | null;
  reanalyzedGrade?: string | null;
  afterCategories?: RunCategory[];
  reanalyzedCategories?: RunCategory[] | null;
  falsePositiveApplied?: number;
  falsePositiveAppliedCount?: number;
  appliedTools?: RunTool[];
}

interface ToolSummary {
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number | null;
  targetRefs: string[];
  tableBefore: number | null;
  tableAfter: number | null;
  altBefore: number | null;
  altAfter: number | null;
  pdfuaBefore: number | null;
  pdfuaAfter: number | null;
  note: string | null;
  source: string | null;
  stage: number | null;
  round: number | null;
}

interface Stage186Signals {
  tableCount: number;
  tablesWithHeaders: number;
  tableTargets: ReturnType<typeof stage186TableTargets>;
  stronglyIrregularTableCount: number;
  irregularTableCount: number;
  directCellUnderTableCount: number;
  misplacedCellCount: number;
  rowlessDenseTableCount: number;
  checkerVisibleFigureCount: number;
  checkerVisibleFigureAltCount: number;
  altTargets: ReturnType<typeof stage186AltTargets>;
  orphanMcidCount: number;
  suspectedPathPaintOutsideMc: number;
  annotationRiskCount: number;
  attemptedTableRefs: string[];
  attemptedAltRefs: string[];
}

interface Stage186Row {
  id: string;
  publicationId: string;
  title: string;
  sourceKind: 'hard' | 'legacy';
  file: string;
  analyzedPdf: string | null;
  benchmarkScore: number | null;
  benchmarkGrade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  analysisScore: number | null;
  analysisGrade: string | null;
  categories: Partial<Record<CategoryKey, number | null>>;
  signals: Stage186Signals | null;
  classification: Stage186Decision;
  relevantTools: ToolSummary[];
}

interface Stage186Report {
  generatedAt: string;
  manifest: string;
  run: string;
  legacyRun: string;
  rows: Stage186Row[];
  decision: {
    classDistribution: Record<Stage186Decision['classification'], number>;
    selectedRows: string[];
    recommendedDirection:
      | 'probe_explicit_table_continuation'
      | 'probe_rolemap_alt_after_table_no_gain'
      | 'probe_ordered_table_alt_pdfua_transaction'
      | 'diagnostic_only_no_safe_rule';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage186-hard2-table-alt-diagnostic.ts [options]

Options:
  --manifest <path>     Hard holdout 2 manifest (default: ${DEFAULT_MANIFEST})
  --run <dir>           Hard holdout 2 run with PDFs (default: ${DEFAULT_RUN})
  --legacy-run <dir>    Original-50 control run (default: ${DEFAULT_LEGACY_RUN})
  --out <dir>           Output directory (default: ${DEFAULT_OUT})
  --file <id>           Limit/add id or publication id; repeatable
  --help                Show this help`;
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

function categoryScore(categories: RunCategory[] | null | undefined, key: CategoryKey): number | null {
  const row = categories?.find(category => category.key === key);
  if (!row || row.applicable === false) return null;
  return numberOrNull(row.score);
}

function analysisCategoryScore(analysis: AnalysisResult | null, key: CategoryKey): number | null {
  const row = analysis?.categories.find(category => category.key === key);
  if (!row || row.applicable === false) return null;
  return numberOrNull(row.score);
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nested(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function replayCategory(details: unknown, suffix: 'Before' | 'After', key: CategoryKey): number | null {
  const parsed = parseRecord(details);
  const scores = nested(nested(nested(parsed, 'debug'), 'replayState'), `categoryScores${suffix}`);
  return numberOrNull(scores?.[key]);
}

function noteFromDetails(details: unknown): string | null {
  const parsed = parseRecord(details);
  const note = parsed?.note ?? parsed?.raw;
  return typeof note === 'string' ? note : null;
}

function relevantTools(row: RunRow | undefined): ToolSummary[] {
  const toolNames = new Set([
    'normalize_table_structure',
    'set_table_header_cells',
    'repair_native_table_headers',
    'set_figure_alt_text',
    'retag_as_figure',
    'canonicalize_figure_alt_ownership',
    'repair_alt_text_structure',
    'remap_orphan_mcids_as_artifacts',
    'repair_native_link_structure',
    'normalize_heading_hierarchy',
  ]);
  return (row?.appliedTools ?? [])
    .filter(tool => tool.toolName && toolNames.has(tool.toolName))
    .map(tool => ({
      toolName: tool.toolName!,
      outcome: typeof tool.outcome === 'string' ? tool.outcome : 'unknown',
      scoreBefore: numberOrNull(tool.scoreBefore),
      scoreAfter: numberOrNull(tool.scoreAfter),
      delta: numberOrNull(tool.delta),
      targetRefs: [...collectStage186TargetRefs(tool.details)].sort(),
      tableBefore: replayCategory(tool.details, 'Before', 'table_markup'),
      tableAfter: replayCategory(tool.details, 'After', 'table_markup'),
      altBefore: replayCategory(tool.details, 'Before', 'alt_text'),
      altAfter: replayCategory(tool.details, 'After', 'alt_text'),
      pdfuaBefore: replayCategory(tool.details, 'Before', 'pdf_ua_compliance'),
      pdfuaAfter: replayCategory(tool.details, 'After', 'pdf_ua_compliance'),
      note: noteFromDetails(tool.details),
      source: typeof tool.source === 'string' ? tool.source : null,
      stage: numberOrNull(tool.stage),
      round: numberOrNull(tool.round),
    }));
}

function annotationRiskCount(snapshot: DocumentSnapshot): number {
  const annotation = snapshot.annotationAccessibility;
  const detection = snapshot.detectionProfile?.annotationSignals;
  return (
    (annotation?.pagesAnnotationOrderDiffers ?? detection?.pagesAnnotationOrderDiffers ?? 0) +
    (annotation?.linkAnnotationsMissingStructure ?? detection?.linkAnnotationsMissingStructure ?? 0) +
    (annotation?.linkAnnotationsMissingStructParent ?? detection?.linkAnnotationsMissingStructParent ?? 0) +
    (annotation?.nonLinkAnnotationsMissingStructure ?? detection?.nonLinkAnnotationsMissingStructure ?? 0) +
    (annotation?.nonLinkAnnotationsMissingStructParent ?? detection?.nonLinkAnnotationsMissingStructParent ?? 0)
  );
}

function attemptedRefs(
  tools: readonly AppliedRemediationTool[],
  names: ReadonlySet<string>,
): string[] {
  const refs = new Set<string>();
  for (const tool of tools) {
    if (!names.has(tool.toolName)) continue;
    for (const ref of collectStage186TargetRefs(tool.details)) refs.add(ref);
  }
  return [...refs].sort();
}

function buildSignals(snapshot: DocumentSnapshot, appliedTools: readonly AppliedRemediationTool[]): Stage186Signals {
  const scoredTables = snapshot.tables.filter(table =>
    !((table.rowCount ?? 0) <= 1 && (table.totalCells ?? 0) <= 2 && (table.cellsMisplacedCount ?? 0) === 0)
  );
  const checkerTargets = snapshot.checkerFigureTargets ?? [];
  return {
    tableCount: scoredTables.length,
    tablesWithHeaders: scoredTables.filter(table => table.hasHeaders).length,
    tableTargets: stage186TableTargets(snapshot, appliedTools),
    stronglyIrregularTableCount: snapshot.detectionProfile?.tableSignals.stronglyIrregularTableCount ?? 0,
    irregularTableCount: snapshot.detectionProfile?.tableSignals.irregularTableCount ?? 0,
    directCellUnderTableCount: snapshot.detectionProfile?.tableSignals.directCellUnderTableCount ?? 0,
    misplacedCellCount: snapshot.detectionProfile?.tableSignals.misplacedCellCount ?? 0,
    rowlessDenseTableCount: scoredTables.filter(table => (table.rowCount ?? 0) <= 1 && (table.totalCells ?? 0) >= 4).length,
    checkerVisibleFigureCount: checkerTargets.length,
    checkerVisibleFigureAltCount: checkerTargets.filter(target => target.hasAlt).length,
    altTargets: stage186AltTargets(snapshot, appliedTools),
    orphanMcidCount:
      snapshot.taggedContentAudit?.orphanMcidCount ??
      snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ??
      snapshot.orphanMcids?.length ??
      0,
    suspectedPathPaintOutsideMc:
      snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ??
      snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ??
      0,
    annotationRiskCount: annotationRiskCount(snapshot),
    attemptedTableRefs: attemptedRefs(appliedTools, new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells'])),
    attemptedAltRefs: attemptedRefs(appliedTools, new Set(['set_figure_alt_text', 'retag_as_figure'])),
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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

async function findRemediatedPdf(runDir: string, id: string, publicationId: string): Promise<string | null> {
  const files = await readdir(runDir).catch(() => []);
  const found = files.find(name =>
    name.endsWith('.remediated.pdf') &&
    (name.startsWith(`${publicationId}-`) || name.startsWith(`${id}-`) || name.includes(id))
  );
  return found ? join(runDir, found) : null;
}

function categoriesFor(row: RunRow | undefined, analysis: AnalysisResult | null): Partial<Record<CategoryKey, number | null>> {
  const source = row?.reanalyzedCategories ?? row?.afterCategories;
  const out: Partial<Record<CategoryKey, number | null>> = {};
  for (const key of ['heading_structure', 'reading_order', 'alt_text', 'table_markup', 'pdf_ua_compliance', 'link_quality'] as const) {
    out[key] = categoryScore(source, key) ?? analysisCategoryScore(analysis, key);
  }
  return out;
}

async function analyzeStage186Row(input: {
  id: string;
  publicationId: string;
  title: string;
  file: string;
  sourceKind: 'hard' | 'legacy';
  runDir: string;
  runRow?: RunRow;
}): Promise<Stage186Row> {
  const artifact = await findRemediatedPdf(input.runDir, input.id, input.publicationId);
  const analyzed = artifact && await exists(artifact)
    ? await analyzePdf(artifact, basename(artifact), { bypassCache: true })
    : null;
  const appliedTools = (input.runRow?.appliedTools ?? []) as unknown as AppliedRemediationTool[];
  const signals = analyzed ? buildSignals(analyzed.snapshot, appliedTools) : null;
  const categories = categoriesFor(input.runRow, analyzed?.result ?? null);
  const classification = analyzed
    ? classifyStage186Hard2TableAlt({
      analysis: analyzed.result,
      snapshot: analyzed.snapshot,
      appliedTools,
      falsePositiveApplied: Number(input.runRow?.falsePositiveAppliedCount ?? input.runRow?.falsePositiveApplied ?? 0),
    })
    : classifyStage186Hard2TableAlt({
      analysis: {
        score: numberOrNull(input.runRow?.reanalyzedScore) ?? numberOrNull(input.runRow?.afterScore) ?? 0,
        grade: 'F',
        pdfClass: 'native_tagged',
        categories: Object.entries(categories).map(([key, score]) => ({
          key: key as CategoryKey,
          score: score ?? 0,
          applicable: true,
        })),
        issues: [],
        suggestions: [],
        scoreCapsApplied: [],
      } as AnalysisResult,
      snapshot: { pdfClass: 'native_tagged', isTagged: false, structureTree: null, tables: [], figures: [] } as unknown as DocumentSnapshot,
      appliedTools,
    });
  return {
    id: input.id,
    publicationId: input.publicationId,
    title: input.title,
    sourceKind: input.sourceKind,
    file: input.file,
    analyzedPdf: artifact,
    benchmarkScore: numberOrNull(input.runRow?.afterScore),
    benchmarkGrade: typeof input.runRow?.afterGrade === 'string' ? input.runRow.afterGrade : null,
    reanalyzedScore: numberOrNull(input.runRow?.reanalyzedScore),
    reanalyzedGrade: typeof input.runRow?.reanalyzedGrade === 'string' ? input.runRow.reanalyzedGrade : null,
    analysisScore: analyzed?.result.score ?? null,
    analysisGrade: analyzed?.result.grade ?? null,
    categories,
    signals,
    classification,
    relevantTools: relevantTools(input.runRow),
  };
}

function buildReport(input: {
  manifest: string;
  run: string;
  legacyRun: string;
  rows: Stage186Row[];
}): Stage186Report {
  const classDistribution = input.rows.reduce<Record<Stage186Decision['classification'], number>>((acc, row) => {
    acc[row.classification.classification] += 1;
    return acc;
  }, {
    safe_table_continuation_candidate: 0,
    table_ref_no_category_gain: 0,
    rolemap_alt_after_table_candidate: 0,
    alt_first_candidate: 0,
    ordered_table_alt_pdfua_transaction_candidate: 0,
    analyzer_table_score_debt: 0,
    no_safe_path: 0,
  });
  const selectedRows = input.rows
    .filter(row => row.classification.shouldAttemptTable || row.classification.shouldAttemptAlt)
    .map(row => row.id);
  const recommendedDirection = input.rows.some(row => row.classification.classification === 'safe_table_continuation_candidate')
    ? 'probe_explicit_table_continuation'
    : input.rows.some(row =>
      row.classification.classification === 'rolemap_alt_after_table_candidate' ||
      row.classification.classification === 'alt_first_candidate'
    )
      ? 'probe_rolemap_alt_after_table_no_gain'
      : input.rows.some(row => row.classification.classification === 'ordered_table_alt_pdfua_transaction_candidate')
        ? 'probe_ordered_table_alt_pdfua_transaction'
        : 'diagnostic_only_no_safe_rule';
  return {
    generatedAt: new Date().toISOString(),
    manifest: resolve(input.manifest),
    run: resolve(input.run),
    legacyRun: resolve(input.legacyRun),
    rows: input.rows,
    decision: {
      classDistribution,
      selectedRows,
      recommendedDirection,
    },
  };
}

function renderMarkdown(report: Stage186Report): string {
  const lines = [
    '# Stage 186 Hard-Holdout-2 Table/Alt Diagnostic',
    '',
    `Generated: ${report.generatedAt}`,
    `Run: \`${report.run}\``,
    `Legacy run: \`${report.legacyRun}\``,
    `Decision: \`${report.decision.recommendedDirection}\``,
    '',
    '## Class Distribution',
    '',
    ...Object.entries(report.decision.classDistribution).map(([key, value]) => `- \`${key}\`: ${value}`),
    '',
    '## Rows',
    '',
  ];
  for (const row of report.rows) {
    const s = row.signals;
    const tableTargets = s?.tableTargets.map(target => `${target.structRef}@p${target.page + 1}:ir${target.irregularRows}/c${target.dominantColumnCount}`).join(', ') || 'none';
    const altTargets = s?.altTargets.map(target => `${target.toolName}:${target.structRef}@p${target.page + 1}`).join(', ') || 'none';
    lines.push(
      `### ${row.id} (${row.publicationId})`,
      '',
      `- Score: benchmark ${row.benchmarkScore ?? 'n/a'}/${row.benchmarkGrade ?? 'n/a'}, reanalyzed ${row.reanalyzedScore ?? 'n/a'}/${row.reanalyzedGrade ?? 'n/a'}, analysis ${row.analysisScore ?? 'n/a'}/${row.analysisGrade ?? 'n/a'}`,
      `- Categories: heading=${row.categories.heading_structure ?? 'n/a'}, reading=${row.categories.reading_order ?? 'n/a'}, alt=${row.categories.alt_text ?? 'n/a'}, table=${row.categories.table_markup ?? 'n/a'}, pdfua=${row.categories.pdf_ua_compliance ?? 'n/a'}, link=${row.categories.link_quality ?? 'n/a'}`,
      `- Classification: \`${row.classification.classification}\` - ${row.classification.reason}`,
      `- Table signals: tables=${s?.tablesWithHeaders ?? 'n/a'}/${s?.tableCount ?? 'n/a'} with headers, stronglyIrregular=${s?.stronglyIrregularTableCount ?? 'n/a'}, irregular=${s?.irregularTableCount ?? 'n/a'}, directCells=${s?.directCellUnderTableCount ?? 'n/a'}, misplaced=${s?.misplacedCellCount ?? 'n/a'}, rowlessDense=${s?.rowlessDenseTableCount ?? 'n/a'}, targets=${tableTargets}`,
      `- Alt/PDF-UA signals: checkerFigures=${s?.checkerVisibleFigureAltCount ?? 'n/a'}/${s?.checkerVisibleFigureCount ?? 'n/a'}, altTargets=${altTargets}, orphanMcids=${s?.orphanMcidCount ?? 'n/a'}, pathPaint=${s?.suspectedPathPaintOutsideMc ?? 'n/a'}, annotationRisk=${s?.annotationRiskCount ?? 'n/a'}`,
      `- Attempted refs: tables=${s?.attemptedTableRefs.join(', ') || 'none'}, alt=${s?.attemptedAltRefs.join(', ') || 'none'}`,
      `- Tool deltas: ${row.relevantTools.map(tool => `${tool.toolName}:${tool.outcome}[${tool.targetRefs.join(',') || 'no-ref'}]:score ${tool.scoreBefore ?? 'n/a'}->${tool.scoreAfter ?? 'n/a'}, table ${tool.tableBefore ?? 'n/a'}->${tool.tableAfter ?? 'n/a'}, alt ${tool.altBefore ?? 'n/a'}->${tool.altAfter ?? 'n/a'}, pdfua ${tool.pdfuaBefore ?? 'n/a'}->${tool.pdfuaAfter ?? 'n/a'}${tool.note ? `(${tool.note})` : ''}`).join('; ') || 'none'}`,
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(usage());
    return;
  }
  const manifest = argValue('--manifest') ?? DEFAULT_MANIFEST;
  const run = argValue('--run') ?? DEFAULT_RUN;
  const legacyRun = argValue('--legacy-run') ?? DEFAULT_LEGACY_RUN;
  const out = argValue('--out') ?? DEFAULT_OUT;
  const requested = new Set(repeatedArg('--file'));
  const selected = requested.size > 0 ? requested : new Set([...HARD_DEFAULT_IDS, ...LEGACY_DEFAULT_IDS]);

  const hardRows = (await loadEdgeMixManifest(manifest))
    .filter(row => selected.has(row.id) || selected.has(row.publicationId));
  const hardRunRows = await loadRunRows(run);
  const legacyRunRows = await loadRunRows(legacyRun);
  const seenLegacy = new Set<string>();
  const legacyRows = [...legacyRunRows.values()]
    .filter(row => {
      if (!row.id || !selected.has(row.id) || seenLegacy.has(row.id)) return false;
      seenLegacy.add(row.id);
      return true;
    })
    .map(row => ({
      id: row.id!,
      publicationId: row.publicationId ?? row.id!,
      title: row.title ?? row.id!,
      localFile: row.file ?? '',
      absolutePath: '',
      v1Score: null,
      v1Grade: null,
      pageCount: null,
      problemMix: [],
    } satisfies EdgeMixManifestRow));

  const rows = [
    ...(await Promise.all(hardRows.map(row => analyzeStage186Row({
      id: row.id,
      publicationId: row.publicationId,
      title: row.title,
      file: row.localFile,
      sourceKind: 'hard',
      runDir: run,
      runRow: hardRunRows.get(row.id) ?? hardRunRows.get(row.publicationId),
    })))),
    ...(await Promise.all(legacyRows.map(row => analyzeStage186Row({
      id: row.id,
      publicationId: row.publicationId,
      title: row.title,
      file: row.localFile,
      sourceKind: 'legacy',
      runDir: legacyRun,
      runRow: legacyRunRows.get(row.id) ?? legacyRunRows.get(row.publicationId),
    })))),
  ];
  const report = buildReport({ manifest, run, legacyRun, rows });
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage186-hard2-table-alt-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(out, 'stage186-hard2-table-alt-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 186 diagnostic to ${out}`);
  console.log(`Decision: ${report.decision.recommendedDirection}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
