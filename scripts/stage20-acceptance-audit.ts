#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BenchmarkComparison } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage20AcceptanceAudit,
  writeStage20AcceptanceArtifacts,
} from '../src/services/benchmark/stage20Acceptance.js';

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage20-acceptance-audit.ts',
    '  [core-stage19-run-dir]',
    '  [core-stage20-run-dir]',
    '  [core-comparison-dir]',
    '  [edge-case-run-dir]',
    '  [out-dir]',
  ].join(' ');
}

async function loadComparison(dir: string): Promise<BenchmarkComparison> {
  return JSON.parse(await readFile(join(resolve(dir), 'comparison.json'), 'utf8')) as BenchmarkComparison;
}

async function main(): Promise<void> {
  const [stage19Arg, stage20Arg, comparisonArg, edgeCaseArg, outArg] = process.argv.slice(2);

  const coreStage19RunDir = stage19Arg ?? 'Output/experiment-corpus-baseline/run-stage19-full';
  const coreStage20RunDir = stage20Arg ?? 'Output/experiment-corpus-baseline/run-stage20-full';
  const coreComparisonDir = comparisonArg ?? 'Output/experiment-corpus-baseline/comparison-stage20-vs-stage19';
  const edgeCaseRunDir = edgeCaseArg ?? 'Output/from_sibling_pdfaf_edgecase_corpus/stage19-baseline/run-2026-04-19T21-59-13-051Z';
  const outputDir = outArg ?? 'Output/experiment-corpus-baseline/stage20-acceptance';

  const [coreStage19Rows, coreStage20Rows, edgeCaseRows, comparison] = await Promise.all([
    loadBenchmarkRowsFromRunDir(coreStage19RunDir).then(r => r.remediateResults),
    loadBenchmarkRowsFromRunDir(coreStage20RunDir).then(r => r.remediateResults),
    loadBenchmarkRowsFromRunDir(edgeCaseRunDir).then(r => r.remediateResults),
    loadComparison(coreComparisonDir),
  ]);

  const audit = buildStage20AcceptanceAudit({
    coreStage19RunDir,
    coreStage20RunDir,
    coreComparisonDir,
    edgeCaseRunDir,
    coreStage19Rows,
    coreStage20Rows,
    edgeCaseRows,
    comparison,
  });

  await writeStage20AcceptanceArtifacts(outputDir, audit);

  console.log(`Wrote Stage 20 acceptance audit to ${outputDir}`);
  console.log(`Acceptance: ${audit.stage20Passed ? 'PASS' : 'FAIL'}`);
  console.log('');
  console.log('Gates:');
  for (const gate of audit.gates) {
    console.log(`  ${gate.passed ? '✓' : '✗'} ${gate.key}: ${gate.detail}`);
  }
  console.log('');
  console.log(`Core: ${audit.summary.coreAllACount}/${audit.summary.coreFileCount} A, mean ${audit.summary.coreMeanScore?.toFixed(2) ?? 'n/a'}`);
  console.log(`Core wall median: ${audit.summary.coreStage19MedianWallMs?.toFixed(0) ?? 'n/a'} ms → ${audit.summary.coreMedianWallMs?.toFixed(0) ?? 'n/a'} ms (${audit.summary.coreWallMedianDeltaMs?.toFixed(0) ?? 'n/a'} ms)`);
  console.log(`Edge-case: ${audit.summary.edgeCaseAllACount}/${audit.summary.edgeCaseFileCount} A, mean ${audit.summary.edgeCaseMeanScore?.toFixed(2) ?? 'n/a'}`);
  console.log(`Regressions: ${audit.summary.regressionCount}`);

  if (!audit.stage20Passed) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
