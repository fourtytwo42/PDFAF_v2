#!/usr/bin/env tsx
import { compareVisualStabilityRun, writeVisualStabilityRunReport } from '../src/services/benchmark/visualStability.js';

interface ParsedArgs {
  runDir: string;
  outDir: string;
  strict: boolean;
}

const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage103-visual-stability-run-2026-04-26-r1';

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage103-visual-stability-run.ts --run-dir <dir> [options]',
    '  --run-dir <dir>   Benchmark run directory with manifest.snapshot.json and pdfs/',
    '  --strict          Exit non-zero if any row drifts or an output PDF is missing',
    `  --out <dir>       Default: ${DEFAULT_OUT}`,
  ].join('\n');
}

function parseArgs(argv: string[]): ParsedArgs {
  let runDir = '';
  let outDir = DEFAULT_OUT;
  let strict = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--strict') {
      strict = true;
      continue;
    }
    const next = argv[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--run-dir') runDir = next;
    else if (arg === '--out') outDir = next;
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  if (!runDir) throw new Error('Missing required --run-dir.');
  return { runDir, outDir, strict };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await compareVisualStabilityRun({
    runDir: args.runDir,
    strict: args.strict,
  });
  await writeVisualStabilityRunReport(report, args.outDir);
  console.log(`Wrote ${args.outDir}`);

  if (args.strict && (report.driftCount > 0 || report.missingCount > 0)) {
    process.exit(2);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
