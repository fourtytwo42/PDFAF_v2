#!/usr/bin/env tsx
import {
  buildStage1AcceptanceAudit,
  loadBenchmarkRowsFromRunDir,
  writeStage1AcceptanceArtifacts,
} from '../src/services/benchmark/stage1Acceptance.js';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage1-acceptance-audit.ts [analyze-run-dir] [full-run-dir] [out-dir]';
}

async function main(): Promise<void> {
  const [analyzeRunDir, fullRunDir, outDir] = process.argv.slice(2);
  const analyzeDir =
    analyzeRunDir ?? 'Output/experiment-corpus-baseline/run-stage1-post-analyze';
  const fullDir =
    fullRunDir ?? 'Output/experiment-corpus-baseline/run-stage1-post-full';
  const outputDir =
    outDir ?? 'Output/experiment-corpus-baseline/stage1-acceptance';

  const analyzeRun = await loadBenchmarkRowsFromRunDir(analyzeDir);
  const fullRun = await loadBenchmarkRowsFromRunDir(fullDir);
  const audit = buildStage1AcceptanceAudit({
    analyzeRunDir: analyzeDir,
    fullRunDir: fullDir,
    analyzeResults: analyzeRun.analyzeResults,
    remediateResults: fullRun.remediateResults,
  });

  await writeStage1AcceptanceArtifacts(outputDir, audit);
  console.log(`Wrote Stage 1 acceptance audit to ${outputDir}`);
  console.log(
    `Analyze MR: ${audit.summary.analyzeManualReviewCount}, post-remediation MR: ${audit.summary.postRemediationManualReviewCount}, suspicious: ${audit.summary.suspiciousOverbroadCount}`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exit(1);
});
