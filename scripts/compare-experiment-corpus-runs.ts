#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  compareBenchmarkSummaries,
  loadBenchmarkSummaryFromRunDir,
  renderBenchmarkComparisonMarkdown,
} from '../src/services/benchmark/compareRuns.js';

async function main(): Promise<void> {
  const [beforeDir, afterDir, outDir] = process.argv.slice(2);
  if (!beforeDir || !afterDir) {
    throw new Error('Usage: pnpm exec tsx scripts/compare-experiment-corpus-runs.ts <before-run-dir> <after-run-dir> [out-dir]');
  }

  const before = await loadBenchmarkSummaryFromRunDir(beforeDir);
  const after = await loadBenchmarkSummaryFromRunDir(afterDir);
  const comparison = compareBenchmarkSummaries(before, after);
  const markdown = renderBenchmarkComparisonMarkdown(comparison);

  if (outDir) {
    const absOutDir = resolve(outDir);
    await mkdir(absOutDir, { recursive: true });
    await writeFile(join(absOutDir, 'comparison.json'), JSON.stringify(comparison, null, 2), 'utf8');
    await writeFile(join(absOutDir, 'comparison.md'), markdown, 'utf8');
    console.log(`Wrote comparison to ${absOutDir}`);
    return;
  }

  console.log(JSON.stringify(comparison, null, 2));
  console.log('');
  console.log(markdown);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
