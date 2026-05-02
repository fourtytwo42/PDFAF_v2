#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot } from '../src/types.js';
import {
  classifyStage180MixedTablePdfUa,
  stage180RemainingTableTargets,
  type Stage180MixedClass,
  type Stage180TableTarget,
} from '../src/services/remediation/stage180MixedTablePdfua.js';

const DEFAULT_LEGACY_ROOT = 'Input/experiment-corpus';
const DEFAULT_HARD_ROOT = 'Input/from_sibling_pdfaf_v1_hard_2';
const DEFAULT_REFERENCE_RUN = 'Output/experiment-corpus-baseline/run-stage179-full-2026-05-02-r1';
const DEFAULT_ARTIFACT_RUN = 'Output/experiment-corpus-baseline/run-stage179-target-partial-alt-2026-05-02-r1';
const DEFAULT_HARD_RUN = 'Output/from_sibling_pdfaf_v1_hard_2/run-stage179-hard2-smoke-2026-05-02-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage180-mixed-table-pdfua-diagnostic-2026-05-02-r1';

const PRIMARY_IDS = new Set(['font-4057']);
const SECONDARY_IDS = new Set(['long-4680', 'figure-4754', 'font-4172']);
const PARKED_IDS = new Set(['structure-4076', 'short-4176', 'long-4683', 'short-4214']);
const REGRESSION_IDS = new Set([
  'structure-4131',
  'font-3437',
  'font-3448',
  'font-3529',
  'figure-4702',
  'font-4156',
  'fixture-inaccessible',
  'long-4700',
]);
const HARD_CONTROL_IDS = new Set(['3510', '4705', '4105']);

type RowKind = 'primary' | 'secondary' | 'parked' | 'regression' | 'hard_control';

interface RunToolRow extends AppliedRemediationTool {}

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

export interface Stage180DiagnosticRow {
  id: string;
  rowKind: RowKind;
  file: string;
  analyzedPdf: string;
  analyzedFromArtifact: boolean;
  score: number | null;
  grade: string | null;
  analyzedScore: number;
  analyzedGrade: string;
  categories: Record<string, number | null>;
  tableTargets: Stage180TableTarget[];
  attemptedTableRefs: string[];
  roleMapFigureCandidates: number;
  checkerVisibleFigures: number;
  checkerVisibleFiguresWithAlt: number;
  annotationDebt: number;
  orphanMcidCount: number;
  suspectedPathPaintOutsideMc: number;
  falsePositiveApplied: number;
  toolTimeline: Array<{
    toolName: string;
    outcome: string;
    scoreBefore: number | null;
    scoreAfter: number | null;
    targetRef: string | null;
    note: string | null;
  }>;
  classification: Stage180MixedClass;
  shouldAttempt: boolean;
  reason: string;
}

interface Stage180Report {
  referenceRun: string;
  artifactRun: string;
  hardRun: string;
  rows: Stage180DiagnosticRow[];
  decision: {
    classDistribution: Record<Stage180MixedClass, number>;
    selectedRows: string[];
    recommendedDirection: 'try_stage180_table_pdfua_post_pass' | 'diagnostic_only_no_safe_rule';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage180-mixed-table-pdfua-diagnostic.ts [options]

Options:
  --reference-run <dir>   Benchmark reference run (default: ${DEFAULT_REFERENCE_RUN})
  --artifact-run <dir>    Optional written-PDF artifact run (default: ${DEFAULT_ARTIFACT_RUN})
  --legacy-root <path>    Original corpus root (default: ${DEFAULT_LEGACY_ROOT})
  --hard-run <dir>        Hard-holdout-2 smoke run (default: ${DEFAULT_HARD_RUN})
  --hard-root <path>      Hard-holdout-2 input root (default: ${DEFAULT_HARD_ROOT})
  --out <dir>             Output diagnostic directory (default: ${DEFAULT_OUT})
  --file <id>             Limit/add original-corpus row id; repeatable
  --hard-file <id>        Limit/add hard-holdout publication id; repeatable
  --help                  Show this help`;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function nestedRecord(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function targetRefFromDetails(details: unknown): string | null {
  const parsed = parseDetails(details);
  const invariants = nestedRecord(parsed, 'invariants');
  if (typeof invariants?.targetRef === 'string') return invariants.targetRef;
  const target = parsed?.['target'];
  if (target && typeof target === 'object' && !Array.isArray(target) && typeof (target as Record<string, unknown>).structRef === 'string') {
    return (target as Record<string, unknown>).structRef as string;
  }
  const debug = nestedRecord(parsed, 'debug');
  if (typeof debug?.targetRef === 'string') return debug.targetRef;
  const replayState = nestedRecord(debug, 'replayState');
  if (typeof replayState?.targetRef === 'string') return replayState.targetRef;
  return null;
}

function noteFromDetails(details: unknown): string | null {
  const parsed = parseDetails(details);
  if (typeof parsed?.note === 'string') return parsed.note;
  if (typeof parsed?.raw === 'string') return parsed.raw;
  return typeof details === 'string' ? details.slice(0, 160) : null;
}

function categoryMap(result: AnalysisResult): Record<string, number | null> {
  return Object.fromEntries(result.categories.map(category => [category.key, numberOrNull(category.score)]));
}

function rowKind(id: string): RowKind {
  if (PRIMARY_IDS.has(id)) return 'primary';
  if (SECONDARY_IDS.has(id)) return 'secondary';
  if (PARKED_IDS.has(id)) return 'parked';
  if (REGRESSION_IDS.has(id)) return 'regression';
  return 'hard_control';
}

function toolTimeline(row: RunRow | undefined): Stage180DiagnosticRow['toolTimeline'] {
  const focus = new Set([
    'normalize_table_structure',
    'repair_native_table_headers',
    'set_table_header_cells',
    'retag_as_figure',
    'set_figure_alt_text',
    'canonicalize_figure_alt_ownership',
    'repair_native_link_structure',
    'tag_unowned_annotations',
    'normalize_annotation_tab_order',
    'remap_orphan_mcids_as_artifacts',
    'set_pdfua_identification',
  ]);
  return (row?.appliedTools ?? [])
    .filter(tool => focus.has(tool.toolName))
    .map(tool => ({
      toolName: tool.toolName,
      outcome: tool.outcome,
      scoreBefore: numberOrNull(tool.scoreBefore),
      scoreAfter: numberOrNull(tool.scoreAfter),
      targetRef: targetRefFromDetails(tool.details),
      note: noteFromDetails(tool.details),
    }));
}

function attemptedTableRefs(tools: Stage180DiagnosticRow['toolTimeline']): string[] {
  return [...new Set(tools
    .filter(tool => tool.toolName === 'normalize_table_structure' && tool.targetRef)
    .map(tool => tool.targetRef!))].sort();
}

function annotationDebt(snapshot: DocumentSnapshot): number {
  const a = snapshot.annotationAccessibility;
  const d = snapshot.detectionProfile?.annotationSignals;
  return (
    (a?.linkAnnotationsMissingStructure ?? d?.linkAnnotationsMissingStructure ?? 0) +
    (a?.linkAnnotationsMissingStructParent ?? d?.linkAnnotationsMissingStructParent ?? 0) +
    (a?.nonLinkAnnotationsMissingStructure ?? d?.nonLinkAnnotationsMissingStructure ?? 0) +
    (a?.nonLinkAnnotationsMissingStructParent ?? d?.nonLinkAnnotationsMissingStructParent ?? 0)
  );
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

async function artifactPdfFor(runDir: string, id: string): Promise<string | null> {
  const direct = await existing(join(runDir, 'pdfs', `${id}.pdf`));
  if (direct) return direct;
  try {
    const files = await readdir(runDir);
    const match = files.find(file => file.startsWith(`${id}-`) && file.endsWith('.remediated.pdf'));
    return match ? join(runDir, match) : null;
  } catch {
    return null;
  }
}

async function analyzeRow(input: {
  id: string;
  row: RunRow;
  root: string;
  referenceRun: string;
  artifactRun: string;
}): Promise<Stage180DiagnosticRow> {
  const file = input.row.file ?? input.row.localFile;
  if (!file) throw new Error(`Run row ${input.id} is missing file`);
  const artifactPdf =
    await artifactPdfFor(input.artifactRun, input.id) ??
    await artifactPdfFor(input.referenceRun, input.id) ??
    await artifactPdfFor(input.artifactRun, input.row.id ?? input.id);
  const pdfPath = artifactPdf ?? resolve(input.root, file);
  const { result, snapshot } = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  const timeline = toolTimeline(input.row);
  const falsePositiveApplied = Number(input.row.falsePositiveAppliedCount ?? input.row.falsePositiveApplied ?? 0);
  const decision = classifyStage180MixedTablePdfUa({
    analysis: result,
    snapshot,
    appliedTools: input.row.appliedTools ?? [],
    parked: PARKED_IDS.has(input.id),
    falsePositiveApplied,
  });
  const roleMapFigureCandidates = snapshot.figures.filter(figure =>
    figure.reachable === true &&
    figure.directContent === true &&
    !figure.hasAlt &&
    (figure.resolvedRole ?? figure.role ?? '').replace(/^\//, '').toLowerCase() === 'figure'
  ).length;
  const checker = snapshot.checkerFigureTargets ?? [];
  return {
    id: input.id,
    rowKind: rowKind(input.id),
    file,
    analyzedPdf: pdfPath,
    analyzedFromArtifact: Boolean(artifactPdf),
    score: numberOrNull(input.row.reanalyzedScore ?? input.row.afterScore),
    grade: typeof (input.row.reanalyzedGrade ?? input.row.afterGrade) === 'string'
      ? input.row.reanalyzedGrade ?? input.row.afterGrade ?? null
      : null,
    analyzedScore: result.score,
    analyzedGrade: result.grade,
    categories: categoryMap(result),
    tableTargets: decision.tableTargets.length > 0
      ? decision.tableTargets
      : stage180RemainingTableTargets(snapshot, input.row.appliedTools ?? []),
    attemptedTableRefs: attemptedTableRefs(timeline),
    roleMapFigureCandidates,
    checkerVisibleFigures: checker.length,
    checkerVisibleFiguresWithAlt: checker.filter(target => target.hasAlt).length,
    annotationDebt: annotationDebt(snapshot),
    orphanMcidCount: snapshot.taggedContentAudit?.orphanMcidCount ?? snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ?? 0,
    suspectedPathPaintOutsideMc: snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ?? 0,
    falsePositiveApplied,
    toolTimeline: timeline,
    classification: decision.classification,
    shouldAttempt: decision.shouldAttempt,
    reason: decision.reason,
  };
}

function buildReport(referenceRun: string, artifactRun: string, hardRun: string, rows: Stage180DiagnosticRow[]): Stage180Report {
  const classDistribution = rows.reduce<Record<Stage180MixedClass, number>>((acc, row) => {
    acc[row.classification] += 1;
    return acc;
  }, {
    stable_table_first_candidate: 0,
    rolemap_alt_after_table_candidate: 0,
    pdfua_cleanup_after_category_gain_candidate: 0,
    mixed_ordered_transaction_candidate: 0,
    protected_or_analyzer_volatility: 0,
    no_safe_target: 0,
  });
  const selectedRows = rows.filter(row => row.rowKind === 'primary' && row.shouldAttempt).map(row => row.id).sort();
  return {
    referenceRun,
    artifactRun,
    hardRun,
    rows,
    decision: {
      classDistribution,
      selectedRows,
      recommendedDirection: selectedRows.length > 0 ? 'try_stage180_table_pdfua_post_pass' : 'diagnostic_only_no_safe_rule',
    },
  };
}

function renderMarkdown(report: Stage180Report): string {
  const lines = [
    '# Stage 180 Mixed Table/PDF-UA Diagnostic',
    '',
    `Reference run: \`${report.referenceRun}\``,
    `Artifact run: \`${report.artifactRun}\``,
    `Hard-control run: \`${report.hardRun}\``,
    `Decision: \`${report.decision.recommendedDirection}\``,
    `Selected rows: ${report.decision.selectedRows.map(id => `\`${id}\``).join(', ') || 'none'}`,
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.decision.classDistribution).map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '| Row | Kind | Score | Analyzed | Alt | Table | PDF/UA | H | RO | Link | Table targets | Ann debt | Orphans | Checker alt | Class | Reason |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push(`| ${row.id} | ${row.rowKind} | ${row.score ?? 'n/a'} ${row.grade ?? ''} | ${row.analyzedScore} ${row.analyzedGrade} | ${row.categories.alt_text ?? 'n/a'} | ${row.categories.table_markup ?? 'n/a'} | ${row.categories.pdf_ua_compliance ?? 'n/a'} | ${row.categories.heading_structure ?? 'n/a'} | ${row.categories.reading_order ?? 'n/a'} | ${row.categories.link_quality ?? 'n/a'} | ${row.tableTargets.length} | ${row.annotationDebt} | ${row.orphanMcidCount} | ${row.checkerVisibleFiguresWithAlt}/${row.checkerVisibleFigures} | ${row.classification} | ${row.reason} |`);
  }
  lines.push('', '## Selected Evidence', '');
  for (const row of report.rows.filter(item => item.shouldAttempt || item.rowKind === 'primary')) {
    lines.push(`### ${row.id}`);
    lines.push(`- Analyzed PDF: \`${row.analyzedPdf}\`${row.analyzedFromArtifact ? '' : ' (source PDF fallback)'}`);
    lines.push(`- Attempted table refs: ${row.attemptedTableRefs.map(ref => `\`${ref}\``).join(', ') || 'none'}`);
    lines.push(`- Remaining table targets: ${row.tableTargets.map(target => `\`${target.structRef}\` rows=${target.irregularRows} dom=${target.dominantColumnCount}${target.smallDominantFallback ? ' fallback' : ''}`).join(', ') || 'none'}`);
    lines.push(`- Role-map candidates: ${row.roleMapFigureCandidates}; checker-visible alt: ${row.checkerVisibleFiguresWithAlt}/${row.checkerVisibleFigures}; annotation debt: ${row.annotationDebt}; orphan MCIDs: ${row.orphanMcidCount}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let referenceRun = DEFAULT_REFERENCE_RUN;
  let artifactRun = DEFAULT_ARTIFACT_RUN;
  let legacyRoot = DEFAULT_LEGACY_ROOT;
  let hardRun = DEFAULT_HARD_RUN;
  let hardRoot = DEFAULT_HARD_ROOT;
  let outDir = DEFAULT_OUT;
  const requested = new Set<string>();
  const requestedHard = new Set<string>();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--reference-run') referenceRun = args[++i] ?? referenceRun;
    else if (arg === '--artifact-run') artifactRun = args[++i] ?? artifactRun;
    else if (arg === '--legacy-root') legacyRoot = args[++i] ?? legacyRoot;
    else if (arg === '--hard-run') hardRun = args[++i] ?? hardRun;
    else if (arg === '--hard-root') hardRoot = args[++i] ?? hardRoot;
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

  const ids = requested.size > 0 ? requested : new Set([...PRIMARY_IDS, ...SECONDARY_IDS, ...PARKED_IDS, ...REGRESSION_IDS]);
  const hardIds = requestedHard.size > 0 ? requestedHard : HARD_CONTROL_IDS;
  const runRows = await loadRunRows(referenceRun);
  const hardRows = await loadRunRows(hardRun).catch(() => new Map<string, RunRow>());
  const rows: Stage180DiagnosticRow[] = [];

  for (const id of ids) {
    const row = runRows.get(id);
    if (!row) continue;
    rows.push(await analyzeRow({ id, row, root: legacyRoot, referenceRun, artifactRun }));
  }
  for (const id of hardIds) {
    const row = hardRows.get(id) ?? hardRows.get(`v1-${id}`);
    if (!row) continue;
    rows.push(await analyzeRow({ id: `v1-${id}`, row, root: hardRoot, referenceRun: hardRun, artifactRun: hardRun }));
  }

  const report = buildReport(referenceRun, artifactRun, hardRun, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage180-mixed-table-pdfua-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage180-mixed-table-pdfua-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
