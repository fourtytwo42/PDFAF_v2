#!/usr/bin/env tsx
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DEFAULT_ROOT = 'Output/goal-all-input-mean-2026-05-09-r1/shard-runs';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1';
const TARGET_MEAN = 93;

export type AllInputFamily =
  | 'heading_reading_order'
  | 'table_debt'
  | 'table_alt_mixed'
  | 'alt_debt'
  | 'link_reading_debt'
  | 'pdfua_strict_debt'
  | 'aggregate_near_pass_or_unknown';

export interface BaselineCategoryRow {
  key: string;
  score: number;
  applicable?: boolean;
}

export interface BaselineCorpusRow {
  file: string;
  beforeScore?: number;
  beforeGrade?: string;
  afterScore: number;
  afterGrade: string;
  durationMs?: number;
  error?: string;
  categoriesBefore?: BaselineCategoryRow[];
  categoryGap?: {
    before?: BaselineCategoryRow[];
    after?: BaselineCategoryRow[];
  };
}

export interface AllInputSummaryRow {
  file: string;
  score: number;
  grade: string;
  family: AllInputFamily;
  deficitTo93: number;
  durationMs: number | null;
  weakest: Array<{ key: string; score: number; applicable: boolean }>;
}

export interface AllInputFamilySummary {
  family: AllInputFamily;
  count: number;
  deficitTo93: number;
  avgScore: number;
  medianScore: number;
  topFiles: string[];
}

export interface AllInputMeanDiagnostic {
  generatedAt: string;
  sourceRoot: string;
  targetMean: number;
  summary: {
    processed: number;
    mean: number;
    median: number;
    gradeDistribution: Record<string, number>;
    rowsBelowTarget: number;
    pointsNeededForTargetMean: number;
    runtimeMeanMs: number;
    runtimeMedianMs: number;
    runtimeP95Ms: number;
    runtimeMaxMs: number;
  };
  familySummaries: AllInputFamilySummary[];
  lowestRows: AllInputSummaryRow[];
  slowestRows: AllInputSummaryRow[];
}

interface CliArgs {
  root: string;
  out: string;
  targetMean: number;
}

function parseArgs(argv: string[]): CliArgs {
  let root = DEFAULT_ROOT;
  let out = DEFAULT_OUT;
  let targetMean = TARGET_MEAN;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--root' && next) {
      root = next;
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
        'Usage: pnpm exec tsx scripts/all-input-mean-diagnostic.ts [--root <shard-run-root>] [--out <output-dir>] [--target-mean <score>]',
        '',
        `Defaults: --root ${DEFAULT_ROOT} --out ${DEFAULT_OUT} --target-mean ${TARGET_MEAN}`,
      ].join('\n'));
      process.exit(0);
    }
  }
  return { root, out, targetMean };
}

function round(value: number, digits = 2): number {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function categoryRows(row: BaselineCorpusRow): BaselineCategoryRow[] {
  return row.categoryGap?.after ?? row.categoriesBefore ?? [];
}

function scoreOf(categories: BaselineCategoryRow[], key: string): number | null {
  const found = categories.find(item => item.key === key);
  if (!found || found.applicable === false) return null;
  return typeof found.score === 'number' ? found.score : null;
}

function weakestCategories(row: BaselineCorpusRow): Array<{ key: string; score: number; applicable: boolean }> {
  return categoryRows(row)
    .map(category => ({
      key: category.key,
      score: category.score,
      applicable: category.applicable !== false,
    }))
    .filter(category => category.applicable)
    .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key))
    .slice(0, 4);
}

export function classifyAllInputRow(row: BaselineCorpusRow): AllInputFamily {
  const categories = categoryRows(row);
  const heading = scoreOf(categories, 'heading_structure') ?? 100;
  const reading = scoreOf(categories, 'reading_order') ?? 100;
  const table = scoreOf(categories, 'table_markup') ?? 100;
  const alt = scoreOf(categories, 'alt_text') ?? 100;
  const pdfua = scoreOf(categories, 'pdf_ua_compliance') ?? 100;
  const link = scoreOf(categories, 'link_quality') ?? 100;

  if (table < 70 && alt < 70) return 'table_alt_mixed';
  if (table < 70) return 'table_debt';
  if (alt < 70) return 'alt_debt';
  if (heading < 70 || reading < 70) return 'heading_reading_order';
  if (link < 85 || reading < 85) return 'link_reading_debt';
  if (pdfua < 85) return 'pdfua_strict_debt';
  return 'aggregate_near_pass_or_unknown';
}

export function buildAllInputMeanDiagnostic(input: {
  rows: BaselineCorpusRow[];
  sourceRoot?: string;
  targetMean?: number;
  generatedAt?: string;
  lowestLimit?: number;
  slowestLimit?: number;
}): AllInputMeanDiagnostic {
  const targetMean = input.targetMean ?? TARGET_MEAN;
  const rows = input.rows
    .filter(row => typeof row.afterScore === 'number')
    .sort((a, b) => a.file.localeCompare(b.file));
  const scores = rows.map(row => row.afterScore);
  const runtimes = rows.map(row => row.durationMs ?? 0).filter(value => value > 0);
  const gradeDistribution: Record<string, number> = {};
  for (const row of rows) {
    gradeDistribution[row.afterGrade] = (gradeDistribution[row.afterGrade] ?? 0) + 1;
  }

  const summaryRows: AllInputSummaryRow[] = rows.map(row => ({
    file: row.file,
    score: row.afterScore,
    grade: row.afterGrade,
    family: classifyAllInputRow(row),
    deficitTo93: Math.max(0, targetMean - row.afterScore),
    durationMs: typeof row.durationMs === 'number' ? row.durationMs : null,
    weakest: weakestCategories(row),
  }));
  const belowTarget = summaryRows.filter(row => row.score < targetMean);

  const familySummaries = [...new Set(belowTarget.map(row => row.family))]
    .map(family => {
      const familyRows = belowTarget.filter(row => row.family === family);
      const familyScores = familyRows.map(row => row.score);
      return {
        family,
        count: familyRows.length,
        deficitTo93: round(familyRows.reduce((sum, row) => sum + row.deficitTo93, 0), 1),
        avgScore: round(familyScores.reduce((sum, score) => sum + score, 0) / Math.max(1, familyScores.length), 2),
        medianScore: round(median(familyScores), 2),
        topFiles: familyRows
          .sort((a, b) => b.deficitTo93 - a.deficitTo93 || a.file.localeCompare(b.file))
          .slice(0, 8)
          .map(row => row.file),
      };
    })
    .sort((a, b) => b.deficitTo93 - a.deficitTo93 || b.count - a.count || a.family.localeCompare(b.family));

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceRoot: input.sourceRoot ?? '',
    targetMean,
    summary: {
      processed: rows.length,
      mean: round(scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length), 4),
      median: round(median(scores), 2),
      gradeDistribution,
      rowsBelowTarget: belowTarget.length,
      pointsNeededForTargetMean: round(Math.max(0, targetMean * rows.length - scores.reduce((sum, score) => sum + score, 0)), 1),
      runtimeMeanMs: round(runtimes.reduce((sum, value) => sum + value, 0) / Math.max(1, runtimes.length), 1),
      runtimeMedianMs: round(median(runtimes), 1),
      runtimeP95Ms: round(percentile(runtimes, 95), 1),
      runtimeMaxMs: Math.max(0, ...runtimes),
    },
    familySummaries,
    lowestRows: summaryRows
      .sort((a, b) => a.score - b.score || b.deficitTo93 - a.deficitTo93 || a.file.localeCompare(b.file))
      .slice(0, input.lowestLimit ?? 40),
    slowestRows: summaryRows
      .filter(row => row.durationMs !== null)
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0) || a.file.localeCompare(b.file))
      .slice(0, input.slowestLimit ?? 20),
  };
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

async function loadRows(root: string): Promise<BaselineCorpusRow[]> {
  const reports = await findBaselineReports(root);
  const rows: BaselineCorpusRow[] = [];
  for (const report of reports) {
    const parsed = JSON.parse(await readFile(report, 'utf8')) as { rows?: BaselineCorpusRow[] };
    rows.push(...(parsed.rows ?? []));
  }
  return rows;
}

function formatGradeDistribution(dist: Record<string, number>): string {
  return ['A', 'B', 'C', 'D', 'F']
    .map(grade => `${dist[grade] ?? 0} ${grade}`)
    .join(' / ');
}

function renderMarkdown(report: AllInputMeanDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Input Mean Diagnostic');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Source root: \`${report.sourceRoot}\``);
  lines.push(`- PDFs processed: ${report.summary.processed}`);
  lines.push(`- Mean after remediation: ${report.summary.mean}`);
  lines.push(`- Median after remediation: ${report.summary.median}`);
  lines.push(`- Grade distribution: ${formatGradeDistribution(report.summary.gradeDistribution)}`);
  lines.push(`- Rows below ${report.targetMean}: ${report.summary.rowsBelowTarget}`);
  lines.push(`- Points needed for mean ${report.targetMean}: ${report.summary.pointsNeededForTargetMean}`);
  lines.push(`- Runtime mean / median / p95 / max: ${report.summary.runtimeMeanMs}ms / ${report.summary.runtimeMedianMs}ms / ${report.summary.runtimeP95Ms}ms / ${report.summary.runtimeMaxMs}ms`);
  lines.push('');
  lines.push('## Below-Target Families');
  lines.push('');
  lines.push('| Family | Count | Deficit | Avg Score | Median Score | Top Files |');
  lines.push('| --- | ---: | ---: | ---: | ---: | --- |');
  for (const family of report.familySummaries) {
    lines.push(`| ${family.family} | ${family.count} | ${family.deficitTo93} | ${family.avgScore} | ${family.medianScore} | ${family.topFiles.map(file => `\`${file}\``).join('<br>')} |`);
  }
  lines.push('');
  lines.push('## Lowest Rows');
  lines.push('');
  lines.push('| Score | Grade | Family | Deficit | File | Weakest | Duration ms |');
  lines.push('| ---: | --- | --- | ---: | --- | --- | ---: |');
  for (const row of report.lowestRows) {
    const weakest = row.weakest.map(item => `${item.key}:${item.score}`).join(', ');
    lines.push(`| ${row.score} | ${row.grade} | ${row.family} | ${row.deficitTo93} | \`${row.file}\` | ${weakest} | ${row.durationMs ?? ''} |`);
  }
  lines.push('');
  lines.push('## Slowest Rows');
  lines.push('');
  lines.push('| Runtime ms | Score | Grade | Family | File |');
  lines.push('| ---: | ---: | --- | --- | --- |');
  for (const row of report.slowestRows) {
    lines.push(`| ${row.durationMs ?? ''} | ${row.score} | ${row.grade} | ${row.family} | \`${row.file}\` |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.root);
  await stat(root);
  const rows = await loadRows(root);
  const report = buildAllInputMeanDiagnostic({
    rows,
    sourceRoot: args.root,
    targetMean: args.targetMean,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'all-input-mean-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.out, 'all-input-mean-diagnostic.md'), renderMarkdown(report));
  console.log(`Wrote ${join(args.out, 'all-input-mean-diagnostic.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
