#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot } from '../src/types.js';
import {
  classifyStage181HiddenAlt,
  stage181HiddenAltTargets,
  type Stage181HiddenAltClass,
  type Stage181HiddenAltTarget,
} from '../src/services/remediation/stage181HiddenAlt.js';

const DEFAULT_LEGACY_ROOT = 'Input/experiment-corpus';
const DEFAULT_HARD_ROOT = 'Input/from_sibling_pdfaf_v1_hard_2';
const DEFAULT_REFERENCE_RUN = 'Output/experiment-corpus-baseline/run-stage180-full-2026-05-02-r2';
const DEFAULT_ARTIFACT_RUN = 'Output/experiment-corpus-baseline/run-stage180-target-mixed-table-pdfua-2026-05-02-r3';
const DEFAULT_HARD_RUN = 'Output/from_sibling_pdfaf_v1_hard_2/run-stage180-hard2-smoke-2026-05-02-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage181-hidden-alt-diagnostic-2026-05-02-r1';

const PRIMARY_IDS = new Set(['figure-4754', 'font-4172', 'font-4057']);
const DIAGNOSTIC_IDS = new Set(['long-4680', 'long-4516', 'structure-4076', 'short-4214']);
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

type RowKind = 'primary' | 'diagnostic' | 'regression' | 'hard_control';

interface RunRow {
  id?: string;
  publicationId?: string;
  file?: string;
  localFile?: string;
  afterScore?: number;
  afterGrade?: string;
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  falsePositiveAppliedCount?: number;
  falsePositiveApplied?: number;
  appliedTools?: AppliedRemediationTool[];
}

export interface Stage181DiagnosticRow {
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
  checkerVisibleFigures: number;
  checkerVisibleFiguresWithAlt: number;
  checkerVisibleMissingAltRefs: string[];
  figureCount: number;
  missingAltFigureRefs: string[];
  roleMapTargets: Stage181HiddenAltTarget[];
  selectedTargets: Stage181HiddenAltTarget[];
  attemptedFigureRefs: string[];
  orphanMcidCount: number;
  suspectedPathPaintOutsideMc: number;
  falsePositiveApplied: number;
  toolTimeline: Array<{
    toolName: string;
    outcome: string;
    scoreBefore: number | null;
    scoreAfter: number | null;
    targetRefs: string[];
    note: string | null;
  }>;
  classification: Stage181HiddenAltClass;
  shouldAttempt: boolean;
  reason: string;
}

interface Stage181Report {
  referenceRun: string;
  artifactRun: string;
  hardRun: string;
  rows: Stage181DiagnosticRow[];
  decision: {
    classDistribution: Record<Stage181HiddenAltClass, number>;
    selectedRows: string[];
    recommendedDirection: 'try_stage181_hidden_alt_post_pass' | 'diagnostic_only_no_safe_rule';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage181-hidden-alt-diagnostic.ts [options]

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

function collectTargetRefs(details: unknown): string[] {
  const refs = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.length > 0) refs.add(value);
  };
  const parsed = parseDetails(details);
  const invariants = nestedRecord(parsed, 'invariants');
  add(invariants?.targetRef);
  add(invariants?.structRef);
  const target = parsed?.target;
  if (target && typeof target === 'object' && !Array.isArray(target)) add((target as Record<string, unknown>).structRef);
  const targetRefs = parsed?.targetRefs;
  if (Array.isArray(targetRefs)) targetRefs.forEach(add);
  const targets = parsed?.targets;
  if (Array.isArray(targets)) {
    for (const item of targets) {
      if (item && typeof item === 'object' && !Array.isArray(item)) add((item as Record<string, unknown>).structRef);
    }
  }
  const debug = nestedRecord(parsed, 'debug');
  add(debug?.targetRef);
  const replayState = nestedRecord(debug, 'replayState');
  add(replayState?.targetRef);
  return [...refs].sort();
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
  if (DIAGNOSTIC_IDS.has(id)) return 'diagnostic';
  if (REGRESSION_IDS.has(id)) return 'regression';
  return 'hard_control';
}

function toolTimeline(row: RunRow | undefined): Stage181DiagnosticRow['toolTimeline'] {
  const focus = new Set([
    'retag_as_figure',
    'set_figure_alt_text',
    'canonicalize_figure_alt_ownership',
    'normalize_nested_figure_containers',
    'repair_alt_text_structure',
    'mark_figure_decorative',
    'remap_orphan_mcids_as_artifacts',
    'normalize_table_structure',
    'repair_native_link_structure',
    'embed_local_font_substitutes',
  ]);
  return (row?.appliedTools ?? [])
    .filter(tool => focus.has(tool.toolName))
    .map(tool => ({
      toolName: tool.toolName,
      outcome: tool.outcome,
      scoreBefore: numberOrNull(tool.scoreBefore),
      scoreAfter: numberOrNull(tool.scoreAfter),
      targetRefs: collectTargetRefs(tool.details),
      note: noteFromDetails(tool.details),
    }));
}

function attemptedFigureRefs(tools: Stage181DiagnosticRow['toolTimeline']): string[] {
  return [...new Set(tools
    .filter(tool => tool.toolName === 'set_figure_alt_text' || tool.toolName === 'retag_as_figure')
    .flatMap(tool => tool.targetRefs))].sort();
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
}): Promise<Stage181DiagnosticRow> {
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
  const decision = classifyStage181HiddenAlt({
    analysis: result,
    snapshot,
    appliedTools: input.row.appliedTools ?? [],
    parked: DIAGNOSTIC_IDS.has(input.id),
    falsePositiveApplied,
  });
  const selectedTargets = decision.targets.length > 0
    ? decision.targets
    : stage181HiddenAltTargets(snapshot, input.row.appliedTools ?? []);
  const checker = snapshot.checkerFigureTargets ?? [];
  const roleMapTargets = selectedTargets.filter(target => target.toolName === 'retag_as_figure');
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
    checkerVisibleFigures: checker.length,
    checkerVisibleFiguresWithAlt: checker.filter(target => target.hasAlt).length,
    checkerVisibleMissingAltRefs: checker
      .filter(target => target.reachable && !target.hasAlt && target.structRef)
      .map(target => target.structRef!)
      .sort(),
    figureCount: snapshot.figures.length,
    missingAltFigureRefs: snapshot.figures
      .filter(figure => figure.reachable && !figure.hasAlt && figure.structRef)
      .map(figure => figure.structRef!)
      .sort(),
    roleMapTargets,
    selectedTargets,
    attemptedFigureRefs: attemptedFigureRefs(timeline),
    orphanMcidCount: snapshot.taggedContentAudit?.orphanMcidCount ?? snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ?? 0,
    suspectedPathPaintOutsideMc: snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ?? 0,
    falsePositiveApplied,
    toolTimeline: timeline,
    classification: decision.classification,
    shouldAttempt: decision.shouldAttempt,
    reason: decision.reason,
  };
}

function buildReport(referenceRun: string, artifactRun: string, hardRun: string, rows: Stage181DiagnosticRow[]): Stage181Report {
  const classDistribution = rows.reduce<Record<Stage181HiddenAltClass, number>>((acc, row) => {
    acc[row.classification] += 1;
    return acc;
  }, {
    hidden_checker_visible_alt_target: 0,
    orphan_figure_alt_ownership_candidate: 0,
    decorative_artifact_candidate: 0,
    alt_score_analyzer_debt: 0,
    mixed_heading_or_protected_volatility: 0,
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
      recommendedDirection: selectedRows.length > 0 ? 'try_stage181_hidden_alt_post_pass' : 'diagnostic_only_no_safe_rule',
    },
  };
}

function renderMarkdown(report: Stage181Report): string {
  const lines = [
    '# Stage 181 Hidden Alt Diagnostic',
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
    '| Row | Kind | Score | Analyzed | Alt | PDF/UA | H | RO | Table | Link | Checker alt | Targets | Class | Reason |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push(`| ${row.id} | ${row.rowKind} | ${row.score ?? 'n/a'} ${row.grade ?? ''} | ${row.analyzedScore} ${row.analyzedGrade} | ${row.categories.alt_text ?? 'n/a'} | ${row.categories.pdf_ua_compliance ?? 'n/a'} | ${row.categories.heading_structure ?? 'n/a'} | ${row.categories.reading_order ?? 'n/a'} | ${row.categories.table_markup ?? 'n/a'} | ${row.categories.link_quality ?? 'n/a'} | ${row.checkerVisibleFiguresWithAlt}/${row.checkerVisibleFigures} | ${row.selectedTargets.length} | ${row.classification} | ${row.reason} |`);
  }
  lines.push('', '## Target Evidence', '');
  for (const row of report.rows.filter(item => item.shouldAttempt || item.rowKind === 'primary')) {
    lines.push(`### ${row.id}`);
    lines.push(`- Analyzed PDF: \`${row.analyzedPdf}\`${row.analyzedFromArtifact ? '' : ' (source PDF fallback)'}`);
    lines.push(`- Attempted figure refs: ${row.attemptedFigureRefs.map(ref => `\`${ref}\``).join(', ') || 'none'}`);
    lines.push(`- Checker-visible missing-alt refs: ${row.checkerVisibleMissingAltRefs.map(ref => `\`${ref}\``).join(', ') || 'none'}`);
    lines.push(`- Selected targets: ${row.selectedTargets.map(target => `\`${target.structRef}\` ${target.toolName} page=${target.page + 1}`).join(', ') || 'none'}`);
    lines.push(`- Figure refs missing alt: ${row.missingAltFigureRefs.slice(0, 20).map(ref => `\`${ref}\``).join(', ') || 'none'}`);
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

  const ids = requested.size > 0 ? requested : new Set([...PRIMARY_IDS, ...DIAGNOSTIC_IDS, ...REGRESSION_IDS]);
  const hardIds = requestedHard.size > 0 ? requestedHard : HARD_CONTROL_IDS;
  const runRows = await loadRunRows(referenceRun);
  const hardRows = await loadRunRows(hardRun).catch(() => new Map<string, RunRow>());
  const rows: Stage181DiagnosticRow[] = [];

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
  await writeFile(join(outDir, 'stage181-hidden-alt-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage181-hidden-alt-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

