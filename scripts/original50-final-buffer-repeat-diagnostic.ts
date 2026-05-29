#!/usr/bin/env tsx
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  REMEDIATION_ANALYSIS_TIMEOUT_MS,
  REMEDIATION_PDF_TIMEOUT_MS,
} from '../src/config.js';
import { initSchema } from '../src/db/schema.js';
import {
  defaultExperimentCorpusPaths,
  loadExperimentCorpusManifest,
  type ExperimentCorpusEntry,
} from '../src/services/benchmark/experimentCorpus.js';
import { createPlaybookStore } from '../src/services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../src/services/learning/toolOutcomes.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { remediatePdf, type RemediationRuntimeTraceEvent } from '../src/services/remediation/orchestrator.js';
import type { AnalysisResult, DetectionProfile, DocumentSnapshot } from '../src/types.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const DEFAULT_TARGET_SCORE = 93;
const DEFAULT_REPEATS = 3;

export type FinalBufferRepeatClass =
  | 'after_state_preserved_by_final_buffer'
  | 'after_state_not_reproducible_from_final_buffer'
  | 'final_buffer_reanalysis_volatile'
  | 'stable_low_after_and_final'
  | 'final_reanalysis_recovers_route'
  | 'runtime_or_analysis_error'
  | 'no_behavior_ready';

export type FinalBufferRepeatDecision =
  | 'original50_route_ready_for_table_reopen'
  | 'diagnose_final_buffer_analyzer_variance'
  | 'move_to_row_failure_shape_or_park'
  | 'collect_more_final_buffer_repeats'
  | 'no_behavior_ready';

interface CategoryScore {
  key: string;
  score: number;
}

export interface DeltaValue {
  key: string;
  left: number | boolean | string | null;
  right: number | boolean | string | null;
  delta: number | null;
}

interface ResolvedInput {
  key: string;
  pdfPath: string;
  filename: string;
  manifestId?: string;
}

interface FinalRepeatSummary {
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

interface RowReport {
  key: string;
  pdfPath: string;
  filename: string;
  beforeScore: number | null;
  beforeGrade: string | null;
  afterScore: number | null;
  afterGrade: string | null;
  remediationWallMs: number | null;
  appliedToolCount: number;
  firstTools: Array<{
    stage: number | null;
    toolName: string;
    outcome: string;
    scoreBefore: number | null;
    scoreAfter: number | null;
  }>;
  finalRepeats: FinalRepeatSummary[];
  finalScoreRange: [number, number] | null;
  finalScoreDelta: number | null;
  afterToBestFinalCategoryDeltas: DeltaValue[];
  afterToWorstFinalCategoryDeltas: DeltaValue[];
  finalRepeatCategoryDeltas: DeltaValue[];
  finalRepeatDetectionDeltas: DeltaValue[];
  finalRepeatSnapshotDeltas: DeltaValue[];
  runtimeTraceSummary: {
    toolStarts: number;
    toolFinishes: number;
    liveAnalysisStarts: number;
    stageReanalysisStarts: number;
    verifiedCheckpoints: number;
    lastPhase: string | null;
  };
  classification: FinalBufferRepeatClass;
  reasons: string[];
  recommendedNext: string;
}

interface DiagnosticReport {
  generatedAt: string;
  outDir: string;
  targetScore: number;
  repeatCount: number;
  inputs: ResolvedInput[];
  summary: {
    rowCount: number;
    blockerCount: number;
    byClass: Record<FinalBufferRepeatClass, number>;
  };
  decision: {
    status: FinalBufferRepeatDecision;
    reasons: string[];
    nextLane: string;
  };
  rows: RowReport[];
}

interface Args {
  manifestPath: string;
  files: string[];
  pdfs: Array<{ key: string; path: string }>;
  repeats: number;
  outDir: string;
  targetScore: number;
  maxRounds: number;
}

const CLASSES: FinalBufferRepeatClass[] = [
  'after_state_preserved_by_final_buffer',
  'after_state_not_reproducible_from_final_buffer',
  'final_buffer_reanalysis_volatile',
  'stable_low_after_and_final',
  'final_reanalysis_recovers_route',
  'runtime_or_analysis_error',
  'no_behavior_ready',
];

const DETECTION_SIGNAL_PATHS: Array<{ key: string; path: string[] }> = [
  { key: 'heading.extractedHeadingCount', path: ['headingSignals', 'extractedHeadingCount'] },
  { key: 'heading.treeHeadingCount', path: ['headingSignals', 'treeHeadingCount'] },
  { key: 'heading.headingTreeDepth', path: ['headingSignals', 'headingTreeDepth'] },
  { key: 'figure.extractedFigureCount', path: ['figureSignals', 'extractedFigureCount'] },
  { key: 'figure.treeFigureCount', path: ['figureSignals', 'treeFigureCount'] },
  { key: 'figure.checkerVisibleFigureCount', path: ['figureSignals', 'checkerVisibleFigureCount'] },
  { key: 'figure.checkerVisibleFigureAltCount', path: ['figureSignals', 'checkerVisibleFigureAltCount'] },
  { key: 'table.tableCount', path: ['tableSignals', 'tableCount'] },
  { key: 'table.irregularTableCount', path: ['tableSignals', 'irregularTableCount'] },
  { key: 'table.stronglyIrregularTableCount', path: ['tableSignals', 'stronglyIrregularTableCount'] },
  { key: 'table.headerlessTableCount', path: ['tableSignals', 'headerlessTableCount'] },
  { key: 'table.directCellUnderTableCount', path: ['tableSignals', 'directCellUnderTableCount'] },
  { key: 'pdfua.orphanMcidCount', path: ['pdfUaSignals', 'orphanMcidCount'] },
  { key: 'annotation.linkAnnotationsMissingStructure', path: ['annotationSignals', 'linkAnnotationsMissingStructure'] },
  { key: 'annotation.linkAnnotationsMissingStructParent', path: ['annotationSignals', 'linkAnnotationsMissingStructParent'] },
  { key: 'reading.sampledStructurePageOrderDriftCount', path: ['readingOrderSignals', 'sampledStructurePageOrderDriftCount'] },
  { key: 'reading.multiColumnOrderRiskPages', path: ['readingOrderSignals', 'multiColumnOrderRiskPages'] },
];

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original50-final-buffer-repeat-diagnostic.ts [options]

Options:
  --file <manifest-id-or-substring>  Original-50 manifest row to run. Repeatable.
  --pdf <id=path>                    Explicit PDF path. Repeatable.
  --manifest <path>                  Manifest path. Default: Input/experiment-corpus/manifest.json.
  --repeats <n>                      Final-buffer reanalysis repeats, 1-6. Default: ${DEFAULT_REPEATS}.
  --out <dir>                        Output directory.
  --target-score <n>                 Gate target score. Default: ${DEFAULT_TARGET_SCORE}.
  --max-rounds <n>                   Remediation max rounds. Default: 10.
  --help                             Show this help.

This diagnostic runs deterministic native remediation once, then repeatedly analyzes the same final buffer through temporary files that are deleted. It does not write remediated PDFs, call ODL/PAC/POC/Java, or use semantic/LLM behavior.`;
}

function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  const defaults = defaultExperimentCorpusPaths();
  let manifestPath = defaults.manifestPath;
  const files: string[] = [];
  const pdfs: Array<{ key: string; path: string }> = [];
  let repeats = DEFAULT_REPEATS;
  let outDir = join(DEFAULT_OUT_ROOT, `original50-final-buffer-repeat-${timestampSlug(now)}`);
  let targetScore = DEFAULT_TARGET_SCORE;
  let maxRounds = 10;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--file') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --file value\n${usage()}`);
      files.push(value);
      continue;
    }
    if (arg === '--pdf') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --pdf value\n${usage()}`);
      pdfs.push(parseLabelPath(value));
      continue;
    }
    if (arg === '--manifest') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --manifest value\n${usage()}`);
      manifestPath = resolve(value);
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
    if (arg === '--max-rounds') {
      const value = Number.parseInt(argv[++index] ?? '', 10);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid --max-rounds value\n${usage()}`);
      maxRounds = value;
      continue;
    }
    throw new Error(`Unknown argument ${arg}\n${usage()}`);
  }

  if (files.length === 0 && pdfs.length === 0) {
    throw new Error(`At least one --file or --pdf is required\n${usage()}`);
  }
  return { manifestPath, files, pdfs, repeats, outDir, targetScore, maxRounds };
}

function parseLabelPath(value: string): { key: string; path: string } {
  const index = value.indexOf('=');
  if (index === -1) {
    const path = resolve(value);
    return { key: basename(path).replace(/\.pdf$/i, ''), path };
  }
  return { key: value.slice(0, index), path: resolve(value.slice(index + 1)) };
}

async function resolveInputs(args: Args): Promise<ResolvedInput[]> {
  const out: ResolvedInput[] = [];
  const seen = new Set<string>();
  if (args.files.length) {
    const manifest = await loadExperimentCorpusManifest(args.manifestPath, { checkFiles: true });
    for (const query of args.files) {
      const matches = manifest.filter(entry => entry.id === query || entry.id.includes(query) || entry.file.includes(query));
      if (matches.length === 0) throw new Error(`No manifest row matched --file ${query}`);
      for (const entry of matches) {
        const key = entry.id;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(entryToInput(entry));
      }
    }
  }
  for (const pdf of args.pdfs) {
    const key = pdf.key;
    if (seen.has(key)) continue;
    seen.add(key);
    const path = resolve(pdf.path);
    out.push({ key, pdfPath: path, filename: basename(path) });
  }
  return out;
}

function entryToInput(entry: ExperimentCorpusEntry): ResolvedInput {
  return {
    key: entry.id,
    manifestId: entry.id,
    pdfPath: entry.absolutePath,
    filename: entry.filename,
  };
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

function categoryMap(categories: CategoryScore[] | AnalysisResult['categories']): Record<string, number> {
  return Object.fromEntries(categories.map(category => [category.key, category.score]));
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
    isTagged: snapshot.isTagged,
    headingCount: snapshot.headings.length,
    figureCount: snapshot.figures.length,
    checkerFigureTargetCount: snapshot.checkerFigureTargets?.length ?? 0,
    tableCount: snapshot.tables.length,
    paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
    orphanMcidCount: snapshot.orphanMcids?.length ?? 0,
    rootReachableHeadingCount: snapshot.structureDebug?.rootReachableHeadingCount ?? null,
    rootReachableDepth: snapshot.structureDebug?.rootReachableDepth ?? null,
    tableHeaderAssociationMissingCount: snapshot.tableHeaderAudit?.headerAssociationMissingCount ?? null,
    tableDataCellsWithoutHeaderCount: snapshot.tableHeaderAudit?.dataCellsWithoutHeaderCount ?? null,
    tableOrphanHeaderCellCount: snapshot.tableHeaderAudit?.orphanHeaderCellCount ?? null,
    structureInvalidChildRoleCount: snapshot.structureSyntaxAudit?.invalidChildRoleCount ?? null,
    structureMissingParentCount: snapshot.structureSyntaxAudit?.missingParentCount ?? null,
    structureWrongParentCount: snapshot.structureSyntaxAudit?.wrongParentCount ?? null,
  };
}

function compareMaps(
  left: Record<string, number | boolean | string | null>,
  right: Record<string, number | boolean | string | null>,
  threshold = 0,
): DeltaValue[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const out: DeltaValue[] = [];
  for (const key of [...keys].sort()) {
    const a = left[key] ?? null;
    const b = right[key] ?? null;
    if (typeof a === 'number' && typeof b === 'number') {
      const delta = b - a;
      if (Math.abs(delta) > threshold) out.push({ key, left: a, right: b, delta });
      continue;
    }
    if (a !== b) out.push({ key, left: a, right: b, delta: null });
  }
  return out;
}

function compareRepeatMaps(
  repeats: FinalRepeatSummary[],
  pick: (repeat: FinalRepeatSummary) => Record<string, number | boolean | string | null>,
  threshold = 0,
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
    const numeric = values.filter((value): value is number => typeof value === 'number');
    if (numeric.length === values.length) {
      const min = Math.min(...numeric);
      const max = Math.max(...numeric);
      const delta = max - min;
      if (delta > threshold) out.push({ key, left: min, right: max, delta });
    } else {
      out.push({ key, left: String(first), right: 'varies', delta: null });
    }
  }
  return out;
}

async function analyzeBufferRepeat(buffer: Buffer, filename: string, index: number): Promise<FinalRepeatSummary> {
  const dir = await mkdtemp(join(tmpdir(), 'pdfaf-final-buffer-repeat-'));
  const tempPath = join(dir, `${randomUUID()}.pdf`);
  await writeFile(tempPath, buffer);
  const started = performance.now();
  try {
    const analyzed = await analyzePdf(tempPath, filename, {
      bypassCache: true,
      timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS,
    });
    return {
      index,
      ok: true,
      error: null,
      score: analyzed.result.score,
      grade: analyzed.result.grade,
      wallMs: Math.round(performance.now() - started),
      analysisDurationMs: analyzed.result.analysisDurationMs,
      categories: categoryMap(analyzed.result.categories),
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
      wallMs: Math.round(performance.now() - started),
      analysisDurationMs: null,
      categories: {},
      detectionSignals: {},
      snapshotSignals: {},
    };
  } finally {
    await unlink(tempPath).catch(() => undefined);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function summarizeTrace(events: RemediationRuntimeTraceEvent[]): RowReport['runtimeTraceSummary'] {
  return {
    toolStarts: events.filter(event => event.kind === 'tool_start').length,
    toolFinishes: events.filter(event => event.kind === 'tool_finish').length,
    liveAnalysisStarts: events.filter(event => event.kind === 'live_analysis_start').length,
    stageReanalysisStarts: events.filter(event => event.kind === 'stage_reanalysis_start').length,
    verifiedCheckpoints: events.filter(event => event.kind === 'verified_checkpoint').length,
    lastPhase: events.at(-1)?.kind ?? null,
  };
}

export function classifyFinalBufferRow(input: {
  targetScore: number;
  beforeScore: number | null;
  afterScore: number | null;
  finalRepeats: FinalRepeatSummary[];
}): { classification: FinalBufferRepeatClass; reasons: string[]; recommendedNext: string } {
  const reasons: string[] = [];
  const successful = input.finalRepeats.filter(repeat => repeat.ok && typeof repeat.score === 'number');
  if (successful.length === 0) {
    return {
      classification: 'runtime_or_analysis_error',
      reasons: ['no successful final-buffer reanalysis repeat'],
      recommendedNext: 'diagnose runtime or analysis failure before behavior',
    };
  }

  const scores = successful.map(repeat => repeat.score as number);
  const minFinal = Math.min(...scores);
  const maxFinal = Math.max(...scores);
  const finalDelta = maxFinal - minFinal;
  const afterScore = input.afterScore;

  if (finalDelta >= 5) {
    reasons.push(`same final buffer reanalysis score varied ${minFinal}->${maxFinal}`);
    return {
      classification: 'final_buffer_reanalysis_volatile',
      reasons,
      recommendedNext: 'diagnose analyzer repeat instability on remediated final buffer',
    };
  }

  if (typeof afterScore === 'number' && afterScore >= input.targetScore && maxFinal < input.targetScore) {
    reasons.push(`in-memory after ${afterScore} does not reproduce from final buffer; best final repeat ${maxFinal}`);
    return {
      classification: 'after_state_not_reproducible_from_final_buffer',
      reasons,
      recommendedNext: 'diagnose serialization/post-pass/analyzer boundary before accepting checkpoint behavior',
    };
  }

  if (typeof afterScore === 'number' && afterScore >= input.targetScore && minFinal >= input.targetScore) {
    reasons.push(`in-memory after ${afterScore} is preserved by final buffer repeats ${minFinal}->${maxFinal}`);
    return {
      classification: 'after_state_preserved_by_final_buffer',
      reasons,
      recommendedNext: 'row is not a final-buffer blocker in this sample',
    };
  }

  if (typeof afterScore === 'number' && afterScore < input.targetScore && maxFinal >= input.targetScore) {
    reasons.push(`final-buffer reanalysis recovers target route ${maxFinal} from after ${afterScore}`);
    return {
      classification: 'final_reanalysis_recovers_route',
      reasons,
      recommendedNext: 'diagnose route selection mismatch before behavior',
    };
  }

  if (typeof afterScore === 'number' && afterScore < input.targetScore && maxFinal < input.targetScore) {
    reasons.push(`after and final-buffer repeats remain below target; best final repeat ${maxFinal}`);
    return {
      classification: 'stable_low_after_and_final',
      reasons,
      recommendedNext: 'move to row failure-shape diagnostic or park no-safe-general-fix',
    };
  }

  return {
    classification: 'no_behavior_ready',
    reasons: ['insufficient score shape for promotion'],
    recommendedNext: 'collect more final-buffer repeats',
  };
}

async function runRow(input: ResolvedInput, args: Args): Promise<RowReport> {
  const buffer = await readFile(input.pdfPath);
  const initial = await analyzePdf(input.pdfPath, input.filename, {
    bypassCache: true,
    timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS,
  });
  const db = new Database(':memory:');
  initSchema(db);
  const traceEvents: RemediationRuntimeTraceEvent[] = [];
  const started = performance.now();
  try {
    const remediationSignal = REMEDIATION_PDF_TIMEOUT_MS > 0
      ? AbortSignal.timeout(REMEDIATION_PDF_TIMEOUT_MS)
      : undefined;
    const outcome = await remediatePdf(buffer, input.filename, initial.result, initial.snapshot, {
      maxRounds: args.maxRounds,
      ...(remediationSignal ? { signal: remediationSignal } : {}),
      playbookStore: createPlaybookStore(db),
      toolOutcomeStore: createToolOutcomeStore(db),
      onRuntimeTrace: event => {
        traceEvents.push(event);
      },
    });
    const finalRepeats: FinalRepeatSummary[] = [];
    for (let index = 1; index <= args.repeats; index += 1) {
      finalRepeats.push(await analyzeBufferRepeat(outcome.buffer, input.filename, index));
    }
    const scores = finalRepeats
      .map(repeat => repeat.score)
      .filter((score): score is number => typeof score === 'number');
    const finalScoreRange: [number, number] | null = scores.length ? [Math.min(...scores), Math.max(...scores)] : null;
    const bestFinal = finalRepeats
      .filter(repeat => typeof repeat.score === 'number')
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
    const worstFinal = finalRepeats
      .filter(repeat => typeof repeat.score === 'number')
      .sort((a, b) => (a.score ?? Number.POSITIVE_INFINITY) - (b.score ?? Number.POSITIVE_INFINITY))[0];
    const afterCategories = categoryMap(outcome.remediation.after.categories);
    const classified = classifyFinalBufferRow({
      targetScore: args.targetScore,
      beforeScore: outcome.remediation.before.score,
      afterScore: outcome.remediation.after.score,
      finalRepeats,
    });
    return {
      key: input.key,
      pdfPath: input.pdfPath,
      filename: input.filename,
      beforeScore: outcome.remediation.before.score,
      beforeGrade: outcome.remediation.before.grade,
      afterScore: outcome.remediation.after.score,
      afterGrade: outcome.remediation.after.grade,
      remediationWallMs: Math.round(performance.now() - started),
      appliedToolCount: outcome.remediation.appliedTools.filter(tool => tool.outcome === 'applied').length,
      firstTools: outcome.remediation.appliedTools.slice(0, 12).map(tool => ({
        stage: tool.stage ?? null,
        toolName: tool.toolName,
        outcome: tool.outcome,
        scoreBefore: tool.scoreBefore ?? null,
        scoreAfter: tool.scoreAfter ?? null,
      })),
      finalRepeats,
      finalScoreRange,
      finalScoreDelta: finalScoreRange ? finalScoreRange[1] - finalScoreRange[0] : null,
      afterToBestFinalCategoryDeltas: bestFinal ? compareMaps(afterCategories, bestFinal.categories, 0) : [],
      afterToWorstFinalCategoryDeltas: worstFinal ? compareMaps(afterCategories, worstFinal.categories, 0) : [],
      finalRepeatCategoryDeltas: compareRepeatMaps(finalRepeats, repeat => repeat.categories, 0),
      finalRepeatDetectionDeltas: compareRepeatMaps(finalRepeats, repeat => repeat.detectionSignals, 0),
      finalRepeatSnapshotDeltas: compareRepeatMaps(finalRepeats, repeat => repeat.snapshotSignals, 0),
      runtimeTraceSummary: summarizeTrace(traceEvents),
      classification: classified.classification,
      reasons: classified.reasons,
      recommendedNext: classified.recommendedNext,
    };
  } catch (error) {
    return {
      key: input.key,
      pdfPath: input.pdfPath,
      filename: input.filename,
      beforeScore: initial.result.score,
      beforeGrade: initial.result.grade,
      afterScore: null,
      afterGrade: null,
      remediationWallMs: Math.round(performance.now() - started),
      appliedToolCount: 0,
      firstTools: [],
      finalRepeats: [],
      finalScoreRange: null,
      finalScoreDelta: null,
      afterToBestFinalCategoryDeltas: [],
      afterToWorstFinalCategoryDeltas: [],
      finalRepeatCategoryDeltas: [],
      finalRepeatDetectionDeltas: [],
      finalRepeatSnapshotDeltas: [],
      runtimeTraceSummary: summarizeTrace(traceEvents),
      classification: 'runtime_or_analysis_error',
      reasons: [error instanceof Error ? error.message : String(error)],
      recommendedNext: 'diagnose runtime or analysis failure before behavior',
    };
  } finally {
    db.close();
  }
}

function buildDecision(rows: RowReport[]): DiagnosticReport['decision'] {
  const classes = new Set(rows.map(row => row.classification));
  const reasons: string[] = [];
  if (classes.has('final_buffer_reanalysis_volatile') || classes.has('after_state_not_reproducible_from_final_buffer')) {
    reasons.push('one or more rows have final-buffer analyzer variance or non-reproducible A-range after-state');
    return {
      status: 'diagnose_final_buffer_analyzer_variance',
      reasons,
      nextLane: 'final_buffer_analyzer_or_serialization_boundary',
    };
  }
  if (classes.has('runtime_or_analysis_error')) {
    reasons.push('one or more rows hit runtime or analysis errors');
    return {
      status: 'collect_more_final_buffer_repeats',
      reasons,
      nextLane: 'runtime_error_attribution',
    };
  }
  if (classes.has('stable_low_after_and_final')) {
    reasons.push('selected rows remain stable low after and final reanalysis');
    return {
      status: 'move_to_row_failure_shape_or_park',
      reasons,
      nextLane: 'row_failure_shape_or_no_safe_general_fix',
    };
  }
  if ([...classes].every(item => item === 'after_state_preserved_by_final_buffer')) {
    reasons.push('all selected rows preserve A-range after-state through final buffer repeats');
    return {
      status: 'original50_route_ready_for_table_reopen',
      reasons,
      nextLane: 'fresh_original50_gate_or_table_lane_reopen',
    };
  }
  reasons.push('no behavior-ready pattern from selected rows');
  return {
    status: 'no_behavior_ready',
    reasons,
    nextLane: 'collect_more_final_buffer_repeats',
  };
}

function renderDeltaList(items: DeltaValue[], limit = 5): string {
  if (items.length === 0) return 'none';
  return items.slice(0, limit).map(item => `${item.key} ${item.left}->${item.right}`).join(', ');
}

function renderMarkdown(report: DiagnosticReport): string {
  const lines: string[] = [];
  lines.push('# Original-50 Final Buffer Repeat Diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Target score: \`${report.targetScore}\``);
  lines.push(`Final-buffer repeats: \`${report.repeatCount}\``);
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  lines.push(`Decision: \`${report.decision.status}\``);
  lines.push(`Next lane: \`${report.decision.nextLane}\``);
  for (const reason of report.decision.reasons) lines.push(`- ${reason}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`Rows: \`${report.summary.rowCount}\``);
  lines.push(`Blockers: \`${report.summary.blockerCount}\``);
  lines.push('');
  lines.push('| Class | Count |');
  lines.push('| --- | ---: |');
  for (const klass of CLASSES) {
    lines.push(`| \`${klass}\` | ${report.summary.byClass[klass] ?? 0} |`);
  }
  lines.push('');
  lines.push('## Rows');
  lines.push('');
  lines.push('| Row | Before | After | Final repeats | Class | Top after->worst-final deltas | Repeat signal drift |');
  lines.push('| --- | ---: | ---: | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const final = row.finalRepeats.map(repeat => repeat.ok ? `${repeat.score}/${repeat.grade}` : `err:${repeat.error}`).join(', ');
    lines.push(`| \`${row.key}\` | ${row.beforeScore ?? 'n/a'}/${row.beforeGrade ?? 'n/a'} | ${row.afterScore ?? 'n/a'}/${row.afterGrade ?? 'n/a'} | ${final || 'none'} | \`${row.classification}\` | ${renderDeltaList(row.afterToWorstFinalCategoryDeltas)} | ${renderDeltaList(row.finalRepeatDetectionDeltas)} |`);
  }
  lines.push('');
  for (const row of report.rows) {
    lines.push(`### ${row.key}`);
    lines.push('');
    lines.push(`File: \`${row.filename}\``);
    lines.push(`Classification: \`${row.classification}\``);
    lines.push(`Recommended next: \`${row.recommendedNext}\``);
    for (const reason of row.reasons) lines.push(`- ${reason}`);
    lines.push(`- Remediation wall ms: \`${row.remediationWallMs ?? 'n/a'}\``);
    lines.push(`- Applied tool count: \`${row.appliedToolCount}\``);
    lines.push(`- Runtime trace: tool finishes \`${row.runtimeTraceSummary.toolFinishes}\`, live analyses \`${row.runtimeTraceSummary.liveAnalysisStarts}\`, stage reanalyses \`${row.runtimeTraceSummary.stageReanalysisStarts}\``);
    lines.push('');
    lines.push('| Repeat | Score | Wall ms | Category deltas vs after | Detection signals | Snapshot signals |');
    lines.push('| ---: | ---: | ---: | --- | --- | --- |');
    const afterCategories = row.finalRepeats[0] ? null : null;
    void afterCategories;
    for (const repeat of row.finalRepeats) {
      lines.push(`| ${repeat.index} | ${repeat.ok ? `${repeat.score}/${repeat.grade}` : `error`} | ${repeat.wallMs ?? 'n/a'} | ${renderDeltaList(row.afterToWorstFinalCategoryDeltas)} | ${renderDeltaList(row.finalRepeatDetectionDeltas)} | ${renderDeltaList(row.finalRepeatSnapshotDeltas)} |`);
    }
    lines.push('');
    if (row.firstTools.length) {
      lines.push('First tools:');
      for (const tool of row.firstTools) {
        lines.push(`- ${tool.stage ?? 'n/a'}:${tool.toolName}:${tool.outcome} ${tool.scoreBefore ?? 'n/a'}->${tool.scoreAfter ?? 'n/a'}`);
      }
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const inputs = await resolveInputs(args);
  await mkdir(args.outDir, { recursive: true });
  const rows: RowReport[] = [];
  for (const input of inputs) {
    console.log(`[${input.key}] ${input.filename} ...`);
    rows.push(await runRow(input, args));
    const row = rows.at(-1)!;
    console.log(`  after ${row.afterScore ?? 'n/a'}/${row.afterGrade ?? 'n/a'} final repeats ${row.finalRepeats.map(repeat => repeat.score ?? 'err').join(',')} class ${row.classification}`);
  }
  const byClass = Object.fromEntries(CLASSES.map(klass => [klass, 0])) as Record<FinalBufferRepeatClass, number>;
  for (const row of rows) byClass[row.classification] += 1;
  const report: DiagnosticReport = {
    generatedAt: new Date().toISOString(),
    outDir: args.outDir,
    targetScore: args.targetScore,
    repeatCount: args.repeats,
    inputs,
    summary: {
      rowCount: rows.length,
      blockerCount: rows.filter(row => row.classification !== 'after_state_preserved_by_final_buffer').length,
      byClass,
    },
    decision: buildDecision(rows),
    rows,
  };
  await writeFile(join(args.outDir, 'original50-final-buffer-repeat-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'original50-final-buffer-repeat-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${join(args.outDir, 'original50-final-buffer-repeat-diagnostic.md')}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
