#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage16AcceptanceAudit,
  writeStage16AcceptanceArtifacts,
} from '../src/services/benchmark/stage16Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage16-acceptance-audit.ts [stage15-run-dir] [stage16-run-dir] [comparison-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [baselineArg, stage16Arg, comparisonArg, outArg] = process.argv.slice(2);
  const baselineRunDir = baselineArg ?? 'Output/experiment-corpus-baseline/run-stage15-full';
  const stage16RunDir = stage16Arg ?? 'Output/experiment-corpus-baseline/run-stage16-full';
  const comparisonDir = comparisonArg ?? 'Output/experiment-corpus-baseline/comparison-stage16-vs-stage15';
  const outputDir = outArg ?? 'Output/experiment-corpus-baseline/stage16-acceptance';

  const baselineRows = await loadBenchmarkRowsFromRunDir(baselineRunDir);
  const stage16Rows = await loadBenchmarkRowsFromRunDir(stage16RunDir);
  const comparison = await loadComparison(comparisonDir);

  const audit = buildStage16AcceptanceAudit({
    baselineRunDir,
    stage16RunDir,
    comparisonDir,
    stage15RemediateResults: baselineRows.remediateResults,
    stage16RemediateResults: stage16Rows.remediateResults,
    comparison,
  });

  await writeStage16AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 16 acceptance audit to ${outputDir}`);
  console.log(`Acceptance: ${audit.stage16Passed ? 'PASS' : 'FAIL'}`);
  console.log(`Target non-A to A: ${audit.summary.targetReachedACount}/${audit.summary.targetFileCount}`);
  console.log(`Regression count: ${audit.summary.regressionCount}`);
  console.log(`Runtime median delta: ${audit.summary.remediateWallMedianDeltaMs?.toFixed(2) ?? 'n/a'} ms`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
