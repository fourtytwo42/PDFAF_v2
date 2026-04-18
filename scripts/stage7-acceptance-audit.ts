#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage7AcceptanceAudit,
  writeStage7AcceptanceArtifacts,
} from '../src/services/benchmark/stage7Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage7-acceptance-audit.ts [stage6-full-run-dir] [stage7-full-run-dir] [comparison-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [stage6RunDir, stage7RunDir, comparisonDir, outDir] = process.argv.slice(2);
  const stage6Dir = stage6RunDir ?? 'Output/experiment-corpus-baseline/run-stage6-full';
  const stage7Dir = stage7RunDir ?? 'Output/experiment-corpus-baseline/run-stage7-full';
  const comparison = comparisonDir ?? 'Output/experiment-corpus-baseline/comparison-stage7-full-vs-stage6';
  const outputDir = outDir ?? 'Output/experiment-corpus-baseline/stage7-acceptance';

  const stage7Run = await loadBenchmarkRowsFromRunDir(stage7Dir);
  const diff = await loadComparison(comparison);

  const audit = buildStage7AcceptanceAudit({
    stage6RunDir: stage6Dir,
    stage7RunDir: stage7Dir,
    comparisonDir: comparison,
    stage7RemediateResults: stage7Run.remediateResults,
    comparison: diff,
  });

  await writeStage7AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 7 acceptance audit to ${outputDir}`);
  console.log(`Gates: ${audit.gates.map(gate => `${gate.key}:${gate.passed ? 'pass' : 'FAIL'}`).join(', ')}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
