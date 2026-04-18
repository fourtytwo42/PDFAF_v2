#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage4AcceptanceAudit,
  writeStage4AcceptanceArtifacts,
} from '../src/services/benchmark/stage4Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage4-acceptance-audit.ts [stage3-full-run-dir] [stage4-full-run-dir] [comparison-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(
    await readFile(join(resolve(dir), 'comparison.json'), 'utf8'),
  ) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [stage3RunDir, stage4RunDir, comparisonDir, outDir] = process.argv.slice(2);
  const stage3Dir = stage3RunDir ?? 'Output/experiment-corpus-baseline/run-stage3-full';
  const stage4Dir = stage4RunDir ?? 'Output/experiment-corpus-baseline/run-stage4-full';
  const comparison =
    comparisonDir ?? 'Output/experiment-corpus-baseline/comparison-stage4-full-vs-stage3';
  const outputDir = outDir ?? 'Output/experiment-corpus-baseline/stage4-acceptance';

  const stage3Run = await loadBenchmarkRowsFromRunDir(stage3Dir);
  const stage4Run = await loadBenchmarkRowsFromRunDir(stage4Dir);
  const diff = await loadComparison(comparison);

  const audit = buildStage4AcceptanceAudit({
    stage3RunDir: stage3Dir,
    stage4RunDir: stage4Dir,
    comparisonDir: comparison,
    stage3RemediateResults: stage3Run.remediateResults,
    stage4RemediateResults: stage4Run.remediateResults,
    comparison: diff,
  });

  await writeStage4AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 4 acceptance audit to ${outputDir}`);
  console.log(
    `Routes: ${Object.entries(audit.summary.routeDistribution).map(([route, count]) => `${route}:${count}`).join(', ') || 'none'}`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
