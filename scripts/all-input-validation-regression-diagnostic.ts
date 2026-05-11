#!/usr/bin/env tsx
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  buildAllInputMeanDiagnostic,
  classifyAllInputRow,
  type AllInputFamily,
  type BaselineCorpusRow,
} from './all-input-mean-diagnostic.js';

const DEFAULT_PREVIOUS_ROOT = 'Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-10-r2';
const DEFAULT_CURRENT_ROOT = 'Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-11-r3';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/fresh-r3-regression-diagnostic-2026-05-11-r1';
const DEFAULT_TARGET_MEAN = 93;

export type ValidationRegressionClassification =
  | 'fresh_regression'
  | 'overlay_not_repeated'
  | 'runtime_timeout_regression'
  | 'stable_low_debt'
  | 'fresh_improvement'
  | 'unchanged';

export interface ValidationRegressionRow {
  file: string;
  family: AllInputFamily;
  previousScore: number | null;
  currentScore: number | null;
  bestOverlayScore: number | null;
  previousGrade: string | null;
  currentGrade: string | null;
  scoreDelta: number | null;
  overlayDelta: number | null;
  targetDeficit: number;
  previousDurationMs: number | null;
  currentDurationMs: number | null;
  classification: ValidationRegressionClassification;
  rationale: string;
}

export interface ValidationRegressionDiagnostic {
  generatedAt: string;
  previousRoot: string;
  currentRoot: string;
  overlayRuns: string[];
  targetMean: number;
  summary: {
    previousMean: number;
    currentMean: number;
    meanDelta: number;
    previousRowsBelowTarget: number;
    currentRowsBelowTarget: number;
    previousPointsNeeded: number;
    currentPointsNeeded: number;
    regressionRows: number;
    overlayNotRepeatedRows: number;
    runtimeTimeoutRegressionRows: number;
    stableLowDebtRows: number;
  };
  rows: ValidationRegressionRow[];
  topRegressions: ValidationRegressionRow[];
  topOverlayMisses: ValidationRegressionRow[];
}

interface CliArgs {
  previousRoot: string;
  currentRoot: string;
  out: string;
  overlayRuns: string[];
  targetMean: number;
}

function parseArgs(argv: string[]): CliArgs {
  let previousRoot = DEFAULT_PREVIOUS_ROOT;
  let currentRoot = DEFAULT_CURRENT_ROOT;
  let out = DEFAULT_OUT;
  let targetMean = DEFAULT_TARGET_MEAN;
  const overlayRuns: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--previous-root' && next) {
      previousRoot = next;
      i++;
    } else if (arg === '--current-root' && next) {
      currentRoot = next;
      i++;
    } else if (arg === '--overlay-run' && next) {
      overlayRuns.push(next);
      i++;
    } else if (arg === '--out' && next) {
      out = next;
      i++;
    } else if (arg === '--target-mean' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed)) targetMean = parsed;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-validation-regression-diagnostic.ts [options]',
        '',
        `  --previous-root <dir>  Previous fresh validation root (default: ${DEFAULT_PREVIOUS_ROOT})`,
        `  --current-root <dir>   Current fresh validation root (default: ${DEFAULT_CURRENT_ROOT})`,
        '  --overlay-run <dir>    Targeted overlay run to compare against current fresh validation; repeatable',
        `  --out <dir>            Output directory (default: ${DEFAULT_OUT})`,
        `  --target-mean <score>  Target mean (default: ${DEFAULT_TARGET_MEAN})`,
      ].join('\n'));
      process.exit(0);
    }
  }
  return { previousRoot, currentRoot, out, overlayRuns, targetMean };
}

function round(value: number, digits = 4): number {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

async function findBaselineReports(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name === 'baseline_report.json') {
        out.push(path);
      }
    }
  }
  await visit(root);
  return out.sort((a, b) => a.localeCompare(b));
}

async function readRows(rootOrReport: string): Promise<BaselineCorpusRow[]> {
  if (rootOrReport.endsWith('.json')) {
    const parsed = JSON.parse(await readFile(rootOrReport, 'utf8')) as { rows?: BaselineCorpusRow[] } | BaselineCorpusRow[];
    return Array.isArray(parsed) ? parsed : parsed.rows ?? [];
  }
  const rows: BaselineCorpusRow[] = [];
  for (const report of await findBaselineReports(rootOrReport)) {
    const parsed = JSON.parse(await readFile(report, 'utf8')) as { rows?: BaselineCorpusRow[] } | BaselineCorpusRow[];
    rows.push(...(Array.isArray(parsed) ? parsed : parsed.rows ?? []));
  }
  return rows;
}

function byBasename(rows: BaselineCorpusRow[]): Map<string, BaselineCorpusRow> {
  const map = new Map<string, BaselineCorpusRow>();
  for (const row of rows) map.set(basename(row.file), row);
  return map;
}

function score(row: BaselineCorpusRow | undefined): number | null {
  return typeof row?.afterScore === 'number' && Number.isFinite(row.afterScore) ? row.afterScore : null;
}

function grade(row: BaselineCorpusRow | undefined): string | null {
  return typeof row?.afterGrade === 'string' ? row.afterGrade : null;
}

function duration(row: BaselineCorpusRow | undefined): number | null {
  return typeof row?.durationMs === 'number' && Number.isFinite(row.durationMs) ? row.durationMs : null;
}

function isTimeout(row: BaselineCorpusRow | undefined): boolean {
  const text = `${(row as { error?: unknown } | undefined)?.error ?? ''}`.toLowerCase();
  return text.includes('timeout') || (duration(row) ?? 0) >= 295_000;
}

function categoryRows(row: BaselineCorpusRow): Array<{ key: string; score: number; applicable?: boolean }> {
  return row.categoryGap?.after ?? row.categoriesBefore ?? [];
}

function syntheticRow(file: string, current: BaselineCorpusRow | undefined, previous: BaselineCorpusRow | undefined): BaselineCorpusRow {
  const source = current ?? previous;
  return {
    file,
    afterScore: score(source) ?? 0,
    afterGrade: grade(source) ?? '?',
    categoryGap: { after: source ? categoryRows(source) : [] },
  };
}

function classify(input: {
  previous: BaselineCorpusRow | undefined;
  current: BaselineCorpusRow | undefined;
  bestOverlayScore: number | null;
  targetMean: number;
}): { classification: ValidationRegressionClassification; rationale: string } {
  const previousScore = score(input.previous);
  const currentScore = score(input.current);
  if (currentScore === null) {
    return { classification: 'unchanged', rationale: 'Current row has no numeric score.' };
  }
  if (isTimeout(input.current) && !(input.previous && isTimeout(input.previous))) {
    return { classification: 'runtime_timeout_regression', rationale: 'Current fresh run reached the wall timeout but the previous fresh run did not.' };
  }
  if (input.bestOverlayScore !== null && input.bestOverlayScore > currentScore) {
    return { classification: 'overlay_not_repeated', rationale: 'A targeted/overlay route scored higher than the current fresh validation route.' };
  }
  if (previousScore !== null && currentScore < previousScore) {
    return { classification: 'fresh_regression', rationale: 'Current fresh validation score is lower than previous fresh validation.' };
  }
  if (previousScore !== null && currentScore > previousScore) {
    return { classification: 'fresh_improvement', rationale: 'Current fresh validation improved over the previous fresh validation.' };
  }
  if (currentScore < input.targetMean) {
    return { classification: 'stable_low_debt', rationale: 'Row remains below target in both fresh validations without a higher overlay route.' };
  }
  return { classification: 'unchanged', rationale: 'No score-moving regression or below-target debt.' };
}

export function buildValidationRegressionDiagnostic(input: {
  previousRows: BaselineCorpusRow[];
  currentRows: BaselineCorpusRow[];
  overlayRowsByRun?: Array<{ runDir: string; rows: BaselineCorpusRow[] }>;
  previousRoot?: string;
  currentRoot?: string;
  targetMean?: number;
  generatedAt?: string;
}): ValidationRegressionDiagnostic {
  const targetMean = input.targetMean ?? DEFAULT_TARGET_MEAN;
  const previousByFile = byBasename(input.previousRows);
  const currentByFile = byBasename(input.currentRows);
  const overlayByFile = new Map<string, { score: number; runDir: string }>();
  for (const run of input.overlayRowsByRun ?? []) {
    for (const row of run.rows) {
      const rowScore = score(row);
      if (rowScore === null) continue;
      const key = basename(row.file);
      const existing = overlayByFile.get(key);
      if (!existing || rowScore > existing.score) {
        overlayByFile.set(key, { score: rowScore, runDir: run.runDir });
      }
    }
  }

  const keys = [...new Set([...previousByFile.keys(), ...currentByFile.keys()])].sort((a, b) => a.localeCompare(b));
  const rows = keys.map(file => {
    const previous = previousByFile.get(file);
    const current = currentByFile.get(file);
    const previousScore = score(previous);
    const currentScore = score(current);
    const bestOverlayScore = overlayByFile.get(file)?.score ?? null;
    const decision = classify({ previous, current, bestOverlayScore, targetMean });
    return {
      file,
      family: classifyAllInputRow(syntheticRow(file, current, previous)),
      previousScore,
      currentScore,
      bestOverlayScore,
      previousGrade: grade(previous),
      currentGrade: grade(current),
      scoreDelta: previousScore !== null && currentScore !== null ? currentScore - previousScore : null,
      overlayDelta: bestOverlayScore !== null && currentScore !== null ? bestOverlayScore - currentScore : null,
      targetDeficit: currentScore !== null ? Math.max(0, targetMean - currentScore) : targetMean,
      previousDurationMs: duration(previous),
      currentDurationMs: duration(current),
      classification: decision.classification,
      rationale: decision.rationale,
    };
  });

  const previousSummary = buildAllInputMeanDiagnostic({ rows: input.previousRows, targetMean }).summary;
  const currentSummary = buildAllInputMeanDiagnostic({ rows: input.currentRows, targetMean }).summary;
  const count = (classification: ValidationRegressionClassification) => rows.filter(row => row.classification === classification).length;

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    previousRoot: input.previousRoot ?? '',
    currentRoot: input.currentRoot ?? '',
    overlayRuns: (input.overlayRowsByRun ?? []).map(run => run.runDir),
    targetMean,
    summary: {
      previousMean: previousSummary.mean,
      currentMean: currentSummary.mean,
      meanDelta: round(currentSummary.mean - previousSummary.mean),
      previousRowsBelowTarget: previousSummary.rowsBelowTarget,
      currentRowsBelowTarget: currentSummary.rowsBelowTarget,
      previousPointsNeeded: previousSummary.pointsNeededForTargetMean,
      currentPointsNeeded: currentSummary.pointsNeededForTargetMean,
      regressionRows: count('fresh_regression'),
      overlayNotRepeatedRows: count('overlay_not_repeated'),
      runtimeTimeoutRegressionRows: count('runtime_timeout_regression'),
      stableLowDebtRows: count('stable_low_debt'),
    },
    rows: rows.sort((a, b) => {
      const aPriority = (a.overlayDelta ?? 0) + Math.max(0, -(a.scoreDelta ?? 0)) + a.targetDeficit;
      const bPriority = (b.overlayDelta ?? 0) + Math.max(0, -(b.scoreDelta ?? 0)) + b.targetDeficit;
      return bPriority - aPriority || a.file.localeCompare(b.file);
    }),
    topRegressions: rows
      .filter(row => (row.scoreDelta ?? 0) < 0 || row.classification === 'runtime_timeout_regression')
      .sort((a, b) => (a.scoreDelta ?? 0) - (b.scoreDelta ?? 0) || b.targetDeficit - a.targetDeficit || a.file.localeCompare(b.file))
      .slice(0, 30),
    topOverlayMisses: rows
      .filter(row => (row.overlayDelta ?? 0) > 0)
      .sort((a, b) => (b.overlayDelta ?? 0) - (a.overlayDelta ?? 0) || b.targetDeficit - a.targetDeficit || a.file.localeCompare(b.file))
      .slice(0, 30),
  };
}

function renderRows(rows: ValidationRegressionRow[]): string[] {
  const lines = [
    '| File | Class | Prev | Current | Best overlay | Delta | Overlay miss | Deficit | Family | Runtime ms |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |',
  ];
  for (const row of rows) {
    lines.push(`| \`${row.file}\` | ${row.classification} | ${row.previousScore ?? ''}/${row.previousGrade ?? ''} | ${row.currentScore ?? ''}/${row.currentGrade ?? ''} | ${row.bestOverlayScore ?? ''} | ${row.scoreDelta ?? ''} | ${row.overlayDelta ?? ''} | ${row.targetDeficit} | ${row.family} | ${row.currentDurationMs ?? ''} |`);
  }
  if (rows.length === 0) lines.push('| none |  |  |  |  |  |  |  |  |  |');
  return lines;
}

function renderMarkdown(report: ValidationRegressionDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Input Validation Regression Diagnostic');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Previous root: \`${report.previousRoot}\``);
  lines.push(`- Current root: \`${report.currentRoot}\``);
  lines.push(`- Overlay runs: ${report.overlayRuns.map(run => `\`${run}\``).join(', ') || 'none'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Previous | Current | Delta |');
  lines.push('| --- | ---: | ---: | ---: |');
  lines.push(`| Mean | ${report.summary.previousMean} | ${report.summary.currentMean} | ${report.summary.meanDelta} |`);
  lines.push(`| Rows below ${report.targetMean} | ${report.summary.previousRowsBelowTarget} | ${report.summary.currentRowsBelowTarget} | ${report.summary.currentRowsBelowTarget - report.summary.previousRowsBelowTarget} |`);
  lines.push(`| Points needed | ${report.summary.previousPointsNeeded} | ${report.summary.currentPointsNeeded} | ${round(report.summary.currentPointsNeeded - report.summary.previousPointsNeeded, 1)} |`);
  lines.push('');
  lines.push('| Class | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| runtime_timeout_regression | ${report.summary.runtimeTimeoutRegressionRows} |`);
  lines.push(`| overlay_not_repeated | ${report.summary.overlayNotRepeatedRows} |`);
  lines.push(`| fresh_regression | ${report.summary.regressionRows} |`);
  lines.push(`| stable_low_debt | ${report.summary.stableLowDebtRows} |`);
  lines.push('');
  lines.push('## Top Regressions');
  lines.push('');
  lines.push(...renderRows(report.topRegressions));
  lines.push('');
  lines.push('## Top Overlay Misses');
  lines.push('');
  lines.push(...renderRows(report.topOverlayMisses));
  lines.push('');
  lines.push('## Recommendation');
  lines.push('');
  lines.push('Prioritize rows that are both `overlay_not_repeated` and high deficit, because they have proof of a better route but did not reproduce in the fresh run. Treat `runtime_timeout_regression` as runtime-tail work only when an eligible safe checkpoint exists; do not lower PAC strictness or checkpoint floors from this diagnostic alone.');
  return `${lines.join('\n')}\n`;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const previousRows = await readRows(args.previousRoot);
  const currentRows = await readRows(args.currentRoot);
  const overlayRowsByRun = [];
  for (const runDir of args.overlayRuns) {
    overlayRowsByRun.push({ runDir, rows: await readRows(runDir) });
  }
  const report = buildValidationRegressionDiagnostic({
    previousRows,
    currentRows,
    overlayRowsByRun,
    previousRoot: args.previousRoot,
    currentRoot: args.currentRoot,
    targetMean: args.targetMean,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'all-input-validation-regression-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.out, 'all-input-validation-regression-diagnostic.md'), renderMarkdown(report));
  console.log(`Wrote ${join(args.out, 'all-input-validation-regression-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
