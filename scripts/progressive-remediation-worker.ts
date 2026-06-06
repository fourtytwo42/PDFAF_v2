import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import { unlink, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { AnalysisResult } from '../src/types.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { remediatePdf } from '../src/services/remediation/orchestrator.js';
import { applyPostRemediationAltRepair } from '../src/services/remediation/altStructureRepair.js';

type Args = {
  targetPath: string;
  targetScore: number;
  maxRounds: number;
  allowSemantic: boolean;
  llmReady: boolean;
  safeMode: boolean;
};

function parseArgs(argv: string[]): Args {
  const targetPath = argv[2];
  if (!targetPath) {
    throw new Error('missing target path');
  }
  const targetScore = Number(argv[3] ?? '93');
  const maxRounds = Number(argv[4] ?? '10');
  const allowSemantic = argv[5] === '1';
  const llmReady = argv[6] === '1';
  const safeMode = argv[7] === '1';
  return {
    targetPath,
    targetScore: Number.isFinite(targetScore) && targetScore > 0 ? targetScore : 93,
    maxRounds: Number.isFinite(maxRounds) && maxRounds > 0 ? Math.floor(maxRounds) : 10,
    allowSemantic,
    llmReady,
    safeMode,
  };
}

function makeTempPath(filename: string): string {
  return join(tmpdir(), `pdfaf-progressive-${Date.now()}-${randomUUID()}-${filename}`);
}

function traceWorkerEvent(kind: string, payload: Record<string, unknown>): void {
  if (process.env['PROGRESSIVE_WORKER_TRACE'] !== '1') return;
  process.stderr.write(JSON.stringify({ kind, ...payload }) + '\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const start = Date.now();
  const filename = basename(args.targetPath);

  traceWorkerEvent('worker_start', {
    filename,
    maxRounds: args.maxRounds,
    allowSemantic: args.allowSemantic,
    llmReady: args.llmReady,
    safeMode: args.safeMode,
  });
  const source = await readFile(args.targetPath);
  const { result: before, snapshot } = await analyzePdf(args.targetPath, filename, { bypassCache: true });
  traceWorkerEvent('worker_before_analyzed', {
    elapsedMs: Date.now() - start,
    score: before.score,
    grade: before.grade,
  });

  const run = await remediatePdf(source, filename, before, snapshot, {
    maxRounds: args.maxRounds,
    onProgress: update => traceWorkerEvent('progress', {
      elapsedMs: Date.now() - start,
      ...update,
    }),
    onRuntimeTrace: event => traceWorkerEvent('runtime', event as unknown as Record<string, unknown>),
  });
  traceWorkerEvent('worker_remediated', {
    elapsedMs: Date.now() - start,
    score: run.remediation.after.score,
    grade: run.remediation.after.grade,
    appliedToolCount: run.remediation.appliedTools.length,
  });

  let outBuf = run.buffer;
  let outAfter = run.remediation.after;
  let outSnapshot = run.snapshot;

  if (!args.safeMode && outSnapshot.isTagged && outAfter.score < args.targetScore) {
    const ar = await applyPostRemediationAltRepair(outBuf, filename, outAfter, outSnapshot, {
      signal: AbortSignal.timeout(120_000),
    });
    outBuf = ar.buffer;
    outAfter = ar.analysis;
    outSnapshot = ar.snapshot;
  }

  if (!args.safeMode && args.allowSemantic && args.llmReady && outAfter.score < args.targetScore) {
    const { applySemanticRepairs } = await import('../src/services/semantic/semanticService.js');
    const { applySemanticPromoteHeadingRepairs } = await import('../src/services/semantic/promoteHeadingSemantic.js');
    const { applySemanticHeadingRepairs } = await import('../src/services/semantic/headingSemantic.js');
    const { applySemanticUntaggedHeadingRepairs } = await import('../src/services/semantic/untaggedHeadingSemantic.js');

    const semanticOptions = { timeoutMs: 600_000, signal: AbortSignal.timeout(600_000) };
    for (let wave = 0; wave < 8 && outAfter.score < args.targetScore; wave++) {
      const figure = await applySemanticRepairs({
        buffer: outBuf,
        filename,
        analysis: outAfter,
        snapshot: outSnapshot,
        options: semanticOptions,
      });
      outBuf = figure.buffer;
      outAfter = figure.analysis;
      outSnapshot = figure.snapshot;

      const promote = await applySemanticPromoteHeadingRepairs({
        buffer: outBuf,
        filename,
        analysis: outAfter,
        snapshot: outSnapshot,
        options: semanticOptions,
      });
      outBuf = promote.buffer;
      outAfter = promote.analysis;
      outSnapshot = promote.snapshot;

      const heading = await applySemanticHeadingRepairs({
        buffer: outBuf,
        filename,
        analysis: outAfter,
        snapshot: outSnapshot,
        options: semanticOptions,
      });
      outBuf = heading.buffer;
      outAfter = heading.analysis;
      outSnapshot = heading.snapshot;

      const untagged = await applySemanticUntaggedHeadingRepairs({
        buffer: outBuf,
        filename,
        analysis: outAfter,
        snapshot: outSnapshot,
        options: semanticOptions,
      });
      outBuf = untagged.buffer;
      outAfter = untagged.analysis;
      outSnapshot = untagged.snapshot;
    }
  }

  const tmpPath = makeTempPath(filename);
  await writeFile(tmpPath, outBuf);
  try {
    const final = await analyzePdf(tmpPath, filename, { bypassCache: true });
    console.log(
      JSON.stringify({
        ok: true,
        before,
        after: final.result as AnalysisResult,
        durationMs: Date.now() - start,
      }),
    );
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

main().catch(err => {
  console.error('ERROR', err);
  process.exit(1);
});
