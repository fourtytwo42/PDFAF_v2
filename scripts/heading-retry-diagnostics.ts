#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzeHeadingRetryRows } from '../src/services/remediation/headingRetryDiagnostics.js';

async function main(): Promise<void> {
  const runDir = process.argv[2];
  if (!runDir || runDir === '--help' || runDir === '-h') {
    console.error('Usage: pnpm exec tsx scripts/heading-retry-diagnostics.ts <benchmark-run-dir>');
    process.exit(runDir ? 0 : 1);
  }

  const resultsPath = join(runDir, 'remediate.results.json');
  const rows = JSON.parse(await readFile(resultsPath, 'utf8')) as unknown[];
  const summary = analyzeHeadingRetryRows(rows);

  console.log(`Heading retry diagnostics for ${runDir}`);
  console.log(`total heading attempts: ${summary.totalHeadingAttempts}`);
  console.log(`heading no_effect: ${summary.totalHeadingNoEffect}`);
  console.log(`no_effect with targetRef: ${summary.noEffectWithTargetRef}/${summary.totalHeadingNoEffect} (${summary.targetRefCoveragePct}%)`);
  console.log(`missing targetRef: ${summary.missingTargetRefCount}`);
  console.log(`repeated exact blocked signatures: ${summary.repeatedExactBlockedSignatures.length}`);
  console.log(`would skip attempts if exact suppression were enabled: ${summary.wouldSkipAttempts}`);
  console.log(`distinct-candidate progression files: ${summary.distinctCandidateProgressionFiles.length}`);
  console.log(`convergence-sensitive no_effect attempts: ${summary.convergenceSensitiveNoEffectCount}`);
  console.log(`successful files with heading no_effects to protect: ${summary.successfulScoreOutcomesMustNotTouch.length}`);

  if (summary.repeatedExactBlockedSignatures.length > 0) {
    console.log('\nRepeated exact blocked signatures:');
    for (const row of summary.repeatedExactBlockedSignatures.slice(0, 25)) {
      console.log(`- ${row.fileId} target=${row.targetRef} note=${row.note} count=${row.count} wouldSkip=${row.wouldSkip} blockers=${row.hardBlockers.join(',')}`);
    }
  }

  if (summary.needsPythonDetailFixFiles.length > 0) {
    console.log('\nFiles with missing targetRef instrumentation:');
    for (const fileId of summary.needsPythonDetailFixFiles.slice(0, 50)) {
      console.log(`- ${fileId}`);
    }
  }

  if (summary.successfulScoreOutcomesMustNotTouch.length > 0) {
    console.log('\nSuccessful score outcomes with heading no_effect attempts:');
    for (const row of summary.successfulScoreOutcomesMustNotTouch.slice(0, 25)) {
      console.log(`- ${row.fileId} score=${row.score} noEffect=${row.noEffectCount} targets=${row.targetRefs.join(',') || 'none'} notes=${row.notes.join(',')}`);
    }
  }

  console.log('\nJSON summary:');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
