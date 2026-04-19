#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage14AcceptanceAudit,
  writeStage14AcceptanceArtifacts,
} from '../src/services/benchmark/stage14Acceptance.js';
import type { Stage13FinalGateAudit } from '../src/services/benchmark/stage13FinalGate.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage14-acceptance-audit.ts [baseline-run-dir] [stage14-run-dir] [comparison-dir] [stage13-gate-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function loadStage13Gate(dir: string): Promise<Stage13FinalGateAudit> {
  return JSON.parse(await readFile(join(resolve(dir), 'stage13-final-gate.json'), 'utf8')) as Stage13FinalGateAudit;
}

async function main(): Promise<void> {
  const [baselineArg, stage14Arg, comparisonArg, stage13GateArg, outArg] = process.argv.slice(2);
  const baselineRunDir = baselineArg ?? 'Output/experiment-corpus-baseline/run-stage12-full';
  const stage14RunDir = stage14Arg ?? 'Output/experiment-corpus-baseline/run-stage14-full';
  const comparisonDir = comparisonArg ?? 'Output/experiment-corpus-baseline/comparison-stage14-full-vs-stage12';
  const stage13GateDir = stage13GateArg ?? 'Output/experiment-corpus-baseline/stage13-final-speed-and-score-gate';
  const outputDir = outArg ?? 'Output/experiment-corpus-baseline/stage14-acceptance';

  const baselineRows = await loadBenchmarkRowsFromRunDir(baselineRunDir);
  const stage14Rows = await loadBenchmarkRowsFromRunDir(stage14RunDir);
  const comparison = await loadComparison(comparisonDir);
  const stage13Gate = await loadStage13Gate(stage13GateDir);

  const audit = buildStage14AcceptanceAudit({
    baselineRunDir,
    stage14RunDir,
    comparisonDir,
    stage13GateDir,
    baselineRemediateResults: baselineRows.remediateResults,
    stage14RemediateResults: stage14Rows.remediateResults,
    stage13Gate,
    comparison,
  });

  await writeStage14AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 14 acceptance audit to ${outputDir}`);
  console.log(`Acceptance: ${audit.stage14Passed ? 'PASS' : 'FAIL'}`);
  console.log(`Target non-A to A: ${audit.summary.targetReachedACount}/${audit.summary.targetFileCount}`);
  console.log(`Near-pass satisfied: ${audit.summary.nearPassSatisfiedCount}/3`);
  console.log(`Runtime median/p95 delta: ${audit.summary.remediateWallMedianDeltaMs?.toFixed(2) ?? 'n/a'} / ${audit.summary.remediateWallP95DeltaMs?.toFixed(2) ?? 'n/a'} ms`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
