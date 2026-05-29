#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DetectionProfile, DocumentSnapshot } from '../src/types.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const DEFAULT_TARGET_SCORE = 93;
const DEFAULT_REPEATS = 3;

export type NativeAnalyzerRepeatClass =
  | 'native_analyzer_stable_clear'
  | 'native_analyzer_stable_low'
  | 'native_analyzer_score_volatile'
  | 'native_analyzer_profile_volatile'
  | 'analysis_error'
  | 'no_behavior_ready';

export type NativeAnalyzerRepeatDecision =
  | 'original50_route_ready_for_table_reopen'
  | 'fix_or_park_native_analyzer_variance_before_behavior'
  | 'move_to_row_failure_shape_or_park'
  | 'collect_successful_analyzer_repeats'
  | 'no_behavior_ready';

export interface DeltaValue {
  key: string;
  min: number | boolean | string | null;
  max: number | boolean | string | null;
  delta: number | null;
}

export interface AnalyzerRepeatSummary {
  index: number;
  ok: boolean;
  error: string | null;
  score: number | null;
  grade: string | null;
  wallMs: number | null;
  analysisDurationMs: number | null;
  categories: Record<string, number>;
  detectionSignals: Record<string, number | boolean | string | null>;
  snapshotSignals: Record<string, number | boolean | string | null>;
}

export interface AnalyzerRepeatRow {
  key: string;
  pdfPath: string;
  filename: string;
  repeats: AnalyzerRepeatSummary[];
  scoreRange: [number, number] | null;
  scoreDelta: number | null;
  categoryDeltas: DeltaValue[];
  detectionDeltas: DeltaValue[];
  snapshotDeltas: DeltaValue[];
  classification: NativeAnalyzerRepeatClass;
  reasons: string[];
  recommendedNext: string;
}

export interface NativeAnalyzerRepeatAttributionDiagnostic {
  generatedAt: string;
  outDir: string;
  targetScore: number;
  repeatCount: number;
  inputs: Array<{ key: string; pdfPath: string; filename: string }>;
  summary: {
    rowCount: number;
    blockerCount: number;
    byClass: Record<NativeAnalyzerRepeatClass, number>;
  };
  decision: {
    status: NativeAnalyzerRepeatDecision;
    reasons: string[];
    nextLane: string;
  };
  rows: AnalyzerRepeatRow[];
}

interface Args {
  pdfs: Array<{ key: string; path: string }>;
  repeats: number;
  outDir: string;
  targetScore: number;
  timeoutMs?: number;
}

const CLASSES: NativeAnalyzerRepeatClass[] = [
  'native_analyzer_stable_clear',
  'native_analyzer_stable_low',
  'native_analyzer_score_volatile',
  'native_analyzer_profile_volatile',
  'analysis_error',
  'no_behavior_ready',
];

const DETECTION_SIGNAL_PATHS: Array<{ key: string; path: string[] }> = [
  { key: 'heading.extractedHeadingCount', path: ['headingSignals', 'extractedHeadingCount'] },
  { key: 'heading.treeHeadingCount', path: ['headingSignals', 'treeHeadingCount'] },
  { key: 'heading.headingTreeDepth', path: ['headingSignals', 'headingTreeDepth'] },
  { key: 'heading.layoutHeadingCandidateCount', path: ['headingSignals', 'layoutHeadingCandidateCount'] },
  { key: 'figure.extractedFigureCount', path: ['figureSignals', 'extractedFigureCount'] },
  { key: 'figure.treeFigureCount', path: ['figureSignals', 'treeFigureCount'] },
  { key: 'figure.checkerVisibleFigureCount', path: ['figureSignals', 'checkerVisibleFigureCount'] },
  { key: 'table.irregularTableCount', path: ['tableSignals', 'irregularTableCount'] },
  { key: 'table.stronglyIrregularTableCount', path: ['tableSignals', 'stronglyIrregularTableCount'] },
  { key: 'table.directCellUnderTableCount', path: ['tableSignals', 'directCellUnderTableCount'] },
  { key: 'table.layoutTableCandidateCount', path: ['tableSignals', 'layoutTableCandidateCount'] },
  { key: 'pdfua.orphanMcidCount', path: ['pdfUaSignals', 'orphanMcidCount'] },
  { key: 'annotation.linkAnnotationsMissingStructure', path: ['annotationSignals', 'linkAnnotationsMissingStructure'] },
  { key: 'reading.sampledStructurePageOrderDriftCount', path: ['readingOrderSignals', 'sampledStructurePageOrderDriftCount'] },
  { key: 'reading.multiColumnOrderRiskPages', path: ['readingOrderSignals', 'multiColumnOrderRiskPages'] },
];

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original50-native-analyzer-repeat-attribution.ts --pdf <id=path> [options]

Options:
  --pdf <id=path>                    PDF to analyze repeatedly. Repeatable.
  --repeats <n>                      Repeat count, 1-8. Default: ${DEFAULT_REPEATS}.
  --out <dir>                        Output directory.
  --target-score <n>                 Gate target score. Default: ${DEFAULT_TARGET_SCORE}.
  --timeout-ms <n>                   Optional per-analysis timeout.
  --help                             Show this help.

This script runs native PDFAF analysis only. It does not remediate PDFs, write remediated PDFs, call ODL/PAC/POC/Java, or use semantic/LLM behavior.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  const pdfs: Array<{ key: string; path: string }> = [];
  let repeats = DEFAULT_REPEATS;
  let outDir = join(DEFAULT_OUT_ROOT, `original50-native-analyzer-repeat-attribution-${timestampSlug(now)}`);
  let targetScore = DEFAULT_TARGET_SCORE;
  let timeoutMs: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--pdf') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --pdf value\n${usage()}`);
      pdfs.push(parseLabelPath(value));
      continue;
    }
    if (arg === '--repeats') {
      const value = Number.parseInt(argv[++index] ?? '', 10);
      if (!Number.isFinite(value)) throw new Error(`Invalid --repeats value\n${usage()}`);
      repeats = Math.max(1, Math.min(8, value));
      continue;
    }
    if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --out value\n${usage()}`);
      outDir = resolve(value);
      continue;
    }
    if (arg === '--target-score') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value)) throw new Error(`Invalid --target-score value\n${usage()}`);
      targetScore = value;
      continue;
    }
    if (arg === '--timeout-ms') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid --timeout-ms value\n${usage()}`);
      timeoutMs = value;
      continue;
    }
    throw new Error(`Unknown argument ${arg}\n${usage()}`);
  }

  if (pdfs.length === 0) throw new Error(`At least one --pdf is required\n${usage()}`);
  return { pdfs, repeats, outDir, targetScore, timeoutMs };
}

function parseLabelPath(value: string): { key: string; path: string } {
  const index = value.indexOf('=');
  if (index === -1) {
    const path = resolve(value);
    return { key: basename(path).replace(/\.pdf$/i, ''), path };
  }
  return { key: value.slice(0, index), path: resolve(value.slice(index + 1)) };
}

function categoryMap(result: AnalysisResult): Record<string, number> {
  return Object.fromEntries(result.categories.map(category => [category.key, category.score]));
}

function getPath(root: Record<string, unknown> | undefined, path: string[]): number | boolean | string | null {
  let current: unknown = root;
  for (const part of path) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current === 'number' || typeof current === 'boolean' || typeof current === 'string') return current;
  return null;
}

function detectionSignalMap(profile: DetectionProfile | null | undefined): Record<string, number | boolean | string | null> {
  const root = profile as unknown as Record<string, unknown> | undefined;
  const out: Record<string, number | boolean | string | null> = {};
  for (const item of DETECTION_SIGNAL_PATHS) {
    const value = getPath(root, item.path);
    if (value !== null) out[item.key] = value;
  }
  return out;
}

function snapshotSignalMap(snapshot: DocumentSnapshot): Record<string, number | boolean | string | null> {
  return {
    pageCount: snapshot.pageCount,
    textCharCount: snapshot.textCharCount,
    textPageCount: snapshot.textByPage.length,
    imageOnlyPageCount: snapshot.imageOnlyPageCount,
    isTagged: snapshot.isTagged,
    headingCount: snapshot.headings.length,
    figureCount: snapshot.figures.length,
    checkerFigureTargetCount: snapshot.checkerFigureTargets?.length ?? 0,
    tableCount: snapshot.tables.length,
    paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
    orphanMcidCount: snapshot.orphanMcids?.length ?? 0,
    mcidTextSpanCount: snapshot.mcidTextSpans?.length ?? 0,
    nativeTitleBtCandidateCount: snapshot.nativeTitleBtCandidates?.length ?? 0,
    rootReachableHeadingCount: snapshot.structureDebug?.rootReachableHeadingCount ?? null,
    rootReachableDepth: snapshot.structureDebug?.rootReachableDepth ?? null,
    taggedContentAuditOrphanMcidCount: snapshot.taggedContentAudit?.orphanMcidCount ?? null,
    tableHeaderAssociationMissingCount: snapshot.tableHeaderAudit?.headerAssociationMissingCount ?? null,
    tableDataCellsWithoutHeaderCount: snapshot.tableHeaderAudit?.dataCellsWithoutHeaderCount ?? null,
    tableOrphanHeaderCellCount: snapshot.tableHeaderAudit?.orphanHeaderCellCount ?? null,
    structureInvalidChildRoleCount: snapshot.structureSyntaxAudit?.invalidChildRoleCount ?? null,
    structureMissingParentCount: snapshot.structureSyntaxAudit?.missingParentCount ?? null,
    structureWrongParentCount: snapshot.structureSyntaxAudit?.wrongParentCount ?? null,
    layoutHeadingCandidateCount: snapshot.layoutAudit?.layoutHeadingCandidateCount ?? null,
    layoutTableCandidateCount: snapshot.layoutAudit?.layoutTableCandidateCount ?? null,
    denseRowBandTableCandidateCount: snapshot.layoutAudit?.denseRowBandTableCandidateCount ?? null,
  };
}

function compareRepeatMaps<T extends number | boolean | string | null>(
  repeats: AnalyzerRepeatSummary[],
  pick: (repeat: AnalyzerRepeatSummary) => Record<string, T>,
  threshold: number,
): DeltaValue[] {
  const successful = repeats.filter(repeat => repeat.ok);
  if (successful.length < 2) return [];
  const keys = new Set<string>();
  for (const repeat of successful) {
    for (const key of Object.keys(pick(repeat))) keys.add(key);
  }
  const out: DeltaValue[] = [];
  for (const key of [...keys].sort()) {
    const values = successful.map(repeat => pick(repeat)[key] ?? null);
    const first = values[0] ?? null;
    if (values.every(value => value === first)) continue;
    const numericValues = values.filter((value): value is number => typeof value === 'number');
    if (numericValues.length === values.length) {
      const min = Math.min(...numericValues);
      const max = Math.max(...numericValues);
      if (max - min < threshold) continue;
      out.push({ key, min, max, delta: max - min });
      continue;
    }
    const changed = values.find(value => value !== first) ?? null;
    out.push({ key, min: first, max: changed, delta: null });
  }
  return out;
}

function classifyRow(input: {
  repeats: AnalyzerRepeatSummary[];
  scoreDelta: number | null;
  categoryDeltas: DeltaValue[];
  detectionDeltas: DeltaValue[];
  snapshotDeltas: DeltaValue[];
  targetScore: number;
}): Pick<AnalyzerRepeatRow, 'classification' | 'reasons' | 'recommendedNext'> {
  const successful = input.repeats.filter(repeat => repeat.ok);
  if (successful.length === 0) {
    return {
      classification: 'analysis_error',
      reasons: ['no successful native analyzer repeat'],
      recommendedNext: 'inspect analyzer errors before behavior work',
    };
  }
  const scores = successful.map(repeat => repeat.score).filter((score): score is number => typeof score === 'number');
  if (scores.length === 0) {
    return {
      classification: 'analysis_error',
      reasons: ['successful repeats did not produce numeric scores'],
      recommendedNext: 'inspect analyzer result shape',
    };
  }
  const scoreDelta = input.scoreDelta ?? 0;
  if (scoreDelta >= 10) {
    return {
      classification: 'native_analyzer_score_volatile',
      reasons: [`score_range=${Math.min(...scores)}..${Math.max(...scores)}`],
      recommendedNext: 'fix or park native analyzer volatility before behavior promotion',
    };
  }
  if (input.categoryDeltas.length > 0 || input.detectionDeltas.length > 0 || input.snapshotDeltas.length > 0) {
    return {
      classification: 'native_analyzer_profile_volatile',
      reasons: ['native analyzer score is stable but category/detection/snapshot profile varies'],
      recommendedNext: 'attribute profile variance before accepting category-sensitive behavior',
    };
  }
  if (scores.every(score => score >= input.targetScore)) {
    return {
      classification: 'native_analyzer_stable_clear',
      reasons: ['native analyzer repeats are stable and at or above target'],
      recommendedNext: 'no analyzer blocker for this row',
    };
  }
  return {
    classification: 'native_analyzer_stable_low',
    reasons: ['native analyzer repeats are stable but below target'],
    recommendedNext: 'move to remediation failure-shape diagnostic with controls or park',
  };
}

function countClasses(rows: AnalyzerRepeatRow[]): Record<NativeAnalyzerRepeatClass, number> {
  const out = Object.fromEntries(CLASSES.map(item => [item, 0])) as Record<NativeAnalyzerRepeatClass, number>;
  for (const row of rows) out[row.classification] = (out[row.classification] ?? 0) + 1;
  return out;
}

function decide(rows: AnalyzerRepeatRow[]): NativeAnalyzerRepeatAttributionDiagnostic['decision'] {
  const counts = countClasses(rows);
  if (rows.length > 0 && rows.every(row => row.classification === 'native_analyzer_stable_clear')) {
    return {
      status: 'original50_route_ready_for_table_reopen',
      reasons: ['all selected native analyzer repeats are stable and clear'],
      nextLane: 'reopen_strict_object_backed_table_lanes',
    };
  }
  const variance = counts.native_analyzer_score_volatile + counts.native_analyzer_profile_volatile;
  if (variance > 0) {
    return {
      status: 'fix_or_park_native_analyzer_variance_before_behavior',
      reasons: [`${variance} selected row(s) have native analyzer variance`],
      nextLane: 'native_analyzer_stability_or_source_tracked_parking',
    };
  }
  if (counts.analysis_error > 0) {
    return {
      status: 'collect_successful_analyzer_repeats',
      reasons: ['one or more selected rows failed native analyzer repeat collection'],
      nextLane: 'analyzer_error_attribution',
    };
  }
  if (counts.native_analyzer_stable_low > 0) {
    return {
      status: 'move_to_row_failure_shape_or_park',
      reasons: ['selected rows are analyzer-stable but remain below target'],
      nextLane: 'remediation_failure_shape_diagnostic_with_controls',
    };
  }
  return {
    status: 'no_behavior_ready',
    reasons: ['no selected row has behavior-ready analyzer evidence'],
    nextLane: 'park_or_collect_more_evidence',
  };
}

async function analyzeRepeat(pdfPath: string, filename: string, index: number, timeoutMs?: number): Promise<AnalyzerRepeatSummary> {
  const started = performance.now();
  try {
    const analyzed = await analyzePdf(pdfPath, filename, {
      bypassCache: true,
      ...(timeoutMs ? { timeoutMs } : {}),
    });
    return {
      index,
      ok: true,
      error: null,
      score: analyzed.result.score,
      grade: analyzed.result.grade,
      wallMs: performance.now() - started,
      analysisDurationMs: analyzed.result.analysisDurationMs ?? null,
      categories: categoryMap(analyzed.result),
      detectionSignals: detectionSignalMap(analyzed.result.detectionProfile),
      snapshotSignals: snapshotSignalMap(analyzed.snapshot),
    };
  } catch (error) {
    return {
      index,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      score: null,
      grade: null,
      wallMs: performance.now() - started,
      analysisDurationMs: null,
      categories: {},
      detectionSignals: {},
      snapshotSignals: {},
    };
  }
}

export function buildNativeAnalyzerRepeatAttributionDiagnostic(input: {
  generatedAt?: string;
  outDir: string;
  targetScore?: number;
  repeatCount: number;
  rows: Array<{ key: string; pdfPath: string; filename: string; repeats: AnalyzerRepeatSummary[] }>;
}): NativeAnalyzerRepeatAttributionDiagnostic {
  const targetScore = input.targetScore ?? DEFAULT_TARGET_SCORE;
  const rows = input.rows.map(row => {
    const successfulScores = row.repeats
      .map(repeat => repeat.score)
      .filter((score): score is number => typeof score === 'number');
    const scoreRange: [number, number] | null = successfulScores.length
      ? [Math.min(...successfulScores), Math.max(...successfulScores)]
      : null;
    const scoreDelta = scoreRange ? scoreRange[1] - scoreRange[0] : null;
    const categoryDeltas = compareRepeatMaps(row.repeats, repeat => repeat.categories, 4);
    const detectionDeltas = compareRepeatMaps(row.repeats, repeat => repeat.detectionSignals, 2);
    const snapshotDeltas = compareRepeatMaps(row.repeats, repeat => repeat.snapshotSignals, 2);
    const classified = classifyRow({
      repeats: row.repeats,
      scoreDelta,
      categoryDeltas,
      detectionDeltas,
      snapshotDeltas,
      targetScore,
    });
    return {
      key: row.key,
      pdfPath: row.pdfPath,
      filename: row.filename,
      repeats: row.repeats,
      scoreRange,
      scoreDelta,
      categoryDeltas,
      detectionDeltas,
      snapshotDeltas,
      ...classified,
    };
  });

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    outDir: input.outDir,
    targetScore,
    repeatCount: input.repeatCount,
    inputs: input.rows.map(row => ({ key: row.key, pdfPath: row.pdfPath, filename: row.filename })),
    summary: {
      rowCount: rows.length,
      blockerCount: rows.filter(row => row.classification !== 'native_analyzer_stable_clear').length,
      byClass: countClasses(rows),
    },
    decision: decide(rows),
    rows,
  };
}

function formatDeltaSummary(deltas: DeltaValue[], limit = 6): string {
  if (deltas.length === 0) return 'none';
  return deltas.slice(0, limit).map(delta => `${delta.key} ${delta.min}->${delta.max}`).join(', ');
}

function formatScores(row: AnalyzerRepeatRow): string {
  const values = row.repeats.map(repeat => repeat.score == null ? 'error' : `${repeat.score}${repeat.grade ? `/${repeat.grade}` : ''}`);
  return values.join(', ') || 'n/a';
}

export function renderNativeAnalyzerRepeatAttributionMarkdown(diagnostic: NativeAnalyzerRepeatAttributionDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Original-50 Native Analyzer Repeat Attribution');
  lines.push('');
  lines.push(`Generated: ${diagnostic.generatedAt}`);
  lines.push(`Target score: ${diagnostic.targetScore}`);
  lines.push(`Repeats: ${diagnostic.repeatCount}`);
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  lines.push(`Decision: \`${diagnostic.decision.status}\``);
  lines.push(`Next lane: \`${diagnostic.decision.nextLane}\``);
  for (const reason of diagnostic.decision.reasons) lines.push(`- ${reason}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`Rows: ${diagnostic.summary.rowCount}`);
  lines.push(`Blockers: ${diagnostic.summary.blockerCount}`);
  lines.push('');
  lines.push('| Class | Count |');
  lines.push('| --- | ---: |');
  for (const klass of CLASSES) lines.push(`| \`${klass}\` | ${diagnostic.summary.byClass[klass]} |`);
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push('| Row | Scores | Class | Category Deltas | Detection Deltas | Snapshot Deltas |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of diagnostic.rows) {
    lines.push(`| \`${row.key}\` | ${formatScores(row)} | \`${row.classification}\` | ${formatDeltaSummary(row.categoryDeltas, 3)} | ${formatDeltaSummary(row.detectionDeltas, 3)} | ${formatDeltaSummary(row.snapshotDeltas, 3)} |`);
  }

  for (const row of diagnostic.rows) {
    lines.push('');
    lines.push(`### ${row.key}`);
    lines.push('');
    lines.push(`PDF: \`${row.pdfPath}\``);
    lines.push(`Classification: \`${row.classification}\``);
    lines.push(`Recommended next: \`${row.recommendedNext}\``);
    for (const reason of row.reasons) lines.push(`- ${reason}`);
    lines.push(`- Score range: ${row.scoreRange ? `${row.scoreRange[0]}..${row.scoreRange[1]}` : 'n/a'}`);
    lines.push(`- Category deltas: ${formatDeltaSummary(row.categoryDeltas)}`);
    lines.push(`- Detection deltas: ${formatDeltaSummary(row.detectionDeltas)}`);
    lines.push(`- Snapshot deltas: ${formatDeltaSummary(row.snapshotDeltas)}`);
    lines.push('');
    lines.push('| Repeat | Score | Runtime ms | Error |');
    lines.push('| ---: | ---: | ---: | --- |');
    for (const repeat of row.repeats) {
      lines.push(`| ${repeat.index} | ${repeat.score ?? 'n/a'}${repeat.grade ? `/${repeat.grade}` : ''} | ${repeat.wallMs == null ? 'n/a' : Math.round(repeat.wallMs)} | ${repeat.error ?? ''} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function writeNativeAnalyzerRepeatAttributionDiagnostic(args: Args): Promise<NativeAnalyzerRepeatAttributionDiagnostic> {
  const outDir = resolve(args.outDir);
  const rows: Array<{ key: string; pdfPath: string; filename: string; repeats: AnalyzerRepeatSummary[] }> = [];
  for (const pdf of args.pdfs) {
    const pdfPath = resolve(pdf.path);
    const filename = basename(pdfPath);
    const repeats: AnalyzerRepeatSummary[] = [];
    for (let index = 1; index <= args.repeats; index += 1) {
      process.stdout.write(`[${pdf.key}] analyze repeat ${index}/${args.repeats} ... `);
      const repeat = await analyzeRepeat(pdfPath, filename, index, args.timeoutMs);
      repeats.push(repeat);
      console.log(repeat.ok ? `${repeat.score}/${repeat.grade}` : `error: ${repeat.error}`);
    }
    rows.push({ key: pdf.key, pdfPath, filename, repeats });
  }

  await mkdir(outDir, { recursive: true });
  const diagnostic = buildNativeAnalyzerRepeatAttributionDiagnostic({
    outDir,
    targetScore: args.targetScore,
    repeatCount: args.repeats,
    rows,
  });
  await writeFile(join(outDir, 'original50-native-analyzer-repeat-attribution.json'), JSON.stringify(diagnostic, null, 2), 'utf8');
  await writeFile(join(outDir, 'original50-native-analyzer-repeat-attribution.md'), renderNativeAnalyzerRepeatAttributionMarkdown(diagnostic), 'utf8');
  return diagnostic;
}

async function main() {
  const args = parseArgs();
  const diagnostic = await writeNativeAnalyzerRepeatAttributionDiagnostic(args);
  console.log(`Wrote ${join(resolve(args.outDir), 'original50-native-analyzer-repeat-attribution.md')}`);
  console.log(`Decision: ${diagnostic.decision.status}`);
  console.log(`Rows: ${diagnostic.summary.rowCount}; blockers: ${diagnostic.summary.blockerCount}`);
}

const isMain = process.argv[1] ? basename(process.argv[1]) === 'original50-native-analyzer-repeat-attribution.ts' : false;
if (isMain) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
