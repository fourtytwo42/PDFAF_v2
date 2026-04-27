#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type TailClass =
  | 'tagged_zero_heading_anchor_candidate'
  | 'mixed_alt_table_tail'
  | 'reanalysis_volatility'
  | 'fixture_annotation_tail'
  | 'no_safe_candidate';

interface CategoryRow { key: string; score: number }
interface ToolRow { toolName: string; outcome: string; scoreBefore?: number; scoreAfter?: number }
interface BenchmarkRow {
  id: string;
  file: string;
  beforeScore: number;
  beforeGrade: string;
  afterScore: number;
  afterGrade: string;
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  afterCategories?: CategoryRow[];
  reanalyzedCategories?: CategoryRow[];
  afterPdfClass?: string;
  reanalyzedPdfClass?: string;
  afterDetectionProfile?: Record<string, unknown>;
  reanalyzedDetectionProfile?: Record<string, unknown>;
  protectedReanalysisSelection?: unknown;
  appliedTools?: ToolRow[];
}

interface Args {
  runDir: string;
  outDir: string;
  ids: string[];
}

const DEFAULT_IDS = ['fixture-inaccessible', 'font-4057', 'figure-4754', 'structure-4076', 'structure-4207', 'long-4470'];

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage143-tail-diagnostic.ts --run <run-dir> [--id <row-id>] [--out <dir>]';
}

function parseArgs(argv = process.argv.slice(2)): Args {
  let runDir = '';
  let outDir = '';
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--run') runDir = argv[++i] ?? '';
    else if (arg === '--out') outDir = argv[++i] ?? '';
    else if (arg === '--id') ids.push(argv[++i] ?? '');
  }
  if (!runDir) throw new Error(usage());
  const absRun = resolve(runDir);
  return {
    runDir: absRun,
    outDir: outDir ? resolve(outDir) : join(absRun, 'stage143-tail-diagnostic'),
    ids: ids.length > 0 ? ids : DEFAULT_IDS,
  };
}

function score(row: BenchmarkRow, key: string): number {
  return (row.reanalyzedCategories ?? row.afterCategories ?? []).find(category => category.key === key)?.score ?? 100;
}

function nestedNumber(value: unknown, path: string[]): number | null {
  let cur = value;
  for (const key of path) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : null;
}

function classify(row: BenchmarkRow): { classification: TailClass; reasons: string[] } {
  const reasons: string[] = [];
  const after = row.afterScore ?? 0;
  const re = row.reanalyzedScore ?? after;
  if (Math.abs(after - re) >= 10) {
    reasons.push(`reanalyzed_delta:${after}->${re}`);
    return { classification: 'reanalysis_volatility', reasons };
  }
  if (row.id.startsWith('fixture-')) {
    reasons.push('fixture_row');
    return { classification: 'fixture_annotation_tail', reasons };
  }
  const heading = score(row, 'heading_structure');
  const reading = score(row, 'reading_order');
  const table = score(row, 'table_markup');
  const link = score(row, 'link_quality');
  const text = score(row, 'text_extractability');
  const treeDepth = nestedNumber(row.reanalyzedDetectionProfile ?? row.afterDetectionProfile, ['readingOrderSignals', 'structureTreeDepth']);
  const treeHeadingCount = nestedNumber(row.reanalyzedDetectionProfile ?? row.afterDetectionProfile, ['headingSignals', 'treeHeadingCount']);
  if (
    heading === 0 &&
    reading >= 90 &&
    table >= 90 &&
    link >= 90 &&
    text >= 90 &&
    (row.reanalyzedPdfClass ?? row.afterPdfClass) === 'native_tagged' &&
    (treeHeadingCount ?? 0) === 0
  ) {
    reasons.push(`tree_depth:${treeDepth ?? 'unknown'}`, 'strong_supporting_structure');
    return { classification: 'tagged_zero_heading_anchor_candidate', reasons };
  }
  if (score(row, 'alt_text') < 70 || table < 70 || score(row, 'bookmarks') < 70) {
    reasons.push(`alt:${score(row, 'alt_text')}`, `table:${table}`, `bookmarks:${score(row, 'bookmarks')}`);
    return { classification: 'mixed_alt_table_tail', reasons };
  }
  return { classification: 'no_safe_candidate', reasons: ['no_matching_stage143_tail_rule'] };
}

function renderMarkdown(report: { runDir: string; rows: Array<Record<string, unknown>>; distribution: Record<string, number> }): string {
  const lines = [
    '# Stage 143 Tail Diagnostic',
    '',
    `Run: \`${report.runDir}\``,
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.distribution).sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| ID | After | Reanalyzed | Class | Reasons | Tail tools |',
    '| --- | ---: | ---: | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    lines.push(`| ${row['id']} | ${row['after']} | ${row['reanalyzed']} | ${row['classification']} | ${row['reasons']} | ${row['tailTools']} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const rows = JSON.parse(await readFile(join(args.runDir, 'remediate.results.json'), 'utf8')) as BenchmarkRow[];
  const selected = rows.filter(row => args.ids.includes(row.id));
  const reportRows = selected.map(row => {
    const result = classify(row);
    return {
      id: row.id,
      file: row.file,
      after: `${row.afterScore}/${row.afterGrade}`,
      reanalyzed: `${row.reanalyzedScore ?? row.afterScore}/${row.reanalyzedGrade ?? row.afterGrade}`,
      classification: result.classification,
      reasons: result.reasons.join('; '),
      categoryDeficits: Object.fromEntries((row.reanalyzedCategories ?? row.afterCategories ?? [])
        .filter(category => category.score < 90)
        .map(category => [category.key, category.score])),
      protectedReanalysisSelection: row.protectedReanalysisSelection ?? null,
      tailTools: (row.appliedTools ?? []).slice(-8).map(tool => `${tool.toolName}/${tool.outcome}`).join(', '),
    };
  });
  const distribution: Record<string, number> = {};
  for (const row of reportRows) {
    const key = String(row.classification);
    distribution[key] = (distribution[key] ?? 0) + 1;
  }
  const report = { generatedAt: new Date().toISOString(), runDir: args.runDir, rows: reportRows, distribution };
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage143-tail-diagnostic.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  await writeFile(join(args.outDir, 'stage143-tail-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 143 diagnostic to ${args.outDir}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
