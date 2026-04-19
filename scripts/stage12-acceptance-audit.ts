#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage12AcceptanceAudit,
  writeStage12AcceptanceArtifacts,
} from '../src/services/benchmark/stage12Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage12-acceptance-audit.ts [stage11-run-dir] [stage12-run-dir] [comparison-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [stage11RunArg, stage12RunArg, comparisonArg, outArg] = process.argv.slice(2);
  const stage11Dir = stage11RunArg ?? 'Output/experiment-corpus-baseline/run-stage11-full';
  const stage12Dir = stage12RunArg ?? 'Output/experiment-corpus-baseline/run-stage12-full';
  const comparisonDir = comparisonArg ?? 'Output/experiment-corpus-baseline/comparison-stage12-full-vs-stage11';
  const outputDir = outArg ?? 'Output/experiment-corpus-baseline/stage12-acceptance';

  const stage11Run = await loadBenchmarkRowsFromRunDir(stage11Dir);
  const stage12Run = await loadBenchmarkRowsFromRunDir(stage12Dir);
  const diff = await loadComparison(comparisonDir);

  const audit = buildStage12AcceptanceAudit({
    stage11RunDir: stage11Dir,
    stage12RunDir: stage12Dir,
    comparisonDir,
    stage11RemediateResults: stage11Run.remediateResults,
    stage12RemediateResults: stage12Run.remediateResults,
    comparison: diff,
  });

  await writeStage12AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 12 acceptance audit to ${outputDir}`);
  console.log(`Stage 12: ${audit.stage12Passed ? 'PASS' : 'FAIL'}`);
  console.log(`Gates: ${audit.gates.map(gate => `${gate.key}:${gate.passed ? 'pass' : 'FAIL'}`).join(', ')}`);
  console.log(`Unsafe-to-autofix in font cohort: ${audit.summary.unsafeToAutofixInFontCohort} (baseline ${audit.summary.unsafeToAutofixBaseline})`);
  console.log(`Converted files: ${audit.convertedFiles.length} | Regressed: ${audit.regressedFiles.length}`);
  console.log(`Still unsafe: ${audit.unsafeToAutofixFiles.map(f => f.id).join(', ') || 'none'}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
