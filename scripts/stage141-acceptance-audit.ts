#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage141AcceptanceAudit,
  writeStage141AcceptanceArtifacts,
} from '../src/services/benchmark/stage141Acceptance.js';
import type { Stage14AcceptanceAudit } from '../src/services/benchmark/stage14Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage141-acceptance-audit.ts [stage14-run-dir] [stage141-run-dir] [comparison-dir] [stage14-acceptance-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function loadStage14Acceptance(dir: string): Promise<Stage14AcceptanceAudit> {
  return JSON.parse(await readFile(join(resolve(dir), 'stage14-acceptance.json'), 'utf8')) as Stage14AcceptanceAudit;
}

async function main(): Promise<void> {
  const [baselineArg, stage141Arg, comparisonArg, stage14AcceptanceArg, outArg] = process.argv.slice(2);
  const baselineRunDir = baselineArg ?? 'Output/experiment-corpus-baseline/run-stage14-full';
  const stage141RunDir = stage141Arg ?? 'Output/experiment-corpus-baseline/run-stage14.1-full';
  const comparisonDir = comparisonArg ?? 'Output/experiment-corpus-baseline/comparison-stage14.1-full-vs-stage14';
  const stage14AcceptanceDir = stage14AcceptanceArg ?? 'Output/experiment-corpus-baseline/stage14-acceptance';
  const outputDir = outArg ?? 'Output/experiment-corpus-baseline/stage14.1-acceptance';

  const baselineRows = await loadBenchmarkRowsFromRunDir(baselineRunDir);
  const stage141Rows = await loadBenchmarkRowsFromRunDir(stage141RunDir);
  const comparison = await loadComparison(comparisonDir);
  const stage14Acceptance = await loadStage14Acceptance(stage14AcceptanceDir);

  const audit = buildStage141AcceptanceAudit({
    baselineRunDir,
    stage141RunDir,
    comparisonDir,
    stage14AcceptanceDir,
    baselineRemediateResults: baselineRows.remediateResults,
    stage141RemediateResults: stage141Rows.remediateResults,
    stage14Acceptance,
    comparison,
  });

  await writeStage141AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 14.1 acceptance audit to ${outputDir}`);
  console.log(`Acceptance: ${audit.stage141Passed ? 'PASS' : 'FAIL'}`);
  console.log(`Target non-A to A: ${audit.summary.targetReachedACount}/${audit.summary.targetFileCount}`);
  console.log(`Near-pass satisfied: ${audit.summary.nearPassSatisfiedCount}/3`);
  console.log(`Runtime median/p95 delta: ${audit.summary.remediateWallMedianDeltaMs?.toFixed(2) ?? 'n/a'} / ${audit.summary.remediateWallP95DeltaMs?.toFixed(2) ?? 'n/a'} ms`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
