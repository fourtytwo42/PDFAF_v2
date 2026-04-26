#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEdgeMixSummary,
  classifyEdgeMixResidual,
  type EdgeMixBenchmarkRow,
} from './stage49-edge-mix-baseline.js';

export type Stage126RowClass =
  | 'stable_engine_gain'
  | 'stable_fix_candidate'
  | 'analyzer_volatility'
  | 'manual_scanned_policy_debt'
  | 'runtime_tail'
  | 'already_good_control';

export interface Stage126RepeatStats {
  scores: number[];
  min: number | null;
  max: number | null;
  range: number | null;
}

export interface Stage126ClassifiedRow {
  id: string;
  publicationId: string;
  title: string;
  localFile: string;
  beforeScore: number | null;
  beforeGrade: string | null;
  afterScore: number | null;
  afterGrade: string | null;
  delta: number | null;
  totalPipelineMs: number | null;
  attempts: number;
  residualFamily: string;
  classification: Stage126RowClass;
  repeatStats: Stage126RepeatStats;
  reasons: string[];
}

export interface Stage126Report {
  generatedAt: string;
  baselineRunDir: string;
  repeatRunDirs: string[];
  summary: {
    count: number;
    success: number;
    errors: number;
    meanBefore: number;
    meanAfter: number;
    medianBefore: number;
    medianAfter: number;
    abRateAfter: number;
    fCountAfter: number;
    totalToolAttempts: number;
    falsePositiveAppliedCount: number;
    runtimeMs: {
      p50: number;
      p95: number;
      max: number;
    };
    residualFamilyDistribution: Record<string, number>;
    classificationDistribution: Record<Stage126RowClass, number>;
    repeatability: {
      denominator: number;
      withinFiveScorePoints: number;
      rate: number;
    };
    selectedNextDirections: string[];
    passCriteria: {
      completedWithoutCrashes: boolean;
      falsePositiveAppliedZero: boolean;
      repeatabilityEightyPercent: boolean;
    };
  };
  rows: Stage126ClassifiedRow[];
}

interface Args {
  baselineRunDir: string;
  repeatRunDirs: string[];
  outDir: string;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage126-holdout-generalization-report.ts --run <dir> [options]

Options:
  --run <dir>          Baseline Stage 126 holdout run directory
  --repeat-run <dir>   Repeat run directory for selected rows; repeatable
  --out <dir>          Output report directory (default: <run>/stage126-report)
  --help               Show this help`;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function p95(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

function grade(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function catMap(row: EdgeMixBenchmarkRow): Record<string, number> {
  return Object.fromEntries((row.afterCategories ?? []).map(category => [category.key, category.score]));
}

function problemText(row: EdgeMixBenchmarkRow): string {
  return [
    row.localFile,
    row.afterPdfClass ?? '',
    row.beforePdfClass ?? '',
    ...(row.problemMix ?? []),
  ].join(' ').toLowerCase();
}

function repeatStats(row: EdgeMixBenchmarkRow, repeatRows: EdgeMixBenchmarkRow[]): Stage126RepeatStats {
  const scores = [row, ...repeatRows]
    .map(item => item.afterScore)
    .filter((score): score is number => typeof score === 'number');
  if (scores.length === 0) return { scores: [], min: null, max: null, range: null };
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return { scores, min, max, range: max - min };
}

export function classifyStage126HoldoutRow(input: {
  row: EdgeMixBenchmarkRow;
  repeatRows?: EdgeMixBenchmarkRow[];
  runtimeP95Ms?: number;
}): { classification: Stage126RowClass; repeatStats: Stage126RepeatStats; reasons: string[] } {
  const row = input.row;
  const repeats = input.repeatRows ?? [];
  const stats = repeatStats(row, repeats);
  const reasons: string[] = [];
  const text = problemText(row);
  const after = row.afterScore;
  const before = row.beforeScore;
  const delta = row.delta ?? (typeof before === 'number' && typeof after === 'number' ? after - before : null);
  const runtime = row.totalPipelineMs ?? 0;
  const cats = catMap(row);

  if (text.includes('manual') || text.includes('scanned') || text.includes('ocr')) {
    reasons.push('manifest_or_pdf_class_manual_scanned');
    return { classification: 'manual_scanned_policy_debt', repeatStats: stats, reasons };
  }
  if ((stats.range ?? 0) >= 10) {
    reasons.push(`repeat_score_range=${stats.range}`);
    return { classification: 'analyzer_volatility', repeatStats: stats, reasons };
  }
  if (runtime >= Math.max(input.runtimeP95Ms ?? 0, 120_000)) {
    reasons.push(`runtime_ms=${runtime}`);
    return { classification: 'runtime_tail', repeatStats: stats, reasons };
  }
  if ((row.problemMix ?? []).includes('holdout_control') || (typeof before === 'number' && before >= 90 && typeof after === 'number' && after >= 90)) {
    reasons.push('control_or_already_high');
    return { classification: 'already_good_control', repeatStats: stats, reasons };
  }
  if (typeof after === 'number' && after < 70) {
    reasons.push('stable_below_c_residual');
    return { classification: 'stable_fix_candidate', repeatStats: stats, reasons };
  }
  if (typeof after === 'number' && (after >= 90 || (typeof delta === 'number' && delta >= 10))) {
    reasons.push(`stable_gain_delta=${delta ?? 'n/a'}`);
    return { classification: 'stable_engine_gain', repeatStats: stats, reasons };
  }
  if ((cats.alt_text ?? 100) < 70 || (cats.heading_structure ?? 100) < 70 || (cats.table_markup ?? 100) < 70 || (cats.text_extractability ?? 100) < 70 || (cats.link_quality ?? 100) < 70) {
    reasons.push('stable_low_category_residual');
  } else {
    reasons.push('stable_non_ab_residual');
  }
  return { classification: 'stable_fix_candidate', repeatStats: stats, reasons };
}

function distribution<T extends string>(values: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function selectedDirections(rows: Stage126ClassifiedRow[]): string[] {
  const stable = rows.filter(row => row.classification === 'stable_fix_candidate');
  const counts: Record<string, number> = {};
  for (const row of stable) counts[row.residualFamily] = (counts[row.residualFamily] ?? 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length === 0) return ['No stable fixer family selected; review analyzer/runtime/manual buckets first.'];
  return ranked.slice(0, 2).map(([family, count]) => `${family} (${count} stable rows)`);
}

export function buildStage126Report(input: {
  baselineRunDir: string;
  baselineRows: EdgeMixBenchmarkRow[];
  repeatRuns?: Array<{ runDir: string; rows: EdgeMixBenchmarkRow[] }>;
  generatedAt?: string;
}): Stage126Report {
  const repeatById = new Map<string, EdgeMixBenchmarkRow[]>();
  for (const run of input.repeatRuns ?? []) {
    for (const row of run.rows) {
      const key = row.publicationId || row.id;
      const existing = repeatById.get(key) ?? [];
      existing.push(row);
      repeatById.set(key, existing);
    }
  }
  const summary = buildEdgeMixSummary(input.baselineRows);
  const runtimeValues = input.baselineRows
    .map(row => row.totalPipelineMs)
    .filter((value): value is number => typeof value === 'number');
  const runtimeP95 = p95(runtimeValues);
  const rows = input.baselineRows.map(row => {
    const key = row.publicationId || row.id;
    const classification = classifyStage126HoldoutRow({
      row,
      repeatRows: repeatById.get(key) ?? [],
      runtimeP95Ms: runtimeP95,
    });
    const residual = classifyEdgeMixResidual(row).recommendedFamily;
    return {
      id: row.id,
      publicationId: row.publicationId,
      title: row.title,
      localFile: row.localFile,
      beforeScore: row.beforeScore,
      beforeGrade: row.beforeGrade,
      afterScore: row.afterScore,
      afterGrade: row.afterGrade ?? grade(row.afterScore),
      delta: row.delta,
      totalPipelineMs: row.totalPipelineMs,
      attempts: row.appliedTools.length,
      residualFamily: residual,
      classification: classification.classification,
      repeatStats: classification.repeatStats,
      reasons: classification.reasons,
    };
  });
  const nonManualNonVolatile = rows.filter(row => !['manual_scanned_policy_debt', 'analyzer_volatility'].includes(row.classification));
  const repeatedStable = nonManualNonVolatile.filter(row => row.repeatStats.scores.length >= 2 && (row.repeatStats.range ?? 999) <= 5);
  const abCount = input.baselineRows.filter(row => ['A', 'B'].includes(row.afterGrade ?? grade(row.afterScore) ?? '')).length;
  const fCount = input.baselineRows.filter(row => (row.afterGrade ?? grade(row.afterScore)) === 'F').length;
  const residualFamilyDistribution: Record<string, number> = {};
  for (const row of rows.filter(item => (item.afterScore ?? 100) < 90)) {
    residualFamilyDistribution[row.residualFamily] = (residualFamilyDistribution[row.residualFamily] ?? 0) + 1;
  }
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    baselineRunDir: input.baselineRunDir,
    repeatRunDirs: (input.repeatRuns ?? []).map(run => run.runDir),
    summary: {
      count: input.baselineRows.length,
      success: input.baselineRows.filter(row => !row.error).length,
      errors: input.baselineRows.filter(row => row.error).length,
      meanBefore: summary.meanBefore,
      meanAfter: summary.meanAfter,
      medianBefore: summary.medianBefore,
      medianAfter: summary.medianAfter,
      abRateAfter: input.baselineRows.length ? abCount / input.baselineRows.length : 0,
      fCountAfter: fCount,
      totalToolAttempts: summary.totalToolAttempts,
      falsePositiveAppliedCount: summary.falsePositiveAppliedCount,
      runtimeMs: {
        p50: median(runtimeValues),
        p95: runtimeP95,
        max: runtimeValues.length ? Math.max(...runtimeValues) : 0,
      },
      residualFamilyDistribution,
      classificationDistribution: distribution(rows.map(row => row.classification)),
      repeatability: {
        denominator: nonManualNonVolatile.filter(row => row.repeatStats.scores.length >= 2).length,
        withinFiveScorePoints: repeatedStable.length,
        rate: nonManualNonVolatile.filter(row => row.repeatStats.scores.length >= 2).length
          ? repeatedStable.length / nonManualNonVolatile.filter(row => row.repeatStats.scores.length >= 2).length
          : 0,
      },
      selectedNextDirections: selectedDirections(rows),
      passCriteria: {
        completedWithoutCrashes: input.baselineRows.length === 30 && input.baselineRows.every(row => !row.error),
        falsePositiveAppliedZero: summary.falsePositiveAppliedCount === 0,
        repeatabilityEightyPercent: nonManualNonVolatile.filter(row => row.repeatStats.scores.length >= 2).length === 0
          ? false
          : repeatedStable.length / nonManualNonVolatile.filter(row => row.repeatStats.scores.length >= 2).length >= 0.8,
      },
    },
    rows,
  };
}

function renderMarkdown(report: Stage126Report): string {
  const lines = ['# Stage 126 v1 Holdout Generalization', ''];
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Baseline run: \`${report.baselineRunDir}\``);
  if (report.repeatRunDirs.length) lines.push(`Repeat runs: ${report.repeatRunDirs.map(dir => `\`${dir}\``).join(', ')}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Files: ${report.summary.count} (${report.summary.success} OK, ${report.summary.errors} errors)`);
  lines.push(`- Mean score: ${report.summary.meanBefore.toFixed(2)} -> ${report.summary.meanAfter.toFixed(2)}`);
  lines.push(`- Median score: ${report.summary.medianBefore} -> ${report.summary.medianAfter}`);
  lines.push(`- A/B after: ${(report.summary.abRateAfter * 100).toFixed(1)}%`);
  lines.push(`- F count after: ${report.summary.fCountAfter}`);
  lines.push(`- Runtime ms p50/p95/max: ${report.summary.runtimeMs.p50}/${report.summary.runtimeMs.p95}/${report.summary.runtimeMs.max}`);
  lines.push(`- Total tool attempts: ${report.summary.totalToolAttempts}`);
  lines.push(`- False-positive applied: ${report.summary.falsePositiveAppliedCount}`);
  lines.push(`- Residual families: \`${JSON.stringify(report.summary.residualFamilyDistribution)}\``);
  lines.push(`- Classifications: \`${JSON.stringify(report.summary.classificationDistribution)}\``);
  lines.push(`- Repeatability: ${report.summary.repeatability.withinFiveScorePoints}/${report.summary.repeatability.denominator} within 5 points (${(report.summary.repeatability.rate * 100).toFixed(1)}%)`);
  lines.push(`- Selected next directions: ${report.summary.selectedNextDirections.join('; ')}`);
  lines.push('');
  lines.push('## Pass Criteria');
  lines.push(`- 30/30 completed: ${report.summary.passCriteria.completedWithoutCrashes ? 'pass' : 'fail'}`);
  lines.push(`- False-positive applied 0: ${report.summary.passCriteria.falsePositiveAppliedZero ? 'pass' : 'fail'}`);
  lines.push(`- Repeatability >= 80%: ${report.summary.passCriteria.repeatabilityEightyPercent ? 'pass' : 'fail'}`);
  lines.push('');
  lines.push('## Rows');
  lines.push('| ID | Before | After | Class | Family | Repeat scores | Runtime ms | Attempts |');
  lines.push('| --- | ---: | ---: | --- | --- | --- | ---: | ---: |');
  for (const row of report.rows) {
    const before = row.beforeScore == null ? 'ERR' : `${row.beforeScore}/${row.beforeGrade ?? grade(row.beforeScore)}`;
    const after = row.afterScore == null ? 'ERR' : `${row.afterScore}/${row.afterGrade ?? grade(row.afterScore)}`;
    const repeats = row.repeatStats.scores.length ? row.repeatStats.scores.join('/') : 'n/a';
    lines.push(`| ${row.publicationId} | ${before} | ${after} | ${row.classification} | ${row.residualFamily} | ${repeats} | ${row.totalPipelineMs ?? 'n/a'} | ${row.attempts} |`);
  }
  lines.push('');
  lines.push('## Stable Fix Candidates');
  for (const row of report.rows.filter(item => item.classification === 'stable_fix_candidate')) {
    lines.push(`- ${row.publicationId}: ${row.residualFamily}; ${row.reasons.join('; ')}`);
  }
  lines.push('');
  lines.push('## Volatile Or Policy Rows');
  for (const row of report.rows.filter(item => ['analyzer_volatility', 'manual_scanned_policy_debt', 'runtime_tail'].includes(item.classification))) {
    lines.push(`- ${row.publicationId}: ${row.classification}; repeats=${row.repeatStats.scores.join('/') || 'n/a'}; ${row.reasons.join('; ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function readRows(runDir: string): Promise<EdgeMixBenchmarkRow[]> {
  return JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as EdgeMixBenchmarkRow[];
}

function parseArgs(argv: string[]): Args {
  argv = argv.filter((arg, index) => !(index === 0 && arg === '--'));
  let baselineRunDir = '';
  const repeatRunDirs: string[] = [];
  let outDir = '';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--run') baselineRunDir = resolve(argv[++i] ?? '');
    else if (arg === '--repeat-run') repeatRunDirs.push(resolve(argv[++i] ?? ''));
    else if (arg === '--out') outDir = resolve(argv[++i] ?? '');
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument ${arg}.\n${usage()}`);
    }
  }
  if (!baselineRunDir) throw new Error(`Missing --run.\n${usage()}`);
  return {
    baselineRunDir,
    repeatRunDirs,
    outDir: outDir || join(baselineRunDir, 'stage126-report'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baselineRows = await readRows(args.baselineRunDir);
  const repeatRuns = [];
  for (const runDir of args.repeatRunDirs) {
    repeatRuns.push({ runDir, rows: await readRows(runDir) });
  }
  const report = buildStage126Report({
    baselineRunDir: args.baselineRunDir,
    baselineRows,
    repeatRuns,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage126-holdout-generalization.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  await writeFile(join(args.outDir, 'stage126-holdout-generalization.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 126 report to ${args.outDir}`);
  console.log(`Mean: ${report.summary.meanBefore.toFixed(2)} -> ${report.summary.meanAfter.toFixed(2)}`);
  console.log(`Classifications: ${JSON.stringify(report.summary.classificationDistribution)}`);
  console.log(`Next directions: ${report.summary.selectedNextDirections.join('; ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
