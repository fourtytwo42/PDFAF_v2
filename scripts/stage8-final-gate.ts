#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkSummaryFromRunDir } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage8FinalGateAudit,
  writeStage8FinalGateArtifacts,
} from '../src/services/benchmark/stage8FinalGate.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage8-final-gate.ts [baseline-full-run-dir] [final-full-run-dir] [comparison-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [baselineRunDir, finalRunDir, comparisonDir, outDir] = process.argv.slice(2);
  const baselineDir = baselineRunDir ?? 'Output/experiment-corpus-baseline/run-stage1-pre-full';
  const finalDir = finalRunDir ?? 'Output/experiment-corpus-baseline/run-stage8-full';
  const comparison = comparisonDir ?? 'Output/experiment-corpus-baseline/comparison-stage8-full-vs-stage0';
  const outputDir = outDir ?? 'Output/experiment-corpus-baseline/stage8-final-gate';

  const baselineRows = await loadBenchmarkRowsFromRunDir(baselineDir);
  const finalRows = await loadBenchmarkRowsFromRunDir(finalDir);
  const baselineSummary = await loadBenchmarkSummaryFromRunDir(baselineDir);
  const finalSummary = await loadBenchmarkSummaryFromRunDir(finalDir);
  const diff = await loadComparison(comparison);

  const audit = buildStage8FinalGateAudit({
    baselineRunDir: baselineDir,
    finalRunDir: finalDir,
    comparisonDir: comparison,
    baselineSummary,
    finalSummary,
    baselineRemediateResults: baselineRows.remediateResults,
    finalRemediateResults: finalRows.remediateResults,
    comparison: diff,
  });

  await writeStage8FinalGateArtifacts(outputDir, audit);
  console.log(`Wrote Stage 8 final gate to ${outputDir}`);
  console.log(`Final gate: ${audit.finalGatePassed ? 'PASS' : 'FAIL'}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
