#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage10AcceptanceAudit,
  writeStage10AcceptanceArtifacts,
} from '../src/services/benchmark/stage10Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage10-acceptance-audit.ts [stage8-run-dir] [stage10-run-dir] [comparison-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [stage8RunArg, stage10RunArg, comparisonArg, outArg] = process.argv.slice(2);
  const stage8Dir = stage8RunArg ?? 'Output/experiment-corpus-baseline/run-stage8-full';
  const stage10Dir = stage10RunArg ?? 'Output/experiment-corpus-baseline/run-stage10-full';
  const comparisonDir = comparisonArg ?? 'Output/experiment-corpus-baseline/comparison-stage10-full-vs-stage8';
  const outputDir = outArg ?? 'Output/experiment-corpus-baseline/stage10-acceptance';

  const stage8Run = await loadBenchmarkRowsFromRunDir(stage8Dir);
  const stage10Run = await loadBenchmarkRowsFromRunDir(stage10Dir);
  const diff = await loadComparison(comparisonDir);

  const audit = buildStage10AcceptanceAudit({
    stage8RunDir: stage8Dir,
    stage10RunDir: stage10Dir,
    comparisonDir,
    stage8RemediateResults: stage8Run.remediateResults,
    stage10RemediateResults: stage10Run.remediateResults,
    comparison: diff,
  });

  await writeStage10AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 10 acceptance audit to ${outputDir}`);
  console.log(`Stage 10: ${audit.stage10Passed ? 'PASS' : 'FAIL'}`);
  console.log(`Gates: ${audit.gates.map(gate => `${gate.key}:${gate.passed ? 'pass' : 'FAIL'}`).join(', ')}`);
  console.log(`A-not-100: ${audit.summary.aNot100Count} (was ${audit.summary.aNot100Baseline}, delta ${audit.summary.aNot100Delta >= 0 ? '+' : ''}${audit.summary.aNot100Delta})`);
  console.log(`Reached 100/100: ${audit.summary.reached100Count}`);
  console.log(`Converted files: ${audit.convertedFiles.length} | Regressed: ${audit.regressedFiles.length}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
