#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { extractWithPdfjs } from '../src/services/pdfjsService.js';
import { extractStructure } from '../src/services/structureService.js';
import type { AnalysisResult, DetectionProfile, DocumentSnapshot, PdfjsResult, PythonAnalysisResult } from '../src/types.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const DEFAULT_TARGET_SCORE = 93;
const DEFAULT_REPEATS = 3;

export type ExtractionBoundaryClass =
  | 'pdfjs_extraction_volatile'
  | 'python_structure_extraction_volatile'
  | 'merge_or_scorer_volatile'
  | 'full_analyzer_stable_low'
  | 'full_analyzer_stable_clear'
  | 'phase_error'
  | 'no_behavior_ready';

export type ExtractionBoundaryDecision =
  | 'fix_or_park_pdfjs_extraction_before_behavior'
  | 'fix_or_park_python_structure_extraction_before_behavior'
  | 'fix_or_park_merge_or_scorer_before_behavior'
  | 'move_to_row_failure_shape_or_park'
  | 'original50_route_ready_for_table_reopen'
  | 'collect_successful_boundary_repeats'
  | 'no_behavior_ready';

export interface DeltaValue {
  key: string;
  min: number | boolean | string | null;
  max: number | boolean | string | null;
  delta: number | null;
}

interface PhaseSummary {
  ok: boolean;
  error: string | null;
  wallMs: number | null;
  signals: Record<string, number | boolean | string | null>;
}

interface AnalyzePhaseSummary extends PhaseSummary {
  score: number | null;
  grade: string | null;
  categories: Record<string, number>;
  detectionSignals: Record<string, number | boolean | string | null>;
  snapshotSignals: Record<string, number | boolean | string | null>;
}

export interface BoundaryRepeatSummary {
  index: number;
  pdfjs: PhaseSummary;
  structure: PhaseSummary;
  analyze: AnalyzePhaseSummary;
}

export interface BoundaryRow {
  key: string;
  pdfPath: string;
  filename: string;
  repeats: BoundaryRepeatSummary[];
  scoreRange: [number, number] | null;
  scoreDelta: number | null;
  pdfjsDeltas: DeltaValue[];
  structureDeltas: DeltaValue[];
  analyzeCategoryDeltas: DeltaValue[];
  analyzeDetectionDeltas: DeltaValue[];
  analyzeSnapshotDeltas: DeltaValue[];
  classification: ExtractionBoundaryClass;
  reasons: string[];
  recommendedNext: string;
}

export interface ExtractionBoundaryDiagnostic {
  generatedAt: string;
  outDir: string;
  targetScore: number;
  repeatCount: number;
  inputs: Array<{ key: string; pdfPath: string; filename: string }>;
  summary: {
    rowCount: number;
    blockerCount: number;
    byClass: Record<ExtractionBoundaryClass, number>;
  };
  decision: {
    status: ExtractionBoundaryDecision;
    reasons: string[];
    nextLane: string;
  };
  rows: BoundaryRow[];
}

interface Args {
  pdfs: Array<{ key: string; path: string }>;
  repeats: number;
  outDir: string;
  targetScore: number;
  timeoutMs?: number;
}

const CLASSES: ExtractionBoundaryClass[] = [
  'pdfjs_extraction_volatile',
  'python_structure_extraction_volatile',
  'merge_or_scorer_volatile',
  'full_analyzer_stable_low',
  'full_analyzer_stable_clear',
  'phase_error',
  'no_behavior_ready',
];

const DETECTION_SIGNAL_PATHS: Array<{ key: string; path: string[] }> = [
  { key: 'heading.extractedHeadingCount', path: ['headingSignals', 'extractedHeadingCount'] },
  { key: 'heading.treeHeadingCount', path: ['headingSignals', 'treeHeadingCount'] },
  { key: 'heading.headingTreeDepth', path: ['headingSignals', 'headingTreeDepth'] },
  { key: 'figure.extractedFigureCount', path: ['figureSignals', 'extractedFigureCount'] },
  { key: 'figure.treeFigureCount', path: ['figureSignals', 'treeFigureCount'] },
  { key: 'figure.checkerVisibleFigureCount', path: ['figureSignals', 'checkerVisibleFigureCount'] },
  { key: 'table.irregularTableCount', path: ['tableSignals', 'irregularTableCount'] },
  { key: 'table.stronglyIrregularTableCount', path: ['tableSignals', 'stronglyIrregularTableCount'] },
  { key: 'table.directCellUnderTableCount', path: ['tableSignals', 'directCellUnderTableCount'] },
  { key: 'pdfua.orphanMcidCount', path: ['pdfUaSignals', 'orphanMcidCount'] },
  { key: 'reading.sampledStructurePageOrderDriftCount', path: ['readingOrderSignals', 'sampledStructurePageOrderDriftCount'] },
  { key: 'reading.multiColumnOrderRiskPages', path: ['readingOrderSignals', 'multiColumnOrderRiskPages'] },
];

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original50-extraction-boundary-attribution.ts --pdf <id=path> [options]

Options:
  --pdf <id=path>                    PDF to repeat at each extraction boundary. Repeatable.
  --repeats <n>                      Repeat count, 1-6. Default: ${DEFAULT_REPEATS}.
  --out <dir>                        Output directory.
  --target-score <n>                 Gate target score. Default: ${DEFAULT_TARGET_SCORE}.
  --timeout-ms <n>                   Optional per-phase timeout.
  --help                             Show this help.

This script runs native extraction/analyze diagnostics only. It does not remediate PDFs, write remediated PDFs, call ODL/PAC/POC/Java, or use semantic/LLM behavior.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  const pdfs: Array<{ key: string; path: string }> = [];
  let repeats = DEFAULT_REPEATS;
  let outDir = join(DEFAULT_OUT_ROOT, `original50-extraction-boundary-attribution-${timestampSlug(now)}`);
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
      repeats = Math.max(1, Math.min(6, value));
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

function categoryMap(result: AnalysisResult): Record<string, number> {
  return Object.fromEntries(result.categories.map(category => [category.key, category.score]));
}

function pdfjsSignals(result: PdfjsResult): Record<string, number | boolean | string | null> {
  return {
    pageCount: result.pageCount,
    textCharCount: result.textCharCount,
    textPageCount: result.textByPage.length,
    imageOnlyPageCount: result.imageOnlyPageCount,
    linkCount: result.links.length,
    formFieldCount: result.formFields.length,
    layoutHeadingCandidateCount: result.layoutAudit?.layoutHeadingCandidateCount ?? null,
    captionCandidateCount: result.layoutAudit?.captionCandidateCount ?? null,
    layoutTableCandidateCount: result.layoutAudit?.layoutTableCandidateCount ?? null,
    denseRowBandTableCandidateCount: result.layoutAudit?.denseRowBandTableCandidateCount ?? null,
  };
}

function structureSignals(result: PythonAnalysisResult): Record<string, number | boolean | string | null> {
  return {
    isTagged: result.isTagged,
    marked: result.markInfo?.Marked ?? null,
    headingCount: result.headings.length,
    figureCount: result.figures.length,
    checkerFigureTargetCount: result.checkerFigureTargets?.length ?? 0,
    tableCount: result.tables.length,
    bookmarkCount: result.bookmarks.length,
    formFieldCount: result.formFields.length,
    paragraphStructElemCount: result.paragraphStructElems?.length ?? 0,
    orphanMcidCount: result.orphanMcids?.length ?? 0,
    mcidTextSpanCount: result.mcidTextSpans?.length ?? 0,
    nativeTitleBtCandidateCount: result.nativeTitleBtCandidates?.length ?? 0,
    rootReachableHeadingCount: result.structureDebug?.rootReachableHeadingCount ?? null,
    rootReachableDepth: result.structureDebug?.rootReachableDepth ?? null,
    taggedContentAuditOrphanMcidCount: result.taggedContentAudit?.orphanMcidCount ?? null,
    tableHeaderAssociationMissingCount: result.tableHeaderAudit?.headerAssociationMissingCount ?? null,
    tableDataCellsWithoutHeaderCount: result.tableHeaderAudit?.dataCellsWithoutHeaderCount ?? null,
    tableOrphanHeaderCellCount: result.tableHeaderAudit?.orphanHeaderCellCount ?? null,
    structureInvalidChildRoleCount: result.structureSyntaxAudit?.invalidChildRoleCount ?? null,
    structureMissingParentCount: result.structureSyntaxAudit?.missingParentCount ?? null,
    structureWrongParentCount: result.structureSyntaxAudit?.wrongParentCount ?? null,
  };
}

function snapshotSignals(snapshot: DocumentSnapshot): Record<string, number | boolean | string | null> {
  return {
    headingCount: snapshot.headings.length,
    figureCount: snapshot.figures.length,
    checkerFigureTargetCount: snapshot.checkerFigureTargets?.length ?? 0,
    tableCount: snapshot.tables.length,
    paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
    orphanMcidCount: snapshot.orphanMcids?.length ?? 0,
    mcidTextSpanCount: snapshot.mcidTextSpans?.length ?? 0,
    rootReachableHeadingCount: snapshot.structureDebug?.rootReachableHeadingCount ?? null,
    tableHeaderAssociationMissingCount: snapshot.tableHeaderAudit?.headerAssociationMissingCount ?? null,
    tableDataCellsWithoutHeaderCount: snapshot.tableHeaderAudit?.dataCellsWithoutHeaderCount ?? null,
    tableOrphanHeaderCellCount: snapshot.tableHeaderAudit?.orphanHeaderCellCount ?? null,
  };
}

function compareRepeatMaps<T extends number | boolean | string | null>(
  repeats: BoundaryRepeatSummary[],
  pick: (repeat: BoundaryRepeatSummary) => Record<string, T>,
  threshold: number,
): DeltaValue[] {
  const keys = new Set<string>();
  const valuesByRepeat = repeats.map(pick);
  for (const values of valuesByRepeat) {
    for (const key of Object.keys(values)) keys.add(key);
  }
  const out: DeltaValue[] = [];
  for (const key of [...keys].sort()) {
    const values = valuesByRepeat.map(values => values[key] ?? null);
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
    out.push({ key, min: first, max: values.find(value => value !== first) ?? null, delta: null });
  }
  return out;
}

function classifyRow(input: {
  repeats: BoundaryRepeatSummary[];
  scoreDelta: number | null;
  pdfjsDeltas: DeltaValue[];
  structureDeltas: DeltaValue[];
  analyzeCategoryDeltas: DeltaValue[];
  analyzeDetectionDeltas: DeltaValue[];
  analyzeSnapshotDeltas: DeltaValue[];
  targetScore: number;
}): Pick<BoundaryRow, 'classification' | 'reasons' | 'recommendedNext'> {
  if (input.repeats.some(repeat => !repeat.pdfjs.ok || !repeat.structure.ok || !repeat.analyze.ok)) {
    return {
      classification: 'phase_error',
      reasons: ['one or more extraction phases failed'],
      recommendedNext: 'inspect extractor errors before behavior work',
    };
  }
  const scores = input.repeats.map(repeat => repeat.analyze.score).filter((score): score is number => typeof score === 'number');
  if (input.pdfjsDeltas.length > 0) {
    return {
      classification: 'pdfjs_extraction_volatile',
      reasons: [`pdf.js boundary has ${input.pdfjsDeltas.length} varying signal(s)`],
      recommendedNext: 'fix or park pdf.js extraction variance before behavior promotion',
    };
  }
  if (input.structureDeltas.length > 0) {
    return {
      classification: 'python_structure_extraction_volatile',
      reasons: [`Python structure boundary has ${input.structureDeltas.length} varying signal(s)`],
      recommendedNext: 'fix or park Python structure extraction variance before behavior promotion',
    };
  }
  const analyzeVolatile = (input.scoreDelta ?? 0) >= 10
    || input.analyzeCategoryDeltas.length > 0
    || input.analyzeDetectionDeltas.length > 0
    || input.analyzeSnapshotDeltas.length > 0;
  if (analyzeVolatile) {
    return {
      classification: 'merge_or_scorer_volatile',
      reasons: ['component boundaries are stable but full analyzer output varies'],
      recommendedNext: 'diagnose snapshot merge, detection, or scoring variance',
    };
  }
  if (scores.length > 0 && scores.every(score => score >= input.targetScore)) {
    return {
      classification: 'full_analyzer_stable_clear',
      reasons: ['all full analyzer repeats are stable and clear'],
      recommendedNext: 'no analyzer blocker for this row',
    };
  }
  if (scores.length > 0) {
    return {
      classification: 'full_analyzer_stable_low',
      reasons: ['full analyzer repeats are stable but below target'],
      recommendedNext: 'move to remediation failure-shape diagnostic with controls or park',
    };
  }
  return {
    classification: 'no_behavior_ready',
    reasons: ['no behavior-ready boundary evidence'],
    recommendedNext: 'park or collect more evidence',
  };
}

function countClasses(rows: BoundaryRow[]): Record<ExtractionBoundaryClass, number> {
  const out = Object.fromEntries(CLASSES.map(item => [item, 0])) as Record<ExtractionBoundaryClass, number>;
  for (const row of rows) out[row.classification] = (out[row.classification] ?? 0) + 1;
  return out;
}

function decide(rows: BoundaryRow[]): ExtractionBoundaryDiagnostic['decision'] {
  const counts = countClasses(rows);
  if (counts.pdfjs_extraction_volatile > 0) {
    return {
      status: 'fix_or_park_pdfjs_extraction_before_behavior',
      reasons: [`${counts.pdfjs_extraction_volatile} row(s) vary at pdf.js boundary`],
      nextLane: 'pdfjs_extraction_stability_or_parking',
    };
  }
  if (counts.python_structure_extraction_volatile > 0) {
    return {
      status: 'fix_or_park_python_structure_extraction_before_behavior',
      reasons: [`${counts.python_structure_extraction_volatile} row(s) vary at Python structure boundary`],
      nextLane: 'python_structure_extraction_stability_or_parking',
    };
  }
  if (counts.merge_or_scorer_volatile > 0) {
    return {
      status: 'fix_or_park_merge_or_scorer_before_behavior',
      reasons: [`${counts.merge_or_scorer_volatile} row(s) vary after stable extractor boundaries`],
      nextLane: 'merge_detection_scorer_stability_or_parking',
    };
  }
  if (counts.phase_error > 0) {
    return {
      status: 'collect_successful_boundary_repeats',
      reasons: [`${counts.phase_error} row(s) had phase errors`],
      nextLane: 'extractor_error_attribution',
    };
  }
  if (rows.length > 0 && rows.every(row => row.classification === 'full_analyzer_stable_clear')) {
    return {
      status: 'original50_route_ready_for_table_reopen',
      reasons: ['all selected boundary repeats are stable and clear'],
      nextLane: 'reopen_strict_object_backed_table_lanes',
    };
  }
  if (counts.full_analyzer_stable_low > 0) {
    return {
      status: 'move_to_row_failure_shape_or_park',
      reasons: [`${counts.full_analyzer_stable_low} row(s) are stable low after boundary attribution`],
      nextLane: 'remediation_failure_shape_diagnostic_with_controls',
    };
  }
  return {
    status: 'no_behavior_ready',
    reasons: ['no boundary evidence supports behavior promotion'],
    nextLane: 'park_or_collect_more_evidence',
  };
}

async function runPhase<T>(
  label: string,
  fn: () => Promise<T>,
  map: (value: T) => Record<string, number | boolean | string | null>,
): Promise<PhaseSummary> {
  const started = performance.now();
  try {
    const value = await fn();
    return {
      ok: true,
      error: null,
      wallMs: performance.now() - started,
      signals: map(value),
    };
  } catch (error) {
    return {
      ok: false,
      error: `${label}: ${error instanceof Error ? error.message : String(error)}`,
      wallMs: performance.now() - started,
      signals: {},
    };
  }
}

async function analyzePhase(pdfPath: string, filename: string, timeoutMs?: number): Promise<AnalyzePhaseSummary> {
  const started = performance.now();
  try {
    const analyzed = await analyzePdf(pdfPath, filename, {
      bypassCache: true,
      ...(timeoutMs ? { timeoutMs } : {}),
    });
    return {
      ok: true,
      error: null,
      wallMs: performance.now() - started,
      signals: {},
      score: analyzed.result.score,
      grade: analyzed.result.grade,
      categories: categoryMap(analyzed.result),
      detectionSignals: detectionSignalMap(analyzed.result.detectionProfile),
      snapshotSignals: snapshotSignals(analyzed.snapshot),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      wallMs: performance.now() - started,
      signals: {},
      score: null,
      grade: null,
      categories: {},
      detectionSignals: {},
      snapshotSignals: {},
    };
  }
}

async function runRepeat(pdfPath: string, filename: string, index: number, timeoutMs?: number): Promise<BoundaryRepeatSummary> {
  const pdfjs = await runPhase(
    'pdfjs',
    () => extractWithPdfjs(pdfPath, timeoutMs ? { timeoutMs } : undefined),
    pdfjsSignals,
  );
  const structure = await runPhase(
    'structure',
    () => extractStructure(pdfPath, timeoutMs ? { timeoutMs } : undefined),
    structureSignals,
  );
  const analyze = await analyzePhase(pdfPath, filename, timeoutMs);
  return { index, pdfjs, structure, analyze };
}

export function buildExtractionBoundaryDiagnostic(input: {
  generatedAt?: string;
  outDir: string;
  targetScore?: number;
  repeatCount: number;
  rows: Array<{ key: string; pdfPath: string; filename: string; repeats: BoundaryRepeatSummary[] }>;
}): ExtractionBoundaryDiagnostic {
  const targetScore = input.targetScore ?? DEFAULT_TARGET_SCORE;
  const rows = input.rows.map(row => {
    const scores = row.repeats
      .map(repeat => repeat.analyze.score)
      .filter((score): score is number => typeof score === 'number');
    const scoreRange: [number, number] | null = scores.length ? [Math.min(...scores), Math.max(...scores)] : null;
    const scoreDelta = scoreRange ? scoreRange[1] - scoreRange[0] : null;
    const pdfjsDeltas = compareRepeatMaps(row.repeats, repeat => repeat.pdfjs.signals, 2);
    const structureDeltas = compareRepeatMaps(row.repeats, repeat => repeat.structure.signals, 2);
    const analyzeCategoryDeltas = compareRepeatMaps(row.repeats, repeat => repeat.analyze.categories, 4);
    const analyzeDetectionDeltas = compareRepeatMaps(row.repeats, repeat => repeat.analyze.detectionSignals, 3);
    const analyzeSnapshotDeltas = compareRepeatMaps(row.repeats, repeat => repeat.analyze.snapshotSignals, 3);
    const classified = classifyRow({
      repeats: row.repeats,
      scoreDelta,
      pdfjsDeltas,
      structureDeltas,
      analyzeCategoryDeltas,
      analyzeDetectionDeltas,
      analyzeSnapshotDeltas,
      targetScore,
    });
    return {
      key: row.key,
      pdfPath: row.pdfPath,
      filename: row.filename,
      repeats: row.repeats,
      scoreRange,
      scoreDelta,
      pdfjsDeltas,
      structureDeltas,
      analyzeCategoryDeltas,
      analyzeDetectionDeltas,
      analyzeSnapshotDeltas,
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
      blockerCount: rows.filter(row => row.classification !== 'full_analyzer_stable_clear').length,
      byClass: countClasses(rows),
    },
    decision: {
      ...decide(rows),
    },
    rows,
  };
}

function formatDeltaSummary(deltas: DeltaValue[], limit = 6): string {
  if (deltas.length === 0) return 'none';
  return deltas.slice(0, limit).map(delta => `${delta.key} ${delta.min}->${delta.max}`).join(', ');
}

function formatScores(row: BoundaryRow): string {
  return row.repeats.map(repeat => repeat.analyze.score == null ? 'error' : `${repeat.analyze.score}${repeat.analyze.grade ? `/${repeat.analyze.grade}` : ''}`).join(', ');
}

export function renderExtractionBoundaryMarkdown(diagnostic: ExtractionBoundaryDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Original-50 Extraction Boundary Attribution');
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
  lines.push('| Row | Scores | Class | pdf.js Deltas | Python Deltas | Full Analyzer Deltas |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of diagnostic.rows) {
    const full = [
      formatDeltaSummary(row.analyzeCategoryDeltas, 2),
      formatDeltaSummary(row.analyzeDetectionDeltas, 2),
      formatDeltaSummary(row.analyzeSnapshotDeltas, 2),
    ].filter(item => item !== 'none').join('; ') || 'none';
    lines.push(`| \`${row.key}\` | ${formatScores(row)} | \`${row.classification}\` | ${formatDeltaSummary(row.pdfjsDeltas, 3)} | ${formatDeltaSummary(row.structureDeltas, 3)} | ${full} |`);
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
    lines.push(`- pdf.js deltas: ${formatDeltaSummary(row.pdfjsDeltas)}`);
    lines.push(`- Python structure deltas: ${formatDeltaSummary(row.structureDeltas)}`);
    lines.push(`- Full analyzer category deltas: ${formatDeltaSummary(row.analyzeCategoryDeltas)}`);
    lines.push(`- Full analyzer detection deltas: ${formatDeltaSummary(row.analyzeDetectionDeltas)}`);
    lines.push(`- Full analyzer snapshot deltas: ${formatDeltaSummary(row.analyzeSnapshotDeltas)}`);
    lines.push('');
    lines.push('| Repeat | pdf.js ms | Python ms | Analyze score | Analyze ms | Phase errors |');
    lines.push('| ---: | ---: | ---: | ---: | ---: | --- |');
    for (const repeat of row.repeats) {
      const errors = [repeat.pdfjs.error, repeat.structure.error, repeat.analyze.error].filter(Boolean).join('; ');
      lines.push(`| ${repeat.index} | ${repeat.pdfjs.wallMs == null ? 'n/a' : Math.round(repeat.pdfjs.wallMs)} | ${repeat.structure.wallMs == null ? 'n/a' : Math.round(repeat.structure.wallMs)} | ${repeat.analyze.score ?? 'n/a'}${repeat.analyze.grade ? `/${repeat.analyze.grade}` : ''} | ${repeat.analyze.wallMs == null ? 'n/a' : Math.round(repeat.analyze.wallMs)} | ${errors} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function writeExtractionBoundaryDiagnostic(args: Args): Promise<ExtractionBoundaryDiagnostic> {
  const outDir = resolve(args.outDir);
  const rows: Array<{ key: string; pdfPath: string; filename: string; repeats: BoundaryRepeatSummary[] }> = [];
  for (const pdf of args.pdfs) {
    const pdfPath = resolve(pdf.path);
    const filename = basename(pdfPath);
    const repeats: BoundaryRepeatSummary[] = [];
    for (let index = 1; index <= args.repeats; index += 1) {
      process.stdout.write(`[${pdf.key}] boundary repeat ${index}/${args.repeats} ... `);
      const repeat = await runRepeat(pdfPath, filename, index, args.timeoutMs);
      repeats.push(repeat);
      const phaseStatus = [
        repeat.pdfjs.ok ? 'pdfjs=ok' : 'pdfjs=error',
        repeat.structure.ok ? 'structure=ok' : 'structure=error',
        repeat.analyze.ok ? `analyze=${repeat.analyze.score}/${repeat.analyze.grade}` : 'analyze=error',
      ].join(' ');
      console.log(phaseStatus);
    }
    rows.push({ key: pdf.key, pdfPath, filename, repeats });
  }

  await mkdir(outDir, { recursive: true });
  const diagnostic = buildExtractionBoundaryDiagnostic({
    outDir,
    targetScore: args.targetScore,
    repeatCount: args.repeats,
    rows,
  });
  await writeFile(join(outDir, 'original50-extraction-boundary-attribution.json'), JSON.stringify(diagnostic, null, 2), 'utf8');
  await writeFile(join(outDir, 'original50-extraction-boundary-attribution.md'), renderExtractionBoundaryMarkdown(diagnostic), 'utf8');
  return diagnostic;
}

async function main() {
  const args = parseArgs();
  const diagnostic = await writeExtractionBoundaryDiagnostic(args);
  console.log(`Wrote ${join(resolve(args.outDir), 'original50-extraction-boundary-attribution.md')}`);
  console.log(`Decision: ${diagnostic.decision.status}`);
  console.log(`Rows: ${diagnostic.summary.rowCount}; blockers: ${diagnostic.summary.blockerCount}`);
}

const isMain = process.argv[1] ? basename(process.argv[1]) === 'original50-extraction-boundary-attribution.ts' : false;
if (isMain) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
