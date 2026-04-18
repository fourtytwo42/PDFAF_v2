#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage6AcceptanceAudit,
  writeStage6AcceptanceArtifacts,
} from '../src/services/benchmark/stage6Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage6-acceptance-audit.ts [stage5-full-run-dir] [stage6-full-run-dir] [comparison-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [stage5RunDir, stage6RunDir, comparisonDir, outDir] = process.argv.slice(2);
  const stage5Dir = stage5RunDir ?? 'Output/experiment-corpus-baseline/run-stage5-full';
  const stage6Dir = stage6RunDir ?? 'Output/experiment-corpus-baseline/run-stage6-full';
  const comparison = comparisonDir ?? 'Output/experiment-corpus-baseline/comparison-stage6-full-vs-stage5';
  const outputDir = outDir ?? 'Output/experiment-corpus-baseline/stage6-acceptance';

  const stage5Run = await loadBenchmarkRowsFromRunDir(stage5Dir);
  const stage6Run = await loadBenchmarkRowsFromRunDir(stage6Dir);
  const diff = await loadComparison(comparison);

  const audit = buildStage6AcceptanceAudit({
    stage5RunDir: stage5Dir,
    stage6RunDir: stage6Dir,
    comparisonDir: comparison,
    stage5RemediateResults: stage5Run.remediateResults,
    stage6RemediateResults: stage6Run.remediateResults,
    comparison: diff,
  });

  await writeStage6AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 6 acceptance audit to ${outputDir}`);
  console.log(
    `Semantic lanes: ${audit.summary.semanticLaneUsage.map(row => `${row.key}:${row.count}`).join(', ') || 'none'}`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
