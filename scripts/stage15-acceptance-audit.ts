#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage15AcceptanceAudit,
  writeStage15AcceptanceArtifacts,
} from '../src/services/benchmark/stage15Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage15-acceptance-audit.ts [stage14.1-run-dir] [stage15-run-dir] [comparison-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [baselineArg, stage15Arg, comparisonArg, outArg] = process.argv.slice(2);
  const baselineRunDir = baselineArg ?? 'Output/experiment-corpus-baseline/run-stage14.1-full';
  const stage15RunDir = stage15Arg ?? 'Output/experiment-corpus-baseline/run-stage15-full';
  const comparisonDir = comparisonArg ?? 'Output/experiment-corpus-baseline/comparison-stage15-full-vs-stage14.1';
  const outputDir = outArg ?? 'Output/experiment-corpus-baseline/stage15-acceptance';

  const baselineRows = await loadBenchmarkRowsFromRunDir(baselineRunDir);
  const stage15Rows = await loadBenchmarkRowsFromRunDir(stage15RunDir);
  const comparison = await loadComparison(comparisonDir);

  const audit = buildStage15AcceptanceAudit({
    baselineRunDir,
    stage15RunDir,
    comparisonDir,
    stage141RemediateResults: baselineRows.remediateResults,
    stage15RemediateResults: stage15Rows.remediateResults,
    comparison,
  });

  await writeStage15AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 15 acceptance audit to ${outputDir}`);
  console.log(`Acceptance: ${audit.stage15Passed ? 'PASS' : 'FAIL'}`);
  console.log(`Target non-A to A: ${audit.summary.targetReachedACount}/${audit.summary.targetFileCount}`);
  console.log(`Structure improved (+5): ${audit.summary.structureSurvivorImprovedCount}`);
  console.log(`Font improved (+10): ${audit.summary.fontSurvivorImprovedCount}`);
  console.log(`Runtime median/p95 delta: ${audit.summary.remediateWallMedianDeltaMs?.toFixed(2) ?? 'n/a'} / ${audit.summary.remediateWallP95DeltaMs?.toFixed(2) ?? 'n/a'} ms`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
