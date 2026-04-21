#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface BenchmarkCategory {
  key: string;
  score: number;
  applicable?: boolean;
}

interface BenchmarkScoreCap {
  category: string;
  cap: number;
  reason: string;
}

interface BenchmarkRow {
  id: string;
  file: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  reanalyzedScore?: number | null;
  reanalyzedGrade?: string | null;
  afterCategories?: BenchmarkCategory[];
  reanalyzedCategories?: BenchmarkCategory[];
  afterScoreCapsApplied?: BenchmarkScoreCap[];
  reanalyzedScoreCapsApplied?: BenchmarkScoreCap[];
}

interface ParsedArgs {
  beforeDir: string;
  afterDir: string;
  outDir: string;
}

interface ComparedRow {
  id: string;
  file: string;
  oldScore: number;
  newScore: number;
  delta: number;
  oldGrade: string;
  newGrade: string;
  categoryDeltas: Record<string, number>;
  oldCaps: BenchmarkScoreCap[];
  newCaps: BenchmarkScoreCap[];
  capChanges: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  let beforeDir = '';
  let afterDir = '';
  let outDir = '';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--before') {
      beforeDir = argv[++i] ?? '';
    } else if (arg === '--after') {
      afterDir = argv[++i] ?? '';
    } else if (arg === '--out') {
      outDir = argv[++i] ?? '';
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  pnpm exec tsx scripts/stage40-score-rebalance-report.ts --before <old-run-dir> --after <new-run-dir> [--out <dir>]

The script reads remediate.results.json from each run and emits a non-mutating score/grade/category/cap comparison.
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!beforeDir) throw new Error('Missing --before <old-run-dir>.');
  if (!afterDir) throw new Error('Missing --after <new-run-dir>.');
  return {
    beforeDir,
    afterDir,
    outDir: outDir || join(afterDir, 'stage40-score-rebalance-report'),
  };
}

function grade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function categoryMap(categories: BenchmarkCategory[] | undefined): Record<string, number> {
  return Object.fromEntries((categories ?? []).map(category => [category.key, category.score]));
}

function capKeys(caps: BenchmarkScoreCap[]): Set<string> {
  return new Set(caps.map(cap => `${cap.category}:${cap.cap}:${cap.reason}`));
}

function scoreFrom(row: BenchmarkRow): number {
  return row.reanalyzedScore ?? row.afterScore ?? 0;
}

function gradeFrom(row: BenchmarkRow): string {
  return row.reanalyzedGrade ?? row.afterGrade ?? grade(scoreFrom(row));
}

function categoriesFrom(row: BenchmarkRow): BenchmarkCategory[] {
  return row.reanalyzedCategories?.length ? row.reanalyzedCategories : (row.afterCategories ?? []);
}

function capsFrom(row: BenchmarkRow): BenchmarkScoreCap[] {
  return row.reanalyzedScoreCapsApplied?.length ? row.reanalyzedScoreCapsApplied : (row.afterScoreCapsApplied ?? []);
}

function compareRows(before: BenchmarkRow[], after: BenchmarkRow[]): ComparedRow[] {
  const afterById = new Map(after.map(row => [row.id, row]));
  return before.flatMap(oldRow => {
    const newRow = afterById.get(oldRow.id);
    if (!newRow) return [];
    const oldScore = scoreFrom(oldRow);
    const newScore = scoreFrom(newRow);
    const oldCategories = categoryMap(categoriesFrom(oldRow));
    const newCategories = categoryMap(categoriesFrom(newRow));
    const categoryDeltas = Object.fromEntries(
      [...new Set([...Object.keys(oldCategories), ...Object.keys(newCategories)])]
        .sort()
        .map(key => [key, round2((newCategories[key] ?? 0) - (oldCategories[key] ?? 0))]),
    );
    const oldCaps = capsFrom(oldRow);
    const newCaps = capsFrom(newRow);
    const oldCapKeys = capKeys(oldCaps);
    const newCapKeys = capKeys(newCaps);
    const capChanges = [
      ...[...newCapKeys].filter(key => !oldCapKeys.has(key)).map(key => `added:${key}`),
      ...[...oldCapKeys].filter(key => !newCapKeys.has(key)).map(key => `removed:${key}`),
    ].sort();
    return [{
      id: oldRow.id,
      file: oldRow.file,
      oldScore,
      newScore,
      delta: round2(newScore - oldScore),
      oldGrade: gradeFrom(oldRow),
      newGrade: gradeFrom(newRow),
      categoryDeltas,
      oldCaps,
      newCaps,
      capChanges,
    }];
  });
}

function mean(values: number[]): number {
  return values.length ? round2(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function renderTable(rows: ComparedRow[], scoreKey: 'delta' | 'newScore', direction: 'asc' | 'desc'): string[] {
  const sorted = [...rows].sort((a, b) =>
    direction === 'asc' ? a[scoreKey] - b[scoreKey] : b[scoreKey] - a[scoreKey],
  );
  return sorted.slice(0, 20).map(row =>
    `| ${row.id} | ${row.oldGrade} ${row.oldScore} | ${row.newGrade} ${row.newScore} | ${row.delta} | ${row.capChanges.join('<br>') || '-'} |`,
  );
}

function renderMarkdown(rows: ComparedRow[], beforeDir: string, afterDir: string): string {
  const stricter = rows.filter(row => row.delta < 0);
  const relaxed = rows.filter(row => row.delta > 0);
  const gradeMoves = rows.filter(row => row.oldGrade !== row.newGrade);
  const capMoves = rows.filter(row => row.capChanges.length > 0);
  const lines = [
    '# Stage 40 Score Rebalance Report',
    '',
    `Before: \`${beforeDir}\``,
    `After: \`${afterDir}\``,
    '',
    `Files compared: ${rows.length}`,
    `Old mean: ${mean(rows.map(row => row.oldScore))}`,
    `New mean: ${mean(rows.map(row => row.newScore))}`,
    `Mean delta: ${mean(rows.map(row => row.delta))}`,
    `Stricter files: ${stricter.length}`,
    `Relaxed files: ${relaxed.length}`,
    `Grade boundary moves: ${gradeMoves.length}`,
    `Cap changes: ${capMoves.length}`,
    '',
    '## Grade Boundary Moves',
    '| File | Old | New | Delta | Cap changes |',
    '|---|---:|---:|---:|---|',
    ...gradeMoves.slice(0, 30).map(row =>
      `| ${row.id} | ${row.oldGrade} ${row.oldScore} | ${row.newGrade} ${row.newScore} | ${row.delta} | ${row.capChanges.join('<br>') || '-'} |`,
    ),
    '',
    '## Top Stricter Cases',
    '| File | Old | New | Delta | Cap changes |',
    '|---|---:|---:|---:|---|',
    ...renderTable(stricter, 'delta', 'asc'),
    '',
    '## Top Relaxed Cases',
    '| File | Old | New | Delta | Cap changes |',
    '|---|---:|---:|---:|---|',
    ...renderTable(relaxed, 'delta', 'desc'),
    '',
    '## Cap Changes',
    '| File | Old | New | Delta | Cap changes |',
    '|---|---:|---:|---:|---|',
    ...capMoves.slice(0, 30).map(row =>
      `| ${row.id} | ${row.oldGrade} ${row.oldScore} | ${row.newGrade} ${row.newScore} | ${row.delta} | ${row.capChanges.join('<br>')} |`,
    ),
    '',
  ];
  return lines.join('\n');
}

async function readRun(runDir: string): Promise<BenchmarkRow[]> {
  return JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as BenchmarkRow[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const before = await readRun(args.beforeDir);
  const after = await readRun(args.afterDir);
  const rows = compareRows(before, after);
  await mkdir(args.outDir, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    beforeDir: args.beforeDir,
    afterDir: args.afterDir,
    summary: {
      compared: rows.length,
      oldMean: mean(rows.map(row => row.oldScore)),
      newMean: mean(rows.map(row => row.newScore)),
      meanDelta: mean(rows.map(row => row.delta)),
      stricter: rows.filter(row => row.delta < 0).length,
      relaxed: rows.filter(row => row.delta > 0).length,
      gradeBoundaryMoves: rows.filter(row => row.oldGrade !== row.newGrade).length,
      capChanges: rows.filter(row => row.capChanges.length > 0).length,
    },
    rows,
  };
  await writeFile(join(args.outDir, 'score-rebalance-report.json'), JSON.stringify(payload, null, 2));
  await writeFile(join(args.outDir, 'score-rebalance-report.md'), renderMarkdown(rows, args.beforeDir, args.afterDir));
  console.log(`Wrote Stage 40 score rebalance report to ${args.outDir}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
