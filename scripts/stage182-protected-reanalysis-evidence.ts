#!/usr/bin/env tsx
import 'dotenv/config';

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PYTHON_SCRIPT_PATH, PYTHON_TIMEOUT_MS } from '../src/config.js';
import {
  protectedReanalysisUnsafeReason,
  sha256Buffer,
  type ProtectedReanalysisBaseline,
} from '../src/services/benchmark/protectedReanalysisSelection.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult } from '../src/types.js';
import {
  type Stage128ExternalRepeat,
  type Stage128RawRepeat,
} from './stage128-protected-reanalysis-closeout.js';

type JsonRecord = Record<string, unknown>;

type EvidenceFamily =
  | 'headings'
  | 'tables'
  | 'figures'
  | 'checkerFigureTargets'
  | 'paragraphStructElems'
  | 'orphanMcids'
  | 'mcidTextSpans'
  | 'annotationAccessibility'
  | 'linkScoringRows';

interface CategoryRow {
  key: string;
  score: number;
}

export type Stage182Classification =
  | 'safe_checkpoint_available'
  | 'same_buffer_floor_safe_repeat_available'
  | 'same_buffer_analyzer_variance_floor_unsafe'
  | 'accepted_cleanup_harm'
  | 'stable_below_floor_no_safe_state';

export interface Stage182ToolRow {
  toolName?: string;
  outcome?: string;
  source?: string;
  stage?: number;
  round?: number;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  details?: unknown;
}

interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  file?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: CategoryRow[];
  reanalyzedScore?: number | null;
  reanalyzedGrade?: string | null;
  reanalyzedCategories?: CategoryRow[];
  afterScoreCapsApplied?: AnalysisResult['scoreCapsApplied'];
  reanalyzedScoreCapsApplied?: AnalysisResult['scoreCapsApplied'];
  protectedReanalysisSelection?: unknown;
  appliedTools?: Stage182ToolRow[];
}

interface ProtectedStateMetadata {
  rowId: string;
  file: string;
  reason: string;
  sequence: number;
  bufferSha256: string;
  score: number;
  grade: string;
  floorScore: number | null;
  floorReached: boolean;
  protectedRunSafe: boolean;
  appliedToolCount: number;
  categories: Record<string, number>;
}

interface BufferRepeatReport {
  label: string;
  pdfPath: string;
  bufferSha256: string;
  inRunScore: number | null;
  inRunGrade: string | null;
  metadata?: ProtectedStateMetadata;
  externalRepeats: Stage128ExternalRepeat[];
  rawRepeats: Stage128RawRepeat[];
}

interface TimelineRow {
  index: number;
  toolName: string;
  outcome: string;
  source: string | null;
  stage: number | null;
  round: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number | null;
  note: string | null;
  raw: string | null;
  replayStateBefore: string | null;
  replayStateAfter: string | null;
}

interface Stage182RowReport {
  id: string;
  file: string | null;
  classification: Stage182Classification;
  reasons: string[];
  acceptedCleanupHarmCandidates: TimelineRow[];
  localFontSubstitutionRows: TimelineRow[];
  baseline: {
    score: number | null;
    floorScore: number | null;
    categories: Record<string, number>;
  };
  stage180: {
    afterScore: number | null;
    reanalyzedScore: number | null;
    effectiveScore: number | null;
    protectedReanalysisSelection: unknown;
    categoryDeltas: Array<{ key: string; baseline: number; stage180: number; delta: number }>;
  };
  stage181: {
    afterScore: number | null;
    reanalyzedScore: number | null;
    effectiveScore: number | null;
    protectedReanalysisSelection: unknown;
    categoryDeltas: Array<{ key: string; baseline: number; stage181: number; delta: number }>;
  };
  target: {
    afterScore: number | null;
    reanalyzedScore: number | null;
    effectiveScore: number | null;
    protectedReanalysisSelection: unknown;
    categoryDeltas: Array<{ key: string; baseline: number; target: number; delta: number }>;
    acceptedTimeline: TimelineRow[];
    rejectedTimeline: TimelineRow[];
    rejectedPostPassRows: TimelineRow[];
    firstProtectedDrop: TimelineRow | null;
  };
  finalBuffer: BufferRepeatReport | null;
  checkpoints: BufferRepeatReport[];
}

const DEFAULT_BASELINE_RUN = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_STAGE180_RUN = 'Output/experiment-corpus-baseline/run-stage180-full-2026-05-02-r2';
const DEFAULT_STAGE181_RUN = 'Output/experiment-corpus-baseline/run-stage181-full-2026-05-02-r1';
const DEFAULT_TARGET_RUN = 'Output/experiment-corpus-baseline/run-stage182-target-protected-2026-05-02-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage182-protected-reanalysis-evidence-2026-05-02-r1';
const DEFAULT_IDS = [
  'structure-4076',
  'long-4516',
  'long-4680',
  'figure-4754',
  'font-4172',
  'font-4057',
  'short-4176',
  'short-4214',
  'font-4156',
  'font-4699',
];
const DEFAULT_REPEATS = 5;
const CORE_CATEGORIES = ['heading_structure', 'reading_order', 'alt_text', 'table_markup', 'link_quality', 'pdf_ua_compliance'];
const CLEANUP_TOOLS = new Set([
  'artifact_repeating_page_furniture',
  'canonicalize_figure_alt_ownership',
  'mark_untagged_content_as_artifact',
  'normalize_annotation_tab_order',
  'remap_orphan_mcids_as_artifacts',
  'repair_alt_text_structure',
  'repair_native_link_structure',
  'repair_structure_conformance',
  'set_document_language',
  'set_document_title',
  'set_pdfua_identification',
]);
const EVIDENCE_FAMILIES: EvidenceFamily[] = [
  'headings',
  'tables',
  'figures',
  'checkerFigureTargets',
  'paragraphStructElems',
  'orphanMcids',
  'mcidTextSpans',
  'annotationAccessibility',
  'linkScoringRows',
];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage182-protected-reanalysis-evidence.ts [options]',
    `  --baseline-run <dir>   Default: ${DEFAULT_BASELINE_RUN}`,
    `  --stage180-run <dir>   Default: ${DEFAULT_STAGE180_RUN}`,
    `  --stage181-run <dir>   Default: ${DEFAULT_STAGE181_RUN}`,
    `  --target-run <dir>     Run with --write-pdfs and --write-protected-debug-states (default: ${DEFAULT_TARGET_RUN})`,
    `  --out <dir>            Default: ${DEFAULT_OUT}`,
    `  --ids <csv>            Default: ${DEFAULT_IDS.join(',')}`,
    '  --repeats <n>          External/Python repeat count, capped at 5 (default: 5)',
  ].join('\n');
}

function parseArgs(argv: string[] = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'))): {
  baselineRun: string;
  stage180Run: string;
  stage181Run: string;
  targetRun: string;
  out: string;
  ids: string[];
  repeats: number;
} {
  const args = {
    baselineRun: DEFAULT_BASELINE_RUN,
    stage180Run: DEFAULT_STAGE180_RUN,
    stage181Run: DEFAULT_STAGE181_RUN,
    targetRun: DEFAULT_TARGET_RUN,
    out: DEFAULT_OUT,
    ids: DEFAULT_IDS,
    repeats: DEFAULT_REPEATS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--baseline-run') args.baselineRun = next;
    else if (arg === '--stage180-run') args.stage180Run = next;
    else if (arg === '--stage181-run' || arg === '--reference-run') args.stage181Run = next;
    else if (arg === '--target-run') args.targetRun = next;
    else if (arg === '--out') args.out = next;
    else if (arg === '--ids') args.ids = next.split(',').map(id => id.trim()).filter(Boolean);
    else if (arg === '--repeats') args.repeats = Math.max(1, Math.min(5, Number.parseInt(next, 10) || DEFAULT_REPEATS));
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  return args;
}

async function readRun(runDir: string): Promise<Map<string, BenchmarkRow>> {
  const rows = JSON.parse(await readFile(join(resolve(runDir), 'remediate.results.json'), 'utf8')) as BenchmarkRow[];
  return new Map(rows.map(row => [String(row.id ?? row.publicationId ?? ''), row]));
}

function categoryMap(categories: CategoryRow[] | AnalysisResult['categories'] | undefined): Record<string, number> {
  return Object.fromEntries((categories ?? []).map(category => [category.key, category.score]));
}

function effectiveScore(row?: BenchmarkRow): number | null {
  return typeof row?.reanalyzedScore === 'number' ? row.reanalyzedScore : typeof row?.afterScore === 'number' ? row.afterScore : null;
}

function effectiveCategories(row?: BenchmarkRow): Record<string, number> {
  return row?.reanalyzedCategories?.length ? categoryMap(row.reanalyzedCategories) : categoryMap(row?.afterCategories);
}

function baselineFor(row?: BenchmarkRow): ProtectedReanalysisBaseline | undefined {
  const score = effectiveScore(row);
  if (score == null) return undefined;
  return {
    score,
    scoreCapsApplied: row?.reanalyzedScoreCapsApplied?.length ? row.reanalyzedScoreCapsApplied : row?.afterScoreCapsApplied ?? [],
    categories: effectiveCategories(row),
  };
}

function categoryDeltas<T extends string>(
  baseline: Record<string, number>,
  candidate: Record<string, number>,
  candidateKey: T,
): Array<{ key: string; baseline: number } & Record<T, number> & { delta: number }> {
  return Object.entries(baseline)
    .flatMap(([key, baselineScore]) => {
      const candidateScore = candidate[key];
      if (typeof candidateScore !== 'number') return [];
      return [{ key, baseline: baselineScore, [candidateKey]: candidateScore, delta: candidateScore - baselineScore } as { key: string; baseline: number } & Record<T, number> & { delta: number }];
    })
    .filter(row => row.delta !== 0)
    .sort((a, b) => a.delta - b.delta || a.key.localeCompare(b.key));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as JsonRecord;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function signature(value: unknown): string {
  return createHash('sha1').update(stableStringify(value)).digest('hex').slice(0, 20);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function parseDetails(details: unknown): JsonRecord {
  if (!details) return {};
  if (details && typeof details === 'object' && !Array.isArray(details)) return details as JsonRecord;
  if (typeof details !== 'string') return {};
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { raw: details };
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return { raw: details };
  }
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function timeline(row?: BenchmarkRow): TimelineRow[] {
  return (row?.appliedTools ?? []).map((tool, index) => {
    const details = parseDetails(tool.details);
    const replay = asRecord(asRecord(details['debug']).replayState);
    return {
      index,
      toolName: tool.toolName ?? 'unknown',
      outcome: tool.outcome ?? 'unknown',
      source: str(tool.source),
      stage: num(tool.stage),
      round: num(tool.round),
      scoreBefore: num(tool.scoreBefore),
      scoreAfter: num(tool.scoreAfter),
      delta: num(tool.delta),
      note: str(details['note']),
      raw: str(details['raw']),
      replayStateBefore: str(replay['stateSignatureBefore']),
      replayStateAfter: str(replay['stateSignatureAfter']),
    };
  });
}

function firstProtectedDrop(row: BenchmarkRow | undefined, baseline: ProtectedReanalysisBaseline | undefined): TimelineRow | null {
  if (!baseline) return null;
  const floor = baseline.score - 2;
  return timeline(row).find(tool =>
    tool.scoreBefore != null &&
    tool.scoreAfter != null &&
    tool.scoreBefore >= floor &&
    tool.scoreAfter < floor
  ) ?? null;
}

function evidenceArray(raw: JsonRecord, key: EvidenceFamily): unknown {
  if (key === 'annotationAccessibility') return raw['annotationAccessibility'] ?? null;
  return raw[key] ?? [];
}

function familyCounts(raw: JsonRecord): Partial<Record<EvidenceFamily, number>> {
  const out: Partial<Record<EvidenceFamily, number>> = {};
  for (const family of EVIDENCE_FAMILIES) {
    const evidence = evidenceArray(raw, family);
    out[family] = Array.isArray(evidence) ? evidence.length : evidence && typeof evidence === 'object' ? 1 : 0;
  }
  return out;
}

function familySignatures(raw: JsonRecord): Partial<Record<EvidenceFamily, string>> {
  const out: Partial<Record<EvidenceFamily, string>> = {};
  for (const family of EVIDENCE_FAMILIES) out[family] = signature(evidenceArray(raw, family));
  return out;
}

function categoryScoreMap(value: unknown): Record<string, number> {
  const record = asRecord(value);
  return Object.fromEntries(Object.entries(record).flatMap(([key, score]) => (
    typeof score === 'number' && Number.isFinite(score) ? [[key, score]] : []
  )));
}

function replayCategoryScores(tool: Stage182ToolRow, key: 'categoryScoresBefore' | 'categoryScoresAfter'): Record<string, number> {
  const details = parseDetails(tool.details);
  const replay = asRecord(asRecord(details['debug']).replayState);
  return categoryScoreMap(replay[key]);
}

function targetCategoryForTool(toolName: string): string | null {
  if (toolName.includes('alt') || toolName.includes('figure')) return 'alt_text';
  if (toolName.includes('table')) return 'table_markup';
  if (toolName.includes('link') || toolName.includes('annotation')) return 'link_quality';
  if (toolName.includes('heading')) return 'heading_structure';
  if (toolName.includes('pdfua') || toolName.includes('orphan') || toolName.includes('artifact') || toolName.includes('structure_conformance')) return 'pdf_ua_compliance';
  if (toolName.includes('title') || toolName.includes('language')) return 'title_language';
  return null;
}

export function acceptedCleanupHarmCandidates(tools: Stage182ToolRow[] = []): TimelineRow[] {
  return tools.flatMap((tool, index) => {
    const toolName = tool.toolName ?? '';
    if (tool.outcome !== 'applied' || !CLEANUP_TOOLS.has(toolName)) return [];
    const before = replayCategoryScores(tool, 'categoryScoresBefore');
    const after = replayCategoryScores(tool, 'categoryScoresAfter');
    const target = targetCategoryForTool(toolName);
    const targetGain = target && typeof before[target] === 'number' && typeof after[target] === 'number'
      ? after[target] - before[target]
      : 0;
    const strongestCoreDrop = CORE_CATEGORIES.reduce((worst, category) => {
      const from = before[category];
      const to = after[category];
      if (typeof from !== 'number' || typeof to !== 'number') return worst;
      return Math.min(worst, to - from);
    }, 0);
    if (targetGain > 0 || strongestCoreDrop > -20) return [];
    return [timeline({ appliedTools: [tool] })[0] ? { ...timeline({ appliedTools: [tool] })[0]!, index } : {
      index,
      toolName,
      outcome: tool.outcome ?? 'applied',
      source: str(tool.source),
      stage: num(tool.stage),
      round: num(tool.round),
      scoreBefore: num(tool.scoreBefore),
      scoreAfter: num(tool.scoreAfter),
      delta: num(tool.delta),
      note: null,
      raw: null,
      replayStateBefore: null,
      replayStateAfter: null,
    }];
  });
}

function stage75LocalFontRows(rows: TimelineRow[]): TimelineRow[] {
  return rows.filter(row => row.toolName === 'embed_local_font_substitutes');
}

async function runPythonRaw(pdfPath: string, repeat: number): Promise<Stage128RawRepeat> {
  const started = Date.now();
  return new Promise(resolveRun => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (result: Stage128RawRepeat) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun(result);
    };
    const proc = spawn('python3', [PYTHON_SCRIPT_PATH, pdfPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      done({ repeat, signature: null, familySignatures: {}, familyCounts: {}, runtimeMs: Date.now() - started, stderr, error: `timeout_${PYTHON_TIMEOUT_MS}ms` });
    }, PYTHON_TIMEOUT_MS);
    proc.stdout.on('data', chunk => { stdout += String(chunk); });
    proc.stderr.on('data', chunk => { stderr += String(chunk); });
    proc.on('error', error => {
      done({ repeat, signature: null, familySignatures: {}, familyCounts: {}, runtimeMs: Date.now() - started, stderr, error: error.message });
    });
    proc.on('close', code => {
      if (settled) return;
      try {
        const raw = JSON.parse(stdout) as JsonRecord;
        const families = Object.fromEntries(EVIDENCE_FAMILIES.map(family => [family, evidenceArray(raw, family)]));
        done({
          repeat,
          signature: signature(families),
          familySignatures: familySignatures(raw),
          familyCounts: familyCounts(raw),
          runtimeMs: Date.now() - started,
          stderr,
          ...(code === 0 ? {} : { error: `python_exit_${code}` }),
        });
      } catch (error) {
        done({
          repeat,
          signature: null,
          familySignatures: {},
          familyCounts: {},
          runtimeMs: Date.now() - started,
          stderr,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });
}

async function analyzeExternalRepeat(input: {
  pdfPath: string;
  filename: string;
  repeat: number;
  baseline?: ProtectedReanalysisBaseline;
}): Promise<Stage128ExternalRepeat> {
  const started = Date.now();
  try {
    const analyzed = await analyzePdf(input.pdfPath, input.filename, { bypassCache: true });
    return {
      repeat: input.repeat,
      score: analyzed.result.score,
      grade: analyzed.result.grade,
      protectedUnsafeReason: input.baseline
        ? protectedReanalysisUnsafeReason({ baseline: input.baseline, analysis: analyzed.result })
        : 'protected_baseline_missing',
      categories: categoryMap(analyzed.result.categories),
      runtimeMs: Date.now() - started,
    };
  } catch (error) {
    return {
      repeat: input.repeat,
      score: null,
      grade: null,
      protectedUnsafeReason: 'analysis_failed',
      categories: {},
      runtimeMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function rawChanged(rawRepeats: Stage128RawRepeat[]): boolean {
  const signatures = rawRepeats
    .filter(repeat => !repeat.error && repeat.signature)
    .map(repeat => repeat.signature);
  return signatures.length >= 2 && new Set(signatures).size > 1;
}

function scoreChanged(externalRepeats: Stage128ExternalRepeat[]): boolean {
  const scores = externalRepeats
    .map(repeat => repeat.score)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
  return scores.length >= 2 && new Set(scores).size > 1;
}

function hasFloorSafe(repeats: Stage128ExternalRepeat[]): boolean {
  return repeats.some(repeat => repeat.protectedUnsafeReason === null);
}

export function classifyStage182Row(input: {
  floorScore: number | null;
  targetAfterScore: number | null;
  finalRepeats: Stage128ExternalRepeat[];
  finalRawRepeats: Stage128RawRepeat[];
  checkpoints: Array<{ externalRepeats: Stage128ExternalRepeat[]; rawRepeats: Stage128RawRepeat[] }>;
  acceptedCleanupHarmCandidates?: TimelineRow[];
}): { classification: Stage182Classification; reasons: string[] } {
  const reasons: string[] = [];
  const successfulFinalScores = input.finalRepeats
    .map(repeat => repeat.score)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
  if (hasFloorSafe(input.finalRepeats)) {
    reasons.push(`final_floor_safe_repeats=${input.finalRepeats.filter(repeat => repeat.protectedUnsafeReason === null).map(repeat => repeat.repeat).join(',')}`);
    return { classification: 'same_buffer_floor_safe_repeat_available', reasons };
  }
  const safeCheckpointIndexes = input.checkpoints
    .map((checkpoint, index) => hasFloorSafe(checkpoint.externalRepeats) ? index : -1)
    .filter(index => index >= 0);
  if (safeCheckpointIndexes.length > 0) {
    reasons.push(`safe_checkpoint_indexes=${safeCheckpointIndexes.join(',')}`);
    return { classification: 'safe_checkpoint_available', reasons };
  }
  if (rawChanged(input.finalRawRepeats) || scoreChanged(input.finalRepeats)) {
    if (rawChanged(input.finalRawRepeats)) reasons.push('final_raw_python_signature_changed');
    if (scoreChanged(input.finalRepeats)) reasons.push(`final_external_scores=${successfulFinalScores.join(',')}`);
    return { classification: 'same_buffer_analyzer_variance_floor_unsafe', reasons };
  }
  if ((input.acceptedCleanupHarmCandidates ?? []).length > 0) {
    reasons.push(`accepted_cleanup_harm_candidates=${input.acceptedCleanupHarmCandidates!.map(row => `${row.toolName}@${row.index}`).join(',')}`);
    return { classification: 'accepted_cleanup_harm', reasons };
  }
  if (
    input.floorScore != null &&
    input.targetAfterScore != null &&
    input.targetAfterScore >= input.floorScore &&
    successfulFinalScores.length > 0 &&
    successfulFinalScores.every(score => score < input.floorScore!)
  ) {
    reasons.push(`in_run_floor_safe_${input.targetAfterScore}_but_external_${successfulFinalScores.join(',')}`);
  } else {
    reasons.push(successfulFinalScores.length > 0 ? `final_external_scores=${successfulFinalScores.join(',')}` : 'no_successful_final_external_repeats');
  }
  return { classification: 'stable_below_floor_no_safe_state', reasons };
}

async function listCheckpoints(runDir: string, id: string): Promise<Array<{ pdfPath: string; metadataPath: string; metadata: ProtectedStateMetadata }>> {
  const dir = join(resolve(runDir), 'protected-states', id);
  const names = await readdir(dir).catch(() => []);
  const metadataNames = names.filter(name => name.endsWith('.json')).sort();
  const out = [];
  for (const name of metadataNames) {
    const metadataPath = join(dir, name);
    const pdfPath = join(dir, name.replace(/\.json$/, '.pdf'));
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as ProtectedStateMetadata;
    out.push({ pdfPath, metadataPath, metadata });
  }
  return out;
}

async function buildBufferRepeatReport(input: {
  label: string;
  pdfPath: string;
  baseline?: ProtectedReanalysisBaseline;
  repeats: number;
  inRunScore: number | null;
  inRunGrade: string | null;
  metadata?: ProtectedStateMetadata;
}): Promise<BufferRepeatReport> {
  const buffer = await readFile(input.pdfPath);
  const externalRepeats: Stage128ExternalRepeat[] = [];
  const rawRepeats: Stage128RawRepeat[] = [];
  for (let repeat = 1; repeat <= input.repeats; repeat += 1) {
    externalRepeats.push(await analyzeExternalRepeat({
      pdfPath: input.pdfPath,
      filename: basename(input.pdfPath),
      repeat,
      baseline: input.baseline,
    }));
    rawRepeats.push(await runPythonRaw(input.pdfPath, repeat));
  }
  return {
    label: input.label,
    pdfPath: input.pdfPath,
    bufferSha256: sha256Buffer(buffer),
    inRunScore: input.inRunScore,
    inRunGrade: input.inRunGrade,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    externalRepeats,
    rawRepeats,
  };
}

async function buildRowReport(input: {
  id: string;
  baselineRow?: BenchmarkRow;
  stage180Row?: BenchmarkRow;
  stage181Row?: BenchmarkRow;
  targetRow?: BenchmarkRow;
  targetRun: string;
  repeats: number;
}): Promise<Stage182RowReport> {
  const baseline = baselineFor(input.baselineRow);
  const floorScore = baseline?.score != null ? baseline.score - 2 : null;
  const baselineCategories = baseline?.categories ?? {};
  const stage180Categories = effectiveCategories(input.stage180Row);
  const stage181Categories = effectiveCategories(input.stage181Row);
  const targetCategories = effectiveCategories(input.targetRow);
  const targetTimeline = timeline(input.targetRow);
  const cleanupHarmCandidates = acceptedCleanupHarmCandidates(input.targetRow?.appliedTools ?? []);
  const finalPdfPath = join(resolve(input.targetRun), 'pdfs', `${input.id}.pdf`);
  const finalBuffer = await buildBufferRepeatReport({
    label: 'final',
    pdfPath: finalPdfPath,
    baseline,
    repeats: input.repeats,
    inRunScore: typeof input.targetRow?.afterScore === 'number' ? input.targetRow.afterScore : null,
    inRunGrade: input.targetRow?.afterGrade ?? null,
  }).catch(() => null);
  const checkpoints = [];
  for (const checkpoint of await listCheckpoints(input.targetRun, input.id)) {
    checkpoints.push(await buildBufferRepeatReport({
      label: `checkpoint:${basename(checkpoint.pdfPath, '.pdf')}`,
      pdfPath: checkpoint.pdfPath,
      baseline,
      repeats: input.repeats,
      inRunScore: checkpoint.metadata.score,
      inRunGrade: checkpoint.metadata.grade,
      metadata: checkpoint.metadata,
    }));
  }
  const classification = classifyStage182Row({
    floorScore,
    targetAfterScore: typeof input.targetRow?.afterScore === 'number' ? input.targetRow.afterScore : null,
    finalRepeats: finalBuffer?.externalRepeats ?? [],
    finalRawRepeats: finalBuffer?.rawRepeats ?? [],
    checkpoints,
    acceptedCleanupHarmCandidates: cleanupHarmCandidates,
  });
  return {
    id: input.id,
    file: input.targetRow?.file ?? input.stage181Row?.file ?? input.stage180Row?.file ?? input.baselineRow?.file ?? null,
    classification: classification.classification,
    reasons: classification.reasons,
    acceptedCleanupHarmCandidates: cleanupHarmCandidates,
    localFontSubstitutionRows: stage75LocalFontRows(targetTimeline),
    baseline: {
      score: baseline?.score ?? null,
      floorScore,
      categories: baselineCategories,
    },
    stage180: {
      afterScore: typeof input.stage180Row?.afterScore === 'number' ? input.stage180Row.afterScore : null,
      reanalyzedScore: typeof input.stage180Row?.reanalyzedScore === 'number' ? input.stage180Row.reanalyzedScore : null,
      effectiveScore: effectiveScore(input.stage180Row),
      protectedReanalysisSelection: input.stage180Row?.protectedReanalysisSelection ?? null,
      categoryDeltas: categoryDeltas(baselineCategories, stage180Categories, 'stage180'),
    },
    stage181: {
      afterScore: typeof input.stage181Row?.afterScore === 'number' ? input.stage181Row.afterScore : null,
      reanalyzedScore: typeof input.stage181Row?.reanalyzedScore === 'number' ? input.stage181Row.reanalyzedScore : null,
      effectiveScore: effectiveScore(input.stage181Row),
      protectedReanalysisSelection: input.stage181Row?.protectedReanalysisSelection ?? null,
      categoryDeltas: categoryDeltas(baselineCategories, stage181Categories, 'stage181'),
    },
    target: {
      afterScore: typeof input.targetRow?.afterScore === 'number' ? input.targetRow.afterScore : null,
      reanalyzedScore: typeof input.targetRow?.reanalyzedScore === 'number' ? input.targetRow.reanalyzedScore : null,
      effectiveScore: effectiveScore(input.targetRow),
      protectedReanalysisSelection: input.targetRow?.protectedReanalysisSelection ?? null,
      categoryDeltas: categoryDeltas(baselineCategories, targetCategories, 'target'),
      acceptedTimeline: targetTimeline.filter(tool => tool.outcome === 'applied'),
      rejectedTimeline: targetTimeline.filter(tool => tool.outcome === 'rejected' || tool.outcome === 'no_effect'),
      rejectedPostPassRows: targetTimeline.filter(tool => tool.outcome === 'rejected' && tool.source === 'post_pass'),
      firstProtectedDrop: firstProtectedDrop(input.targetRow, baseline),
    },
    finalBuffer,
    checkpoints,
  };
}

function formatScores(buffer: BufferRepeatReport | null): string {
  return buffer?.externalRepeats.map(repeat => repeat.score ?? 'err').join(',') ?? 'missing';
}

function renderMarkdown(report: {
  baselineRun: string;
  stage180Run: string;
  stage181Run: string;
  targetRun: string;
  rows: Stage182RowReport[];
}): string {
  const lines = [
    '# Stage 182 Protected Reanalysis Evidence Stabilization',
    '',
    `- Baseline: \`${report.baselineRun}\``,
    `- Stage 180 run: \`${report.stage180Run}\``,
    `- Stage 181 run: \`${report.stage181Run}\``,
    `- Target run: \`${report.targetRun}\``,
    '',
    '| Row | Stage180 eff. | Stage181 eff. | Target after/reanalysis | Final repeat scores | Checkpoints | Cleanup harm | Local font | Classification | Reasons |',
    '| --- | ---: | ---: | --- | --- | ---: | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push([
      row.id,
      row.stage180.effectiveScore ?? 'n/a',
      row.stage181.effectiveScore ?? 'n/a',
      `${row.target.afterScore ?? 'n/a'} / ${row.target.reanalyzedScore ?? 'n/a'}`,
      formatScores(row.finalBuffer),
      row.checkpoints.length,
      row.acceptedCleanupHarmCandidates.length > 0 ? row.acceptedCleanupHarmCandidates.map(tool => `${tool.toolName}@${tool.index}`).join(',') : 'no',
      row.localFontSubstitutionRows.length > 0 ? row.localFontSubstitutionRows.map(tool => `${tool.outcome}@${tool.index}`).join(',') : 'no',
      row.classification,
      row.reasons.join('; '),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Row Details', '');
  for (const row of report.rows) {
    lines.push(`### ${row.id}`, '');
    lines.push(`- Baseline floor: ${row.baseline.floorScore ?? 'n/a'}`);
    lines.push(`- Stage 180 protected selection: \`${JSON.stringify(row.stage180.protectedReanalysisSelection ?? null)}\``);
    lines.push(`- Stage 181 protected selection: \`${JSON.stringify(row.stage181.protectedReanalysisSelection ?? null)}\``);
    lines.push(`- Target protected selection: \`${JSON.stringify(row.target.protectedReanalysisSelection ?? null)}\``);
    lines.push(`- Accepted cleanup harm candidates: ${row.acceptedCleanupHarmCandidates.map(tool => `${tool.toolName}@${tool.index}`).join(', ') || 'none'}`);
    lines.push(`- Local font substitution rows: ${row.localFontSubstitutionRows.map(tool => `${tool.toolName}/${tool.outcome}@${tool.index}`).join(', ') || 'none'}`);
    if (row.stage180.categoryDeltas.length > 0) {
      lines.push(`- Stage 180 protected deltas: ${row.stage180.categoryDeltas.slice(0, 8).map(delta => `${delta.key}:${delta.baseline}->${delta.stage180}`).join(', ')}`);
    }
    if (row.stage181.categoryDeltas.length > 0) {
      lines.push(`- Stage 181 protected deltas: ${row.stage181.categoryDeltas.slice(0, 8).map(delta => `${delta.key}:${delta.baseline}->${delta.stage181}`).join(', ')}`);
    }
    if (row.target.categoryDeltas.length > 0) {
      lines.push(`- Target protected deltas: ${row.target.categoryDeltas.slice(0, 8).map(delta => `${delta.key}:${delta.baseline}->${delta.target}`).join(', ')}`);
    }
    if (row.target.firstProtectedDrop) {
      lines.push(`- First in-run protected drop: ${row.target.firstProtectedDrop.toolName} ${row.target.firstProtectedDrop.scoreBefore}->${row.target.firstProtectedDrop.scoreAfter}`);
    }
    lines.push(`- Accepted tools: ${row.target.acceptedTimeline.map(tool => `${tool.toolName}@${tool.index}`).join(', ') || 'none'}`);
    lines.push(`- Rejected/no-effect rows: ${row.target.rejectedTimeline.map(tool => `${tool.toolName}@${tool.index}:${tool.raw ?? tool.note ?? tool.outcome}`).join(', ') || 'none'}`);
    lines.push(`- Rejected post-pass rows: ${row.target.rejectedPostPassRows.map(tool => `${tool.toolName}:${tool.raw ?? tool.note ?? 'rejected'}`).join(', ') || 'none'}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const [baselineRows, stage180Rows, stage181Rows, targetRows] = await Promise.all([
    readRun(args.baselineRun),
    readRun(args.stage180Run),
    readRun(args.stage181Run),
    readRun(args.targetRun),
  ]);
  const rows: Stage182RowReport[] = [];
  for (const id of args.ids) {
    const row = await buildRowReport({
      id,
      baselineRow: baselineRows.get(id),
      stage180Row: stage180Rows.get(id),
      stage181Row: stage181Rows.get(id),
      targetRow: targetRows.get(id),
      targetRun: args.targetRun,
      repeats: args.repeats,
    });
    rows.push(row);
    console.log(`${id}: ${row.classification} (${row.reasons.join('; ')})`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    baselineRun: resolve(args.baselineRun),
    stage180Run: resolve(args.stage180Run),
    stage181Run: resolve(args.stage181Run),
    targetRun: resolve(args.targetRun),
    repeats: args.repeats,
    pythonScriptPath: PYTHON_SCRIPT_PATH,
    rows,
  };
  const out = resolve(args.out);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage182-protected-reanalysis-evidence.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(out, 'stage182-protected-reanalysis-evidence.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
