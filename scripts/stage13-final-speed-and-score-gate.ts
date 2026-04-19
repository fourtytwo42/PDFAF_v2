#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkSummaryFromRunDir } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage13FinalGateAudit,
  writeStage13FinalGateArtifacts,
} from '../src/services/benchmark/stage13FinalGate.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage13-final-speed-and-score-gate.ts [stage8-run-dir] [stage12-run-dir] [comparison-vs-stage8-dir] [comparison-vs-stage0-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [stage8Arg, stage12Arg, cmpStage8Arg, cmpStage0Arg, outArg] = process.argv.slice(2);
  const stage8Dir = stage8Arg ?? 'Output/experiment-corpus-baseline/run-stage8-full';
  const stage12Dir = stage12Arg ?? 'Output/experiment-corpus-baseline/run-stage12-full';
  const cmpStage8Dir = cmpStage8Arg ?? 'Output/experiment-corpus-baseline/comparison-stage12-full-vs-stage8';
  const cmpStage0Dir = cmpStage0Arg ?? 'Output/experiment-corpus-baseline/comparison-stage12-full-vs-stage0';
  const outputDir = outArg ?? 'Output/experiment-corpus-baseline/stage13-final-speed-and-score-gate';

  const stage8Rows = await loadBenchmarkRowsFromRunDir(stage8Dir);
  const stage12Rows = await loadBenchmarkRowsFromRunDir(stage12Dir);
  const stage8Summary = await loadBenchmarkSummaryFromRunDir(stage8Dir);
  const stage12Summary = await loadBenchmarkSummaryFromRunDir(stage12Dir);
  const compVsStage8 = await loadComparison(cmpStage8Dir);
  const compVsStage0 = await loadComparison(cmpStage0Dir);

  const audit = buildStage13FinalGateAudit({
    stage8RunDir: stage8Dir,
    stage12RunDir: stage12Dir,
    comparisonVsStage8Dir: cmpStage8Dir,
    comparisonVsStage0Dir: cmpStage0Dir,
    stage8Summary,
    stage12Summary,
    stage8RemediateResults: stage8Rows.remediateResults,
    stage12RemediateResults: stage12Rows.remediateResults,
    comparisonVsStage8: compVsStage8,
    comparisonVsStage0: compVsStage0,
  });

  await writeStage13FinalGateArtifacts(outputDir, audit);
  console.log(`Wrote Stage 13 final gate to ${outputDir}`);
  console.log(`Final gate: ${audit.finalGatePassed ? 'PASS' : 'FAIL'}`);
  console.log(`Gates: ${audit.gates.map(g => `${g.key}:${g.passed ? 'pass' : 'FAIL'}`).join(', ')}`);
  console.log(`Reached 100/100: ${audit.summary.reached100Count} | Reached A: ${audit.summary.reachedACount}`);
  console.log(`Unsafe-to-autofix: ${audit.summary.honestBoundedUnsafeToAutofixCount} (Stage 8 baseline: ${audit.thresholds.stage8UnsafeToAutofixCount})`);
  console.log(`Reanalyzed mean delta vs Stage 8: ${audit.summary.reanalyzedMeanDeltaVsStage8?.toFixed(2) ?? 'n/a'}`);
  console.log(`Remediate wall median delta vs Stage 8: ${audit.summary.remediateWallMedianDeltaVsStage8Ms?.toFixed(2) ?? 'n/a'} ms`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
