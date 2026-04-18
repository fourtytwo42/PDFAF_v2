#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage5AcceptanceAudit,
  writeStage5AcceptanceArtifacts,
} from '../src/services/benchmark/stage5Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage5-acceptance-audit.ts [stage4-full-run-dir] [stage5-full-run-dir] [comparison-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(
    await readFile(join(resolve(dir), 'comparison.json'), 'utf8'),
  ) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [stage4RunDir, stage5RunDir, comparisonDir, outDir] = process.argv.slice(2);
  const stage4Dir = stage4RunDir ?? 'Output/experiment-corpus-baseline/run-stage4-full';
  const stage5Dir = stage5RunDir ?? 'Output/experiment-corpus-baseline/run-stage5-full';
  const comparison =
    comparisonDir ?? 'Output/experiment-corpus-baseline/comparison-stage5-full-vs-stage4';
  const outputDir = outDir ?? 'Output/experiment-corpus-baseline/stage5-acceptance';

  const stage4Run = await loadBenchmarkRowsFromRunDir(stage4Dir);
  const stage5Run = await loadBenchmarkRowsFromRunDir(stage5Dir);
  const diff = await loadComparison(comparison);

  const audit = buildStage5AcceptanceAudit({
    stage4RunDir: stage4Dir,
    stage5RunDir: stage5Dir,
    comparisonDir: comparison,
    stage4RemediateResults: stage4Run.remediateResults,
    stage5RemediateResults: stage5Run.remediateResults,
    comparison: diff,
  });

  await writeStage5AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 5 acceptance audit to ${outputDir}`);
  console.log(
    `Outcome status: ${Object.entries(audit.summary.outcomeStatusDistribution).map(([status, count]) => `${status}:${count}`).join(', ') || 'none'}`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
