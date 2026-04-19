#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage11AcceptanceAudit,
  writeStage11AcceptanceArtifacts,
} from '../src/services/benchmark/stage11Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage11-acceptance-audit.ts [stage10-run-dir] [stage11-run-dir] [comparison-dir] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [stage10RunArg, stage11RunArg, comparisonArg, outArg] = process.argv.slice(2);
  const stage10Dir = stage10RunArg ?? 'Output/experiment-corpus-baseline/run-stage10-full';
  const stage11Dir = stage11RunArg ?? 'Output/experiment-corpus-baseline/run-stage11-full';
  const comparisonDir = comparisonArg ?? 'Output/experiment-corpus-baseline/comparison-stage11-full-vs-stage10';
  const outputDir = outArg ?? 'Output/experiment-corpus-baseline/stage11-acceptance';

  const stage10Run = await loadBenchmarkRowsFromRunDir(stage10Dir);
  const stage11Run = await loadBenchmarkRowsFromRunDir(stage11Dir);
  const diff = await loadComparison(comparisonDir);

  const audit = buildStage11AcceptanceAudit({
    stage10RunDir: stage10Dir,
    stage11RunDir: stage11Dir,
    comparisonDir,
    stage10RemediateResults: stage10Run.remediateResults,
    stage11RemediateResults: stage11Run.remediateResults,
    comparison: diff,
  });

  await writeStage11AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 11 acceptance audit to ${outputDir}`);
  console.log(`Stage 11: ${audit.stage11Passed ? 'PASS' : 'FAIL'}`);
  console.log(`Gates: ${audit.gates.map(gate => `${gate.key}:${gate.passed ? 'pass' : 'FAIL'}`).join(', ')}`);
  console.log(`Unsafe-to-autofix in structure cohort: ${audit.summary.unsafeToAutofixInStructureCohort} (baseline ${audit.summary.unsafeToAutofixBaseline})`);
  console.log(`Converted files: ${audit.convertedFiles.length} | Regressed: ${audit.regressedFiles.length}`);
  console.log(`Still unsafe: ${audit.unsafeToAutofixFiles.map(f => f.id).join(', ') || 'none'}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
