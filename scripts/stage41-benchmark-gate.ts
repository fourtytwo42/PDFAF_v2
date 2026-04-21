#!/usr/bin/env tsx
import { loadBenchmarkSummaryFromRunDir } from '../src/services/benchmark/compareRuns.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage41BenchmarkGateAudit,
  writeStage41BenchmarkGateArtifacts,
} from '../src/services/benchmark/stage41BenchmarkGate.js';

const DEFAULT_BASELINE = 'Output/experiment-corpus-baseline/run-stage40-full-2026-04-21-r1';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage41-benchmark-gate.ts [baseline-run-dir] <candidate-run-dir> [out-dir]';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  let baselineRunDir = DEFAULT_BASELINE;
  let candidateRunDir = '';
  let outputDir = '';

  if (args.length === 1) {
    candidateRunDir = args[0] ?? '';
  } else if (args.length >= 2) {
    baselineRunDir = args[0] ?? DEFAULT_BASELINE;
    candidateRunDir = args[1] ?? '';
    outputDir = args[2] ?? '';
  }

  if (!candidateRunDir || args.length > 3) {
    throw new Error('Candidate run directory is required.\n' + usage());
  }
  outputDir = outputDir || 'Output/experiment-corpus-baseline/stage41-benchmark-gate';

  const [baselineSummary, candidateSummary, baselineRows, candidateRows] = await Promise.all([
    loadBenchmarkSummaryFromRunDir(baselineRunDir),
    loadBenchmarkSummaryFromRunDir(candidateRunDir),
    loadBenchmarkRowsFromRunDir(baselineRunDir),
    loadBenchmarkRowsFromRunDir(candidateRunDir),
  ]);

  const audit = buildStage41BenchmarkGateAudit({
    baselineRunDir,
    candidateRunDir,
    baselineSummary,
    candidateSummary,
    baselineRemediateResults: baselineRows.remediateResults,
    candidateRemediateResults: candidateRows.remediateResults,
  });

  await writeStage41BenchmarkGateArtifacts(outputDir, audit);
  console.log(`Wrote Stage 41 benchmark gate to ${outputDir}`);
  console.log(`Gate: ${audit.passed ? 'PASS' : 'FAIL'}`);
  console.log(`Mean: ${audit.summary.baselineMean ?? 'n/a'} -> ${audit.summary.candidateMean ?? 'n/a'}`);
  console.log(`Median: ${audit.summary.baselineMedian ?? 'n/a'} -> ${audit.summary.candidateMedian ?? 'n/a'}`);
  console.log(`p95 wall ms: ${audit.summary.baselineP95WallMs ?? 'n/a'} -> ${audit.summary.candidateP95WallMs ?? 'n/a'}`);
  console.log(`Attempts: ${audit.summary.baselineAttemptCount} -> ${audit.summary.candidateAttemptCount}`);
  if (!audit.passed) {
    console.log(`Failed gates: ${audit.gates.filter(gate => gate.severity === 'hard' && !gate.passed).map(gate => gate.key).join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
