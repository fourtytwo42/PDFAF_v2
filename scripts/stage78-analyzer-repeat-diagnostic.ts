#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  protectedReanalysisRepeatCount,
  protectedReanalysisUnsafeReason,
  sha256Buffer,
  type ProtectedReanalysisBaseline,
} from '../src/services/benchmark/protectedReanalysisSelection.js';
import type { AnalysisResult } from '../src/types.js';

interface BenchmarkCategory {
  key: string;
  score: number;
}

interface BenchmarkRow {
  id?: string;
  publicationId?: string;
  file?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: BenchmarkCategory[];
  afterScoreCapsApplied?: AnalysisResult['scoreCapsApplied'];
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  reanalyzedCategories?: BenchmarkCategory[];
  reanalyzedScoreCapsApplied?: AnalysisResult['scoreCapsApplied'];
}

type Classification =
  | 'same_buffer_stable'
  | 'same_buffer_volatile_floor_safe'
  | 'same_buffer_volatile_floor_unsafe'
  | 'route_debt_not_analyzer';

interface RepeatSummary {
  index: number;
  score: number;
  grade: string;
  categories: Record<string, number>;
  analysisDurationMs: number | null;
  wallMs: number;
  protectedUnsafeReason: string | null;
}

interface DiagnosticRow {
  id: string;
  runDir: string;
  pdfPath: string | null;
  bufferSha256: string | null;
  baselineScore: number | null;
  baselineCategories: Record<string, number>;
  repeatScores: number[];
  scoreRange: [number, number] | null;
  strongestCategorySwings: Array<{ key: string; min: number; max: number; delta: number }>;
  floorSafeRepeatIndexes: number[];
  classification: Classification;
  repeats: RepeatSummary[];
  reasons: string[];
}

const DEFAULT_BASELINE_RUN = 'Output/experiment-corpus-baseline/run-stage42-full-2026-04-21-r7';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage78-analyzer-repeat-diagnostic-2026-04-25-r1';
const DEFAULT_IDS = [
  'long-4516',
  'long-4683',
  'structure-4076',
  'fixture-teams-remediated',
  'short-4214',
  'structure-4108',
  'figure-4609',
];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage78-analyzer-repeat-diagnostic.ts [options]',
    '  --run <dir>           Benchmark run dir with pdfs/<row-id>.pdf artifacts. Repeatable.',
    `  --baseline-run <dir>  Default: ${DEFAULT_BASELINE_RUN}`,
    `  --out <dir>           Default: ${DEFAULT_OUT}`,
    '  --ids <csv>           Default: Stage 78 protected volatility ids',
    '  --repeats <n>         Repeat count, capped at 5. Defaults to PDFAF_PROTECTED_REANALYSIS_REPEATS or 3.',
  ].join('\n');
}

function parseArgs(argv: string[]): {
  baselineRun: string;
  runDirs: string[];
  out: string;
  ids: string[];
  repeats: number;
} {
  const args = {
    baselineRun: DEFAULT_BASELINE_RUN,
    runDirs: [] as string[],
    out: DEFAULT_OUT,
    ids: DEFAULT_IDS,
    repeats: protectedReanalysisRepeatCount(),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    const next = argv[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--run') args.runDirs.push(next);
    else if (arg === '--baseline-run') args.baselineRun = next;
    else if (arg === '--out') args.out = next;
    else if (arg === '--ids') args.ids = next.split(',').map(id => id.trim()).filter(Boolean);
    else if (arg === '--repeats') args.repeats = Math.max(1, Math.min(5, Number.parseInt(next, 10) || 3));
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  if (args.runDirs.length === 0) throw new Error('At least one --run directory is required.');
  return args;
}

async function readRunRows(runDir: string): Promise<Map<string, BenchmarkRow>> {
  const raw = await readFile(join(resolve(runDir), 'remediate.results.json'), 'utf8');
  const rows = JSON.parse(raw) as BenchmarkRow[];
  return new Map(rows.map(row => [String(row.id ?? row.publicationId ?? ''), row]));
}

function score(row?: BenchmarkRow): number | null {
  const value = row?.reanalyzedScore ?? row?.afterScore;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function grade(row?: BenchmarkRow): string | null {
  return row?.reanalyzedGrade ?? row?.afterGrade ?? null;
}

function categories(row?: BenchmarkRow): Record<string, number> {
  const source = row?.reanalyzedCategories?.length ? row.reanalyzedCategories : row?.afterCategories ?? [];
  return Object.fromEntries(source.map(category => [category.key, category.score]));
}

function scoreCaps(row?: BenchmarkRow): AnalysisResult['scoreCapsApplied'] {
  return row?.reanalyzedScoreCapsApplied?.length ? row.reanalyzedScoreCapsApplied : row?.afterScoreCapsApplied ?? [];
}

function baselineFor(row?: BenchmarkRow): ProtectedReanalysisBaseline | undefined {
  const baselineScore = score(row);
  if (baselineScore == null) return undefined;
  return {
    score: baselineScore,
    scoreCapsApplied: scoreCaps(row),
    categories: categories(row),
  };
}

async function analyzeBuffer(buffer: Buffer, filename: string): Promise<{
  result: AnalysisResult;
  wallMs: number;
}> {
  const tempPath = join(tmpdir(), `pdfaf-stage78-repeat-${randomUUID()}.pdf`);
  await writeFile(tempPath, buffer);
  const started = performance.now();
  try {
    const analyzed = await analyzePdf(tempPath, filename, { bypassCache: true });
    return {
      result: analyzed.result,
      wallMs: performance.now() - started,
    };
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

function analysisCategories(result: AnalysisResult): Record<string, number> {
  return Object.fromEntries(result.categories.map(category => [category.key, category.score]));
}

function categorySwings(repeats: RepeatSummary[]): Array<{ key: string; min: number; max: number; delta: number }> {
  const values = new Map<string, number[]>();
  for (const repeat of repeats) {
    for (const [key, scoreValue] of Object.entries(repeat.categories)) {
      const current = values.get(key) ?? [];
      current.push(scoreValue);
      values.set(key, current);
    }
  }
  return [...values.entries()]
    .map(([key, scores]) => {
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      return { key, min, max, delta: max - min };
    })
    .filter(row => row.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.key.localeCompare(b.key))
    .slice(0, 8);
}

function classify(input: {
  repeats: RepeatSummary[];
  baseline?: ProtectedReanalysisBaseline;
  pdfExists: boolean;
}): { classification: Classification; reasons: string[] } {
  if (!input.pdfExists) {
    return {
      classification: 'route_debt_not_analyzer',
      reasons: ['missing_write_pdfs_artifact'],
    };
  }
  if (input.repeats.length === 0) {
    return {
      classification: 'route_debt_not_analyzer',
      reasons: ['no_repeat_analysis'],
    };
  }
  const scores = input.repeats.map(repeat => repeat.score);
  const scoreDelta = Math.max(...scores) - Math.min(...scores);
  const strongestSwing = categorySwings(input.repeats)[0]?.delta ?? 0;
  const floorSafe = input.repeats.filter(repeat => repeat.protectedUnsafeReason == null).map(repeat => repeat.index);
  if (scoreDelta <= 2 && strongestSwing <= 2) {
    return {
      classification: 'same_buffer_stable',
      reasons: [`score_range=${Math.min(...scores)}..${Math.max(...scores)}`],
    };
  }
  if (!input.baseline) {
    return {
      classification: 'route_debt_not_analyzer',
      reasons: ['missing_protected_baseline'],
    };
  }
  if (floorSafe.length > 0) {
    return {
      classification: 'same_buffer_volatile_floor_safe',
      reasons: [`floor_safe_repeats=${floorSafe.join(',')}`],
    };
  }
  return {
    classification: 'same_buffer_volatile_floor_unsafe',
    reasons: [`score_range=${Math.min(...scores)}..${Math.max(...scores)}`],
  };
}

async function buildRow(input: {
  id: string;
  runDir: string;
  baseline?: BenchmarkRow;
  repeats: number;
}): Promise<DiagnosticRow> {
  const pdfPath = join(resolve(input.runDir), 'pdfs', `${input.id}.pdf`);
  let buffer: Buffer;
  try {
    buffer = await readFile(pdfPath);
  } catch {
    const baseline = baselineFor(input.baseline);
    return {
      id: input.id,
      runDir: input.runDir,
      pdfPath: null,
      bufferSha256: null,
      baselineScore: baseline?.score ?? null,
      baselineCategories: baseline?.categories ?? {},
      repeatScores: [],
      scoreRange: null,
      strongestCategorySwings: [],
      floorSafeRepeatIndexes: [],
      classification: 'route_debt_not_analyzer',
      repeats: [],
      reasons: ['missing_write_pdfs_artifact'],
    };
  }

  const baseline = baselineFor(input.baseline);
  const bufferSha256 = sha256Buffer(buffer);
  const repeatRows: RepeatSummary[] = [];
  const filename = input.baseline?.file?.split('/').pop() ?? `${input.id}.pdf`;
  for (let index = 1; index <= input.repeats; index += 1) {
    const analyzed = await analyzeBuffer(buffer, filename);
    repeatRows.push({
      index,
      score: analyzed.result.score,
      grade: analyzed.result.grade,
      categories: analysisCategories(analyzed.result),
      analysisDurationMs: analyzed.result.analysisDurationMs ?? null,
      wallMs: analyzed.wallMs,
      protectedUnsafeReason: baseline
        ? protectedReanalysisUnsafeReason({ baseline, analysis: analyzed.result })
        : 'protected_baseline_missing',
    });
  }

  const scores = repeatRows.map(row => row.score);
  const floorSafeRepeatIndexes = repeatRows
    .filter(row => row.protectedUnsafeReason == null)
    .map(row => row.index);
  const classification = classify({
    repeats: repeatRows,
    baseline,
    pdfExists: true,
  });
  return {
    id: input.id,
    runDir: input.runDir,
    pdfPath,
    bufferSha256,
    baselineScore: baseline?.score ?? null,
    baselineCategories: baseline?.categories ?? {},
    repeatScores: scores,
    scoreRange: scores.length ? [Math.min(...scores), Math.max(...scores)] : null,
    strongestCategorySwings: categorySwings(repeatRows),
    floorSafeRepeatIndexes,
    classification: classification.classification,
    repeats: repeatRows,
    reasons: classification.reasons,
  };
}

function renderMarkdown(rows: DiagnosticRow[]): string {
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});
  const lines = [
    '# Stage 78 Analyzer Repeat Diagnostic',
    '',
    '## Classification Counts',
    '',
    ...Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => `- ${key}: ${count}`),
    '',
    '## Rows',
    '',
  ];
  for (const row of rows) {
    const range = row.scoreRange ? `${row.scoreRange[0]}..${row.scoreRange[1]}` : 'n/a';
    lines.push(`### ${row.id}`);
    lines.push(`- Run: ${row.runDir}`);
    lines.push(`- Classification: ${row.classification}`);
    lines.push(`- Buffer SHA-256: ${row.bufferSha256 ?? 'n/a'}`);
    lines.push(`- Baseline score: ${row.baselineScore ?? 'n/a'}`);
    lines.push(`- Repeat scores: ${row.repeatScores.join(', ') || 'n/a'} (${range})`);
    lines.push(`- Floor-safe repeats: ${row.floorSafeRepeatIndexes.join(', ') || 'none'}`);
    lines.push(`- Reasons: ${row.reasons.join('; ') || 'none'}`);
    if (row.strongestCategorySwings.length > 0) {
      lines.push(`- Strongest category swings: ${row.strongestCategorySwings
        .map(swing => `${swing.key} ${swing.min}..${swing.max}`)
        .join('; ')}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baselineRows = await readRunRows(args.baselineRun);
  const rows: DiagnosticRow[] = [];
  for (const runDir of args.runDirs) {
    for (const id of args.ids) {
      process.stdout.write(`[${id}] ${runDir} ... `);
      const row = await buildRow({
        id,
        runDir,
        baseline: baselineRows.get(id),
        repeats: args.repeats,
      });
      rows.push(row);
      console.log(`${row.classification} scores=${row.repeatScores.join(',') || 'n/a'}`);
    }
  }
  await mkdir(resolve(args.out), { recursive: true });
  await writeFile(join(resolve(args.out), 'stage78-analyzer-repeat-diagnostic.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    baselineRun: args.baselineRun,
    runDirs: args.runDirs,
    ids: args.ids,
    repeats: args.repeats,
    rows,
  }, null, 2), 'utf8');
  await writeFile(join(resolve(args.out), 'stage78-analyzer-repeat-diagnostic.md'), renderMarkdown(rows), 'utf8');
  console.log(`Wrote ${resolve(args.out)}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
