#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage3AcceptanceAudit,
  writeStage3AcceptanceArtifacts,
} from '../src/services/benchmark/stage3Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage3-acceptance-audit.ts [analyze-run-dir] [full-run-dir] [analyze-comparison-dir] [full-comparison-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(
    await readFile(join(resolve(dir), 'comparison.json'), 'utf8'),
  ) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [analyzeRunDir, fullRunDir, analyzeComparisonDir, fullComparisonDir, outDir] =
    process.argv.slice(2);

  const analyzeDir =
    analyzeRunDir ?? 'Output/experiment-corpus-baseline/run-stage3-analyze';
  const fullDir =
    fullRunDir ?? 'Output/experiment-corpus-baseline/run-stage3-full';
  const analyzeComparison =
    analyzeComparisonDir ?? 'Output/experiment-corpus-baseline/comparison-stage3-analyze-vs-stage2';
  const fullComparison =
    fullComparisonDir ?? 'Output/experiment-corpus-baseline/comparison-stage3-full-vs-stage2';
  const outputDir =
    outDir ?? 'Output/experiment-corpus-baseline/stage3-acceptance';

  const analyzeRun = await loadBenchmarkRowsFromRunDir(analyzeDir);
  const fullRun = await loadBenchmarkRowsFromRunDir(fullDir);
  const analyzeDiff = await loadComparison(analyzeComparison);
  const fullDiff = await loadComparison(fullComparison);

  const audit = buildStage3AcceptanceAudit({
    analyzeRunDir: analyzeDir,
    fullRunDir: fullDir,
    analyzeComparisonDir: analyzeComparison,
    fullComparisonDir: fullComparison,
    analyzeResults: analyzeRun.analyzeResults,
    remediateResults: fullRun.remediateResults,
    analyzeComparison: analyzeDiff,
    fullComparison: fullDiff,
  });

  await writeStage3AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 3 acceptance audit to ${outputDir}`);
  console.log(
    `Analyze pressure: ${audit.summary.analyzePressureCount}, meaningful survivors: ${audit.summary.analyzeMeaningfulPressureCount}, post-remediation pressure: ${audit.summary.postRemediationPressureCount}`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
