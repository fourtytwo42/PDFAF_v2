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

export type Stage123CheckpointClass =
  | 'external_floor_safe_checkpoint'
  | 'in_run_only_score_artifact'
  | 'python_structural_mismatch'
  | 'typescript_scoring_mismatch'
  | 'stable_below_floor_no_safe_state';

interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  afterScore?: number;
  reanalyzedScore?: number;
  afterCategories?: AnalysisResult['categories'];
  reanalyzedCategories?: AnalysisResult['categories'];
  afterScoreCapsApplied?: AnalysisResult['scoreCapsApplied'];
  reanalyzedScoreCapsApplied?: AnalysisResult['scoreCapsApplied'];
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

interface ExternalRepeat {
  repeat: number;
  score: number | null;
  grade: string | null;
  protectedUnsafeReason: string | null;
  categories: Record<string, number>;
  runtimeMs: number;
  error?: string;
}

interface RawRepeat {
  repeat: number;
  runtimeMs: number;
  signature: string | null;
  counts: JsonRecord;
  stderr?: string;
  error?: string;
}

interface CheckpointReport {
  rowId: string;
  checkpoint: string;
  pdfPath: string;
  metadataPath: string;
  bufferSha256: string;
  metadata: ProtectedStateMetadata;
  classification: Stage123CheckpointClass;
  classificationReason: string;
  externalRepeats: ExternalRepeat[];
  rawRepeats: RawRepeat[];
}

const DEFAULT_BASELINE_RUN = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_RUN = 'Output/experiment-corpus-baseline/run-stage123-target-protected-2026-04-26-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage123-protected-state-diagnostic-2026-04-26-r1';
const DEFAULT_IDS = ['long-4516'];
const DEFAULT_REPEATS = 5;

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage123-protected-state-diagnostic.ts [options]',
    `  --run <dir>           Run dir with protected-states artifacts (default: ${DEFAULT_RUN})`,
    `  --baseline-run <dir>  Stage 42 protected baseline (default: ${DEFAULT_BASELINE_RUN})`,
    `  --out <dir>           Output directory (default: ${DEFAULT_OUT})`,
    '  --ids <csv>           Row ids (default: long-4516)',
    '  --repeats <n>         External/Python repeat count, capped at 5 (default: 5)',
  ].join('\n');
}

function parseArgs(argv: string[]): {
  runDir: string;
  baselineRun: string;
  out: string;
  ids: string[];
  repeats: number;
} {
  const args = {
    runDir: DEFAULT_RUN,
    baselineRun: DEFAULT_BASELINE_RUN,
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
    if (arg === '--run') args.runDir = next;
    else if (arg === '--baseline-run') args.baselineRun = next;
    else if (arg === '--out') args.out = next;
    else if (arg === '--ids') args.ids = next.split(',').map(id => id.trim()).filter(Boolean);
    else if (arg === '--repeats') args.repeats = Math.max(1, Math.min(5, Number.parseInt(next, 10) || DEFAULT_REPEATS));
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  return args;
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

function categoryMap(categories: AnalysisResult['categories'] | undefined): Record<string, number> {
  return Object.fromEntries((categories ?? []).map(category => [category.key, category.score]));
}

async function readBaselineRows(runDir: string): Promise<Map<string, ProtectedReanalysisBaseline>> {
  const rows = JSON.parse(await readFile(join(resolve(runDir), 'remediate.results.json'), 'utf8')) as BenchmarkRow[];
  const out = new Map<string, ProtectedReanalysisBaseline>();
  for (const row of rows) {
    const id = String(row.id ?? row.publicationId ?? '');
    const score = row.reanalyzedScore ?? row.afterScore;
    if (!id || typeof score !== 'number' || !Number.isFinite(score)) continue;
    const categories = row.reanalyzedCategories?.length ? row.reanalyzedCategories : row.afterCategories ?? [];
    out.set(id, {
      score,
      scoreCapsApplied: row.reanalyzedScoreCapsApplied?.length ? row.reanalyzedScoreCapsApplied : row.afterScoreCapsApplied ?? [],
      categories: categoryMap(categories),
    });
  }
  return out;
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

async function analyzeExternalRepeat(input: {
  pdfPath: string;
  filename: string;
  repeat: number;
  baseline?: ProtectedReanalysisBaseline;
}): Promise<ExternalRepeat> {
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

function rawCounts(raw: JsonRecord): JsonRecord {
  return {
    headingCount: Array.isArray(raw['headings']) ? raw['headings'].length : 0,
    figureCount: Array.isArray(raw['figures']) ? raw['figures'].length : 0,
    checkerFigureTargetCount: Array.isArray(raw['checkerFigureTargets']) ? raw['checkerFigureTargets'].length : 0,
    tableCount: Array.isArray(raw['tables']) ? raw['tables'].length : 0,
    paragraphStructElemCount: Array.isArray(raw['paragraphStructElems']) ? raw['paragraphStructElems'].length : 0,
    orphanMcidCount: Array.isArray(raw['orphanMcids']) ? raw['orphanMcids'].length : 0,
    mcidTextSpanCount: Array.isArray(raw['mcidTextSpans']) ? raw['mcidTextSpans'].length : 0,
    tagged: raw['isTagged'] === true,
  };
}

function rawStructuralSlice(raw: JsonRecord): JsonRecord {
  return {
    isTagged: raw['isTagged'] ?? null,
    markInfo: raw['markInfo'] ?? null,
    headings: raw['headings'] ?? [],
    figures: raw['figures'] ?? [],
    checkerFigureTargets: raw['checkerFigureTargets'] ?? [],
    tables: raw['tables'] ?? [],
    paragraphStructElems: raw['paragraphStructElems'] ?? [],
    orphanMcids: raw['orphanMcids'] ?? [],
    mcidTextSpans: raw['mcidTextSpans'] ?? [],
    taggedContentAudit: raw['taggedContentAudit'] ?? null,
    listStructureAudit: raw['listStructureAudit'] ?? null,
    annotationAccessibility: raw['annotationAccessibility'] ?? null,
  };
}

async function runPythonRaw(pdfPath: string, repeat: number): Promise<RawRepeat> {
  const started = Date.now();
  return new Promise(resolveRun => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const done = (result: RawRepeat) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun(result);
    };
    const proc = spawn('python3', [PYTHON_SCRIPT_PATH, pdfPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      done({ repeat, runtimeMs: Date.now() - started, signature: null, counts: {}, stderr, error: `timeout_${PYTHON_TIMEOUT_MS}ms` });
    }, PYTHON_TIMEOUT_MS);
    proc.stdout.on('data', chunk => { stdout += String(chunk); });
    proc.stderr.on('data', chunk => { stderr += String(chunk); });
    proc.on('error', error => {
      done({ repeat, runtimeMs: Date.now() - started, signature: null, counts: {}, stderr, error: error.message });
    });
    proc.on('close', code => {
      if (settled) return;
      try {
        const raw = JSON.parse(stdout) as JsonRecord;
        const structural = rawStructuralSlice(raw);
        done({
          repeat,
          runtimeMs: Date.now() - started,
          signature: signature(structural),
          counts: rawCounts(raw),
          stderr,
          ...(code === 0 ? {} : { error: `python_exit_${code}` }),
        });
      } catch (error) {
        done({
          repeat,
          runtimeMs: Date.now() - started,
          signature: null,
          counts: {},
          stderr,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });
}

export function classifyStage123Checkpoint(input: {
  floorScore: number | null;
  inRunScore: number | null;
  externalRepeats: Array<{ score: number | null; protectedUnsafeReason: string | null }>;
  rawRepeats: Array<{ signature: string | null; error?: string }>;
}): { classification: Stage123CheckpointClass; reason: string } {
  const externalSuccess = input.externalRepeats.filter(repeat => repeat.score != null);
  const floorSafe = input.externalRepeats.filter(repeat => repeat.protectedUnsafeReason === null);
  if (floorSafe.length > 0) {
    return { classification: 'external_floor_safe_checkpoint', reason: `floor_safe_repeats=${floorSafe.length}` };
  }
  const rawSuccess = input.rawRepeats.filter(repeat => !repeat.error && repeat.signature);
  if (rawSuccess.length >= 2 && new Set(rawSuccess.map(repeat => repeat.signature)).size > 1) {
    return { classification: 'python_structural_mismatch', reason: 'raw_python_signature_changed' };
  }
  if (externalSuccess.length >= 2 && new Set(externalSuccess.map(repeat => repeat.score)).size > 1) {
    return { classification: 'typescript_scoring_mismatch', reason: 'external_scores_changed_with_stable_raw_python' };
  }
  if (
    input.floorScore != null &&
    input.inRunScore != null &&
    input.inRunScore >= input.floorScore &&
    externalSuccess.length > 0 &&
    externalSuccess.every(repeat => repeat.score != null && repeat.score < input.floorScore!)
  ) {
    return { classification: 'in_run_only_score_artifact', reason: `in_run_${input.inRunScore}_external_${externalSuccess.map(repeat => repeat.score).join(',')}` };
  }
  return { classification: 'stable_below_floor_no_safe_state', reason: externalSuccess.length > 0 ? `external_scores=${externalSuccess.map(repeat => repeat.score).join(',')}` : 'no_successful_external_repeats' };
}

async function buildCheckpointReport(input: {
  rowId: string;
  checkpoint: { pdfPath: string; metadataPath: string; metadata: ProtectedStateMetadata };
  baseline?: ProtectedReanalysisBaseline;
  repeats: number;
}): Promise<CheckpointReport> {
  const buffer = await readFile(input.checkpoint.pdfPath);
  const bufferSha256 = sha256Buffer(buffer);
  const externalRepeats: ExternalRepeat[] = [];
  const rawRepeats: RawRepeat[] = [];
  for (let repeat = 1; repeat <= input.repeats; repeat += 1) {
    externalRepeats.push(await analyzeExternalRepeat({
      pdfPath: input.checkpoint.pdfPath,
      filename: basename(input.checkpoint.pdfPath),
      repeat,
      baseline: input.baseline,
    }));
    rawRepeats.push(await runPythonRaw(input.checkpoint.pdfPath, repeat));
  }
  const classification = classifyStage123Checkpoint({
    floorScore: input.checkpoint.metadata.floorScore,
    inRunScore: input.checkpoint.metadata.score,
    externalRepeats,
    rawRepeats,
  });
  return {
    rowId: input.rowId,
    checkpoint: basename(input.checkpoint.pdfPath, '.pdf'),
    pdfPath: input.checkpoint.pdfPath,
    metadataPath: input.checkpoint.metadataPath,
    bufferSha256,
    metadata: input.checkpoint.metadata,
    classification: classification.classification,
    classificationReason: classification.reason,
    externalRepeats,
    rawRepeats,
  };
}

function renderMarkdown(report: { runDir: string; baselineRun: string; rows: CheckpointReport[] }): string {
  const lines = [
    '# Stage 123 Protected State Diagnostic',
    '',
    `- Run: \`${report.runDir}\``,
    `- Baseline: \`${report.baselineRun}\``,
    '',
    '| Row | Checkpoint | In-run | External scores | Raw signatures | Class | Reason |',
    '| --- | --- | ---: | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push([
      row.rowId,
      row.checkpoint,
      row.metadata.score,
      row.externalRepeats.map(repeat => repeat.score ?? 'err').join(', '),
      [...new Set(row.rawRepeats.map(repeat => repeat.signature ?? repeat.error ?? 'err'))].join(', '),
      row.classification,
      row.classificationReason,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baselineRows = await readBaselineRows(args.baselineRun);
  const rows: CheckpointReport[] = [];
  for (const id of args.ids) {
    const checkpoints = await listCheckpoints(args.runDir, id);
    for (const checkpoint of checkpoints) {
      const row = await buildCheckpointReport({
        rowId: id,
        checkpoint,
        baseline: baselineRows.get(id),
        repeats: args.repeats,
      });
      rows.push(row);
      console.log(`${id}/${row.checkpoint}: ${row.classification} (${row.classificationReason})`);
    }
  }
  const out = resolve(args.out);
  const report = {
    generatedAt: new Date().toISOString(),
    runDir: resolve(args.runDir),
    baselineRun: resolve(args.baselineRun),
    repeats: args.repeats,
    pythonScriptPath: PYTHON_SCRIPT_PATH,
    rows,
  };
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage123-protected-state-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(out, 'stage123-protected-state-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
