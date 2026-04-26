#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { comparePdfFiles } from '../src/services/benchmark/visualStability.js';

interface ParsedArgs {
  before: string;
  after: string;
  outDir: string;
  pages: number[];
  allPages: boolean;
}

const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage101-visual-stability-diagnostic-2026-04-26-r1';

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage101-visual-stability-diagnostic.ts [options]',
    '  --before <pdf>   Before PDF path',
    '  --after <pdf>    After PDF path',
    '  --page <n>       Page number to compare (repeatable, default: 1)',
    '  --all-pages      Compare every page present in either PDF',
    `  --out <dir>      Default: ${DEFAULT_OUT}`,
  ].join('\n');
}

function parseArgs(argv: string[]): ParsedArgs {
  let before = '';
  let after = '';
  let outDir = DEFAULT_OUT;
  const pages: number[] = [];
  let allPages = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--all-pages') {
      allPages = true;
      continue;
    }
    const next = argv[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--before') before = next;
    else if (arg === '--after') after = next;
    else if (arg === '--page') pages.push(Math.max(1, Number.parseInt(next, 10) || 1));
    else if (arg === '--out') outDir = next;
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  if (!before || !after) throw new Error('Both --before and --after are required.');
  return {
    before,
    after,
    outDir,
    allPages,
    pages: pages.length > 0 ? [...new Set(pages)] : [1],
  };
}

function renderMarkdown(report: {
  generatedAt: string;
  beforePath: string;
  afterPath: string;
  pages: Array<{
    pageNumber1Based: number;
    stable: boolean;
    reason: string | null;
    before: { width: number; height: number } | null;
    after: { width: number; height: number } | null;
    diff: {
      dimensionMismatch: boolean;
      differentPixelCount: number;
      totalPixelCount: number;
      differentPixelRatio: number;
      meanAbsoluteChannelDelta: number;
      maxChannelDelta: number;
    } | null;
  }>;
  stable: boolean;
  worstPage: number | null;
}): string {
  const lines = [
    '# Stage 101 Visual Stability Diagnostic',
    '',
    `Generated: \`${report.generatedAt}\``,
    `Before: \`${report.beforePath}\``,
    `After: \`${report.afterPath}\``,
    `Decision: \`${report.stable ? 'visual_stable' : 'visual_drift_detected'}\``,
    `Worst page: ${report.worstPage ?? 'n/a'}`,
    '',
    '## Page Comparison',
    '',
    '| Page | Stable | Reason | Before | After | Diff pixels | Diff ratio | Mean abs delta | Max delta |',
    '| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |',
  ];
  for (const page of report.pages) {
    const before = page.before ? `${page.before.width}x${page.before.height}` : 'n/a';
    const after = page.after ? `${page.after.width}x${page.after.height}` : 'n/a';
    lines.push(
      `| ${page.pageNumber1Based} | ${page.stable ? 'yes' : 'no'} | ${page.reason ?? 'none'} | ${before} | ${after} | ${page.diff?.differentPixelCount ?? 'n/a'} / ${page.diff?.totalPixelCount ?? 'n/a'} | ${page.diff ? page.diff.differentPixelRatio.toFixed(6) : 'n/a'} | ${page.diff ? page.diff.meanAbsoluteChannelDelta.toFixed(6) : 'n/a'} | ${page.diff?.maxChannelDelta ?? 'n/a'} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await comparePdfFiles({
    beforePath: resolve(args.before),
    afterPath: resolve(args.after),
    pageNumbers: args.pages,
    allPages: args.allPages,
  });
  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const serializable = {
    generatedAt,
    beforePath: report.beforePath,
    afterPath: report.afterPath,
    stable: report.stable,
    worstPage: report.worstPage ? report.worstPage.pageNumber1Based : null,
    pages: report.pages,
  };
  await writeFile(join(outDir, 'stage101-visual-stability-diagnostic.json'), JSON.stringify(serializable, null, 2), 'utf8');
  await writeFile(join(outDir, 'stage101-visual-stability-diagnostic.md'), renderMarkdown(serializable), 'utf8');
  console.log(`Wrote ${outDir}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
