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

type JsonRecord = Record<string, unknown>;

export type Stage128Classification =
  | 'same_buffer_floor_safe_repeat_available'
  | 'safe_checkpoint_available'
  | 'same_buffer_analyzer_variance_floor_unsafe'
  | 'deterministic_route_regression'
  | 'stable_below_floor_no_safe_state';

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

interface ToolRow {
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
  appliedTools?: ToolRow[];
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

export interface Stage128ExternalRepeat {
  repeat: number;
  score: number | null;
  grade: string | null;
  protectedUnsafeReason: string | null;
  categories: Record<string, number>;
  runtimeMs?: number;
  error?: string;
}

export interface Stage128RawRepeat {
  repeat: number;
  signature: string | null;
  familySignatures: Partial<Record<EvidenceFamily, string>>;
  familyCounts: Partial<Record<EvidenceFamily, number>>;
  runtimeMs?: number;
  stderr?: string;
  error?: string;
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

interface Stage128RowReport {
  id: string;
  file: string | null;
  classification: Stage128Classification;
  reasons: string[];
  baseline: {
    score: number | null;
    floorScore: number | null;
    categories: Record<string, number>;
  };
  stage127: {
    afterScore: number | null;
    reanalyzedScore: number | null;
    effectiveScore: number | null;
    protectedReanalysisSelection: unknown;
    categoryDeltas: Array<{ key: string; baseline: number; candidate: number; delta: number }>;
  };
  target: {
    afterScore: number | null;
    reanalyzedScore: number | null;
    effectiveScore: number | null;
    protectedReanalysisSelection: unknown;
    acceptedTimeline: TimelineRow[];
    rejectedPostPassRows: TimelineRow[];
    firstProtectedDrop: TimelineRow | null;
  };
  finalBuffer: BufferRepeatReport | null;
  checkpoints: BufferRepeatReport[];
}

const DEFAULT_BASELINE_RUN = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_STAGE127_RUN = 'Output/experiment-corpus-baseline/run-stage127-full-2026-04-26-r2';
const DEFAULT_TARGET_RUN = 'Output/experiment-corpus-baseline/run-stage128-target-protected-2026-04-26-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage128-protected-reanalysis-closeout-2026-04-26-r1';
const DEFAULT_IDS = ['long-4683', 'short-4214'];
const DEFAULT_REPEATS = 5;
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
    'Usage: pnpm exec tsx scripts/stage128-protected-reanalysis-closeout.ts [options]',
    `  --baseline-run <dir>  Default: ${DEFAULT_BASELINE_RUN}`,
    `  --stage127-run <dir>  Default: ${DEFAULT_STAGE127_RUN}`,
    `  --target-run <dir>    Run with --write-pdfs and --write-protected-debug-states (default: ${DEFAULT_TARGET_RUN})`,
    `  --out <dir>           Default: ${DEFAULT_OUT}`,
    `  --ids <csv>           Default: ${DEFAULT_IDS.join(',')}`,
    '  --repeats <n>         External/Python repeat count, capped at 5 (default: 5)',
  ].join('\n');
}

function parseArgs(argv: string[] = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'))): {
  baselineRun: string;
  stage127Run: string;
  targetRun: string;
  out: string;
  ids: string[];
  repeats: number;
} {
  const args = {
    baselineRun: DEFAULT_BASELINE_RUN,
    stage127Run: DEFAULT_STAGE127_RUN,
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
    else if (arg === '--stage127-run') args.stage127Run = next;
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

function categoryDeltas(baseline: Record<string, number>, candidate: Record<string, number>): Array<{ key: string; baseline: number; candidate: number; delta: number }> {
  return Object.entries(baseline)
    .flatMap(([key, baselineScore]) => {
      const candidateScore = candidate[key];
      if (typeof candidateScore !== 'number') return [];
      return [{ key, baseline: baselineScore, candidate: candidateScore, delta: candidateScore - baselineScore }];
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

export function classifyStage128Row(input: {
  floorScore: number | null;
  targetAfterScore: number | null;
  finalRepeats: Stage128ExternalRepeat[];
  finalRawRepeats: Stage128RawRepeat[];
  checkpoints: Array<{ externalRepeats: Stage128ExternalRepeat[]; rawRepeats: Stage128RawRepeat[] }>;
}): { classification: Stage128Classification; reasons: string[] } {
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
  if (
    input.floorScore != null &&
    input.targetAfterScore != null &&
    input.targetAfterScore >= input.floorScore &&
    successfulFinalScores.length > 0 &&
    successfulFinalScores.every(score => score < input.floorScore!)
  ) {
    reasons.push(`in_run_floor_safe_${input.targetAfterScore}_but_external_${successfulFinalScores.join(',')}`);
    return { classification: 'deterministic_route_regression', reasons };
  }
  reasons.push(successfulFinalScores.length > 0 ? `final_external_scores=${successfulFinalScores.join(',')}` : 'no_successful_final_external_repeats');
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
  stage127Row?: BenchmarkRow;
  targetRow?: BenchmarkRow;
  targetRun: string;
  repeats: number;
}): Promise<Stage128RowReport> {
  const baseline = baselineFor(input.baselineRow);
  const floorScore = baseline?.score != null ? baseline.score - 2 : null;
  const baselineCategories = baseline?.categories ?? {};
  const stage127Categories = effectiveCategories(input.stage127Row);
  const targetTimeline = timeline(input.targetRow);
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
  const classification = classifyStage128Row({
    floorScore,
    targetAfterScore: typeof input.targetRow?.afterScore === 'number' ? input.targetRow.afterScore : null,
    finalRepeats: finalBuffer?.externalRepeats ?? [],
    finalRawRepeats: finalBuffer?.rawRepeats ?? [],
    checkpoints,
  });
  return {
    id: input.id,
    file: input.targetRow?.file ?? input.stage127Row?.file ?? input.baselineRow?.file ?? null,
    classification: classification.classification,
    reasons: classification.reasons,
    baseline: {
      score: baseline?.score ?? null,
      floorScore,
      categories: baselineCategories,
    },
    stage127: {
      afterScore: typeof input.stage127Row?.afterScore === 'number' ? input.stage127Row.afterScore : null,
      reanalyzedScore: typeof input.stage127Row?.reanalyzedScore === 'number' ? input.stage127Row.reanalyzedScore : null,
      effectiveScore: effectiveScore(input.stage127Row),
      protectedReanalysisSelection: input.stage127Row?.protectedReanalysisSelection ?? null,
      categoryDeltas: categoryDeltas(baselineCategories, stage127Categories),
    },
    target: {
      afterScore: typeof input.targetRow?.afterScore === 'number' ? input.targetRow.afterScore : null,
      reanalyzedScore: typeof input.targetRow?.reanalyzedScore === 'number' ? input.targetRow.reanalyzedScore : null,
      effectiveScore: effectiveScore(input.targetRow),
      protectedReanalysisSelection: input.targetRow?.protectedReanalysisSelection ?? null,
      acceptedTimeline: targetTimeline.filter(tool => tool.outcome === 'applied'),
      rejectedPostPassRows: targetTimeline.filter(tool => tool.outcome === 'rejected' && tool.source === 'post_pass'),
      firstProtectedDrop: firstProtectedDrop(input.targetRow, baseline),
    },
    finalBuffer,
    checkpoints,
  };
}

function renderMarkdown(report: {
  baselineRun: string;
  stage127Run: string;
  targetRun: string;
  rows: Stage128RowReport[];
}): string {
  const lines = [
    '# Stage 128 Protected Reanalysis Closeout',
    '',
    `- Baseline: \`${report.baselineRun}\``,
    `- Stage 127 run: \`${report.stage127Run}\``,
    `- Target run: \`${report.targetRun}\``,
    '',
    '| Row | Stage127 effective | Target after/reanalysis | Final repeat scores | Checkpoints | Classification | Reasons |',
    '| --- | ---: | --- | --- | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    const finalScores = row.finalBuffer?.externalRepeats.map(repeat => repeat.score ?? 'err').join(',') ?? 'missing';
    lines.push([
      row.id,
      row.stage127.effectiveScore ?? 'n/a',
      `${row.target.afterScore ?? 'n/a'} / ${row.target.reanalyzedScore ?? 'n/a'}`,
      finalScores,
      row.checkpoints.length,
      row.classification,
      row.reasons.join('; '),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Row Details', '');
  for (const row of report.rows) {
    lines.push(`### ${row.id}`, '');
    lines.push(`- Baseline floor: ${row.baseline.floorScore ?? 'n/a'}`);
    lines.push(`- Stage 127 protected selection: \`${JSON.stringify(row.stage127.protectedReanalysisSelection ?? null)}\``);
    lines.push(`- Target protected selection: \`${JSON.stringify(row.target.protectedReanalysisSelection ?? null)}\``);
    if (row.target.firstProtectedDrop) {
      lines.push(`- First in-run protected drop: ${row.target.firstProtectedDrop.toolName} ${row.target.firstProtectedDrop.scoreBefore}->${row.target.firstProtectedDrop.scoreAfter}`);
    }
    lines.push(`- Accepted tools: ${row.target.acceptedTimeline.map(tool => `${tool.toolName}/${tool.outcome}`).join(', ') || 'none'}`);
    lines.push(`- Rejected post-pass rows: ${row.target.rejectedPostPassRows.map(tool => `${tool.toolName}:${tool.raw ?? tool.note ?? 'rejected'}`).join(', ') || 'none'}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const [baselineRows, stage127Rows, targetRows] = await Promise.all([
    readRun(args.baselineRun),
    readRun(args.stage127Run),
    readRun(args.targetRun),
  ]);
  const rows: Stage128RowReport[] = [];
  for (const id of args.ids) {
    const row = await buildRowReport({
      id,
      baselineRow: baselineRows.get(id),
      stage127Row: stage127Rows.get(id),
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
    stage127Run: resolve(args.stage127Run),
    targetRun: resolve(args.targetRun),
    repeats: args.repeats,
    pythonScriptPath: PYTHON_SCRIPT_PATH,
    rows,
  };
  const out = resolve(args.out);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage128-protected-reanalysis-closeout.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(out, 'stage128-protected-reanalysis-closeout.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
