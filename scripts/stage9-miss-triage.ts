#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Stage8FinalGateAudit } from '../src/services/benchmark/stage8FinalGate.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import {
  buildStage9MissTriageAudit,
  writeStage9MissTriageArtifacts,
} from '../src/services/benchmark/stage9MissTriage.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage9-miss-triage.ts [stage8-gate-dir] [run-dir] [out-dir]';
}

async function loadGate(dir: string): Promise<Stage8FinalGateAudit> {
  return JSON.parse(
    await readFile(join(resolve(dir), 'stage8-final-gate.json'), 'utf8'),
  ) as Stage8FinalGateAudit;
}

async function main(): Promise<void> {
  const [gateArg, runArg, outArg] = process.argv.slice(2);
  const gateDir = gateArg ?? 'Output/experiment-corpus-baseline/stage8-final-gate';
  const runDir = runArg ?? 'Output/experiment-corpus-baseline/run-stage8-full';
  const outputDir = outArg ?? 'Output/experiment-corpus-baseline/stage9-miss-triage';

  const gate = await loadGate(gateDir);
  const { analyzeResults, remediateResults } = await loadBenchmarkRowsFromRunDir(runDir);

  const audit = buildStage9MissTriageAudit({
    stage8GateDir: gateDir,
    runDir,
    gate,
    analyzeResults,
    remediateResults,
  });

  await writeStage9MissTriageArtifacts(outputDir, audit);

  console.log(`Wrote Stage 9 miss triage to ${outputDir}`);
  console.log(`Total files: ${audit.summary.totalFiles} | Non-100: ${audit.summary.non100Count}`);
  console.log(`fix_not_attempted: ${audit.summary.fixNotAttemptedCount} | fix_attempted_not_credited: ${audit.summary.fixAttemptedNotCreditedCount} | genuinely_unsafe: ${audit.summary.genuinelyUnsafeCount}`);
  console.log(`A-not-100: ${audit.summary.aNot100Count} | Convertible (cheap): ${audit.summary.aNot100ConvertibleCount}`);
  console.log(`Stage 10 candidates: ${audit.nextStageTargets.stage10Candidates.length}`);
  console.log(`Stage 11 candidates (structure): ${audit.nextStageTargets.stage11Candidates.length}`);
  console.log(`Stage 12 candidates (font): ${audit.nextStageTargets.stage12Candidates.length}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
