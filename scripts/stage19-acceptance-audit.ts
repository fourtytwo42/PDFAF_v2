#!/usr/bin/env tsx
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage19AcceptanceAudit,
  writeStage19AcceptanceArtifacts,
} from '../src/services/benchmark/stage19Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage19-acceptance-audit.ts [core-baseline-run-dir] [core-stage19-run-dir] [core-comparison-dir] [stress-baseline-root] [stress-stage19-root] [out-dir]';
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function isRunDir(dir: string): Promise<boolean> {
  try {
    const info = await stat(join(dir, 'remediate.results.json'));
    return info.isFile();
  } catch {
    return false;
  }
}

async function discoverRunDirs(root: string): Promise<string[]> {
  const base = resolve(root);
  if (await isRunDir(base)) return [base];

  const results = new Set<string>();
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 3) return;
    if (await isRunDir(dir)) {
      results.add(resolve(dir));
      return;
    }
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      await walk(join(dir, entry.name), depth + 1);
    }
  }

  await walk(base, 0);
  return [...results].sort((a, b) => a.localeCompare(b));
}

async function loadMergedRemediateRows(root: string): Promise<{ runDirs: string[]; rows: RemediateBenchmarkRow[] }> {
  const runDirs = await discoverRunDirs(root);
  if (runDirs.length === 0) {
    throw new Error(`No benchmark run directories found under ${root}`);
  }
  const byId = new Map<string, RemediateBenchmarkRow>();
  for (const runDir of runDirs) {
    const loaded = await loadBenchmarkRowsFromRunDir(runDir);
    for (const row of loaded.remediateResults) {
      byId.set(row.id, row);
    }
  }
  return {
    runDirs,
    rows: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

async function main(): Promise<void> {
  const [coreBaselineArg, coreStage19Arg, comparisonArg, stressBaselineArg, stressStage19Arg, outArg] = process.argv.slice(2);
  const coreBaselineRunDir = coreBaselineArg ?? 'Output/experiment-corpus-baseline/run-stage17-full';
  const coreStage19RunDir = coreStage19Arg ?? 'Output/experiment-corpus-baseline/run-stage19-full';
  const coreComparisonDir = comparisonArg ?? 'Output/experiment-corpus-baseline/comparison-stage19-vs-stage17';
  const stressBaselineRoot = stressBaselineArg ?? 'Output/from_sibling_pdfaf_stress';
  const stressStage19Root = stressStage19Arg ?? 'Output/from_sibling_pdfaf_stress_stage19';
  const outputDir = outArg ?? 'Output/from_sibling_pdfaf_stress/stage19-acceptance';

  const coreBaselineRows = await loadBenchmarkRowsFromRunDir(coreBaselineRunDir);
  const coreStage19Rows = await loadBenchmarkRowsFromRunDir(coreStage19RunDir);
  const comparison = await loadComparison(coreComparisonDir);
  const stressBaseline = await loadMergedRemediateRows(stressBaselineRoot);
  const stressStage19 = await loadMergedRemediateRows(stressStage19Root);

  const audit = buildStage19AcceptanceAudit({
    coreBaselineRunDir,
    coreStage19RunDir,
    coreComparisonDir,
    stressBaselineRoots: stressBaseline.runDirs,
    stressStage19Roots: stressStage19.runDirs,
    coreBaselineRows: coreBaselineRows.remediateResults,
    coreStage19Rows: coreStage19Rows.remediateResults,
    stressBaselineRows: stressBaseline.rows,
    stressStage19Rows: stressStage19.rows,
    comparison,
  });

  await writeStage19AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 19 acceptance audit to ${outputDir}`);
  console.log(`Acceptance: ${audit.stage19Passed ? 'PASS' : 'FAIL'}`);
  console.log(`Stress files above 95: ${audit.summary.stressAbove95Count}/${audit.summary.stressFileCount}`);
  console.log(`Core regression count: ${audit.summary.regressionCount}`);
  console.log(`Core runtime median delta: ${audit.summary.coreRemediateWallMedianDeltaMs?.toFixed(2) ?? 'n/a'} ms`);
  console.log(`Stress runtime delta ratio: ${audit.summary.stressRuntimeDeltaRatio != null ? (audit.summary.stressRuntimeDeltaRatio * 100).toFixed(2) : 'n/a'}%`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
