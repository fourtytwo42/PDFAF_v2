#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage17AcceptanceAudit,
  writeStage17AcceptanceArtifacts,
} from '../src/services/benchmark/stage17Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage17-acceptance-audit.ts [stage16-run-dir] [stage17-run-dir] [comparison-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [baselineArg, stage17Arg, comparisonArg, outArg] = process.argv.slice(2);
  const baselineRunDir = baselineArg ?? 'Output/experiment-corpus-baseline/run-stage16-full';
  const stage17RunDir = stage17Arg ?? 'Output/experiment-corpus-baseline/run-stage17-full';
  const comparisonDir = comparisonArg ?? 'Output/experiment-corpus-baseline/comparison-stage17-vs-stage16';
  const outputDir = outArg ?? 'Output/experiment-corpus-baseline/stage17-acceptance';

  const baselineRows = await loadBenchmarkRowsFromRunDir(baselineRunDir);
  const stage17Rows = await loadBenchmarkRowsFromRunDir(stage17RunDir);
  const comparison = await loadComparison(comparisonDir);

  const audit = buildStage17AcceptanceAudit({
    baselineRunDir,
    stage17RunDir,
    comparisonDir,
    stage16RemediateResults: baselineRows.remediateResults,
    stage17RemediateResults: stage17Rows.remediateResults,
    comparison,
  });

  await writeStage17AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 17 acceptance audit to ${outputDir}`);
  console.log(`Acceptance: ${audit.stage17Passed ? 'PASS' : 'FAIL'}`);
  console.log(`Low-A targets improved by >=2: ${audit.summary.improvedTargetCount}/${audit.summary.targetFileCount}`);
  console.log(`Regression count: ${audit.summary.regressionCount}`);
  console.log(`Runtime median delta: ${audit.summary.remediateWallMedianDeltaMs?.toFixed(2) ?? 'n/a'} ms`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
