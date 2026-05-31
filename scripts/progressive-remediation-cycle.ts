#!/usr/bin/env tsx
/**
 * Progressive public-corpus loop for iterative PDFAF tuning.
 *
 * Workflow:
 * 1) Select up to --batch-size PDFs from a public source directory (excluding already-processed files in state).
 * 2) Analyze -> remediate -> regrade each file.
 * 3) Validate mean score against a target threshold.
 * 4) Optionally validate a protected corpus as a regression guard.
 * 5) On success, move to next batch automatically for --iterations rounds.
 * 6) Delete source PDFs only after a successful batch (set --no-delete to retain).
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, extname, join, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { AnalysisResult, CategoryKey } from '../src/types.js';
import { initSchema } from '../src/db/schema.js';
import { createPlaybookStore } from '../src/services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../src/services/learning/toolOutcomes.js';

type RemediationConfig = {
  targetScore: number;
  maxRounds: number;
  semanticFigurePasses: number;
  semanticPromotePasses: number;
  semanticTimeoutMs: number;
};

type FileRecord = {
  file: string;
  beforeScore: number;
  beforeGrade: string;
  afterScore: number;
  afterGrade: string;
  delta: number;
  durationMs: number;
  weakestBefore?: string;
  weakestAfter?: string;
  status: 'ok' | 'failed';
  error?: string;
};

type BatchReport = {
  batch: number;
  startedAt: string;
  completedAt: string;
  publicDir: string;
  publicFiles: string[];
  targetScore: number;
  beforeMean: number;
  afterMean: number;
  protectedDir?: string;
  protectedBeforeMean?: number;
  protectedAfterMean?: number;
  protectedAnalyzedCount?: number;
  protectedFailedCount?: number;
  protectedWorstCategoryRegression?: number;
  protectedWorstOverallRegression?: number;
  passed: boolean;
  files: FileRecord[];
};

type ProgressState = {
  schema: number;
  batchCount: number;
  lastRunAt: string;
  processed: Record<string, { status: 'ok' | 'failed'; batch: number; error?: string }>;
};

type RawArgs = {
  publicDir: string;
  protectedDir?: string;
  batchSize: number;
  targetScore: number;
  protectedTargetScore: number;
  protectedOverallRegressionTolerance: number;
  protectedCategoryRegressionTolerance: number;
  iterations: number;
  keepSources: boolean;
  workRoot: string;
  statePath: string;
  checkProtected: boolean;
  includeFailed: boolean;
  maxRounds: number;
};

function usage(): string {
  return `
Usage:
  pnpm exec tsx scripts/progressive-remediation-cycle.ts --public-dir <path> [options]

Options:
  --public-dir <dir>                   Required. Directory containing public PDFs to process.
  --protected-dir <dir>                Corpus used as regression guard (e.g. fixed 50 originals).
  --batch-size <20>                    Files per batch (default: 20)
  --target-score <93>                  Required mean score threshold (default: 93)
  --protected-target-score <93>         Regression target for protected corpus mean (default: target-score)
  --protected-overall-drop <0>         Allowed protected corpus mean regression in points (default: 0)
  --protected-category-drop <1>        Allowed category regression in a protected PDF (max per category)
  --iterations <1>                     Number of batches to process before stopping (default: 1)
  --max-rounds <10>                    Max deterministic remediation rounds per file (default: 10)
  --no-delete                          Keep source PDFs on fail/insufficient batches (default: delete on pass)
  --no-protected-check                  Skip protected corpus regression check.
  --include-failed                      Reprocess files that were previously marked failed.
  --work-root <path>                    Working folder for reports and state (default: ./tmp/progressive-remediation)
  --state-path <path>                   Override default state path.
  --help                                Show this help text
  `;
}

function parseArgs(argv: string[]): RawArgs {
  const opts: Partial<RawArgs> = {
    batchSize: 20,
    targetScore: 93,
    protectedTargetScore: 93,
    protectedOverallRegressionTolerance: 0,
    protectedCategoryRegressionTolerance: 1,
    iterations: 1,
    keepSources: false,
    workRoot: join(process.cwd(), 'tmp', 'progressive-remediation'),
    checkProtected: true,
    includeFailed: false,
    maxRounds: 10,
  };

  const next = (i: number): string => {
    if (i + 1 >= argv.length) {
      throw new Error(`Missing value for argument: ${argv[i]}`);
    }
    return argv[i + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--public-dir':
        opts.publicDir = next(i);
        i += 1;
        break;
      case '--protected-dir':
        opts.protectedDir = next(i);
        i += 1;
        break;
      case '--batch-size':
        opts.batchSize = parseInt(next(i), 10);
        i += 1;
        break;
      case '--target-score':
        opts.targetScore = parseFloat(next(i));
        i += 1;
        break;
      case '--protected-target-score':
        opts.protectedTargetScore = parseFloat(next(i));
        i += 1;
        break;
      case '--protected-overall-drop':
        opts.protectedOverallRegressionTolerance = parseFloat(next(i));
        i += 1;
        break;
      case '--protected-category-drop':
        opts.protectedCategoryRegressionTolerance = parseFloat(next(i));
        i += 1;
        break;
      case '--iterations':
        opts.iterations = parseInt(next(i), 10);
        i += 1;
        break;
      case '--max-rounds':
        opts.maxRounds = parseInt(next(i), 10);
        i += 1;
        break;
      case '--no-delete':
        opts.keepSources = true;
        break;
      case '--no-protected-check':
        opts.checkProtected = false;
        break;
      case '--include-failed':
        opts.includeFailed = true;
        break;
      case '--work-root':
        opts.workRoot = next(i);
        i += 1;
        break;
      case '--state-path':
        opts.statePath = next(i);
        i += 1;
        break;
      case '--help':
      case '-h':
        console.log(usage());
        process.exit(0);
      default:
        if (arg.startsWith('--')) {
          console.error('Unknown arg:', arg);
          console.log(usage());
          process.exit(2);
        }
    }
  }

  if (!opts.publicDir) {
    console.error('Missing --public-dir');
    console.log(usage());
    process.exit(2);
  }

  const publicDir = resolve(opts.publicDir);
  const workRoot = resolve(opts.workRoot);
  const statePath = resolve(opts.statePath ?? join(workRoot, 'state.json'));
  const protectedTargetScore = opts.protectedTargetScore ?? opts.targetScore!;

  return {
    ...opts,
    publicDir,
    workRoot,
    statePath,
    protectedTargetScore,
    batchSize: Math.max(1, opts.batchSize!),
    iterations: Math.max(1, opts.iterations!),
    protectedOverallRegressionTolerance: Math.max(0, opts.protectedOverallRegressionTolerance!),
    protectedCategoryRegressionTolerance: Math.max(0, opts.protectedCategoryRegressionTolerance!),
    maxRounds: Math.max(1, opts.maxRounds!),
  } as RawArgs;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function weakestCategory(result: AnalysisResult): string {
  const c = result.categories
    .filter(item => item.applicable)
    .sort((a, b) => a.score - b.score)
    .map(item => `${item.key}=${item.score}`);
  return c.length ? c[0]! : 'n/a';
}

function categoryRegression(before: AnalysisResult, after: AnalysisResult): Array<{ key: CategoryKey; drop: number }> {
  const b = new Map(before.categories.filter(x => x.applicable).map(item => [item.key, item.score]));
  const out: Array<{ key: CategoryKey; drop: number }> = [];
  for (const cat of after.categories) {
    if (!cat.applicable) continue;
    const prev = b.get(cat.key);
    if (prev === undefined) continue;
    if (cat.score + 1e-9 < prev) {
      out.push({ key: cat.key, drop: prev - cat.score });
    }
  }
  return out;
}

function makeTempPath(filename: string): string {
  return join(tmpdir(), `pdfaf-progressive-${Date.now()}-${randomUUID()}-${filename}`);
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function listPdfs(root: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await listPdfs(abs);
      out.push(...nested);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.pdf') {
      out.push(resolve(abs));
    }
  }
  return out;
}

async function loadJsonIfExists<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function saveState(path: string, state: ProgressState): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}

async function loadState(path: string): Promise<ProgressState> {
  const previous = await loadJsonIfExists<ProgressState>(path);
  if (!previous) {
    return {
      schema: 1,
      batchCount: 0,
      lastRunAt: new Date().toISOString(),
      processed: {},
    };
  }
  return {
    schema: previous.schema ?? 1,
    batchCount: previous.batchCount ?? 0,
    lastRunAt: previous.lastRunAt ?? new Date(0).toISOString(),
    processed: previous.processed ?? {},
  };
}

async function probeOpenAiCompatServer(): Promise<boolean> {
  const baseRaw = (process.env['OPENAI_COMPAT_BASE_URL'] ?? '').trim().replace(/\/$/, '');
  if (!baseRaw) return false;
  const url = `${baseRaw}/models`;
  const key = (process.env['OPENAI_COMPAT_API_KEY'] ?? '').trim() || 'local';
  const headers: Record<string, string> = {};
  if (key) headers['Authorization'] = `Bearer ${key}`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return false;
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const model = body.data?.[0]?.id;
    if (model) process.env['OPENAI_COMPAT_MODEL'] = model;
    return true;
  } catch {
    return false;
  }
}

async function runPipelineOnFile(filePath: string, cfg: RemediationConfig, allowSemantic: boolean, llmReady: boolean): Promise<{
  before: AnalysisResult;
  after: AnalysisResult;
  durationMs: number;
  status: 'ok' | 'failed';
  error?: string;
}> {
  const start = Date.now();
  const filename = basename(filePath);

  try {
    const { analyzePdf } = await import('../src/services/pdfAnalyzer.js');
    const { remediatePdf } = await import('../src/services/remediation/orchestrator.js');
    const { applyPostRemediationAltRepair } = await import('../src/services/remediation/altStructureRepair.js');

    const buf = await readFile(filePath);
    const { result: before, snapshot } = await analyzePdf(filePath, filename, { bypassCache: true });

    const memDb = new Database(':memory:');
    initSchema(memDb);
    const run = await remediatePdf(buf, filename, before, snapshot, {
      maxRounds: cfg.maxRounds,
      playbookStore: createPlaybookStore(memDb),
      toolOutcomeStore: createToolOutcomeStore(memDb),
    });
    memDb.close();

    let outBuf = run.buffer;
    let outAfter = run.remediation.after;
    let outSnapshot = run.snapshot;

    if (outSnapshot.isTagged && outAfter.score < cfg.targetScore) {
      const ar = await applyPostRemediationAltRepair(outBuf, filename, outAfter, outSnapshot, {
        signal: AbortSignal.timeout(120_000),
      });
      outBuf = ar.buffer;
      outAfter = ar.analysis;
      outSnapshot = ar.snapshot;
    }

    if (allowSemantic && llmReady && outAfter.score < cfg.targetScore) {
      const { applySemanticRepairs } = await import('../src/services/semantic/semanticService.js');
      const { applySemanticPromoteHeadingRepairs } = await import('../src/services/semantic/promoteHeadingSemantic.js');
      const { applySemanticHeadingRepairs } = await import('../src/services/semantic/headingSemantic.js');
      const { applySemanticUntaggedHeadingRepairs } = await import('../src/services/semantic/untaggedHeadingSemantic.js');

      const semanticOptions = { timeoutMs: cfg.semanticTimeoutMs, signal: AbortSignal.timeout(cfg.semanticTimeoutMs) };
      for (let wave = 0; wave < 8 && outAfter.score < cfg.targetScore; wave++) {
        for (let pass = 0; pass < cfg.semanticFigurePasses; pass++) {
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
          if (figure.summary.proposalsAccepted === 0 || figure.summary.skippedReason !== 'completed') {
            break;
          }
        }
        for (let pass = 0; pass < cfg.semanticPromotePasses; pass++) {
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
          if (promote.summary.proposalsAccepted === 0 || promote.summary.skippedReason !== 'completed') {
            break;
          }
        }

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

        if (outSnapshot.isTagged && outAfter.score < cfg.targetScore) {
          const ar = await applyPostRemediationAltRepair(outBuf, filename, outAfter, outSnapshot, {
            signal: AbortSignal.timeout(120_000),
          });
          outBuf = ar.buffer;
          outAfter = ar.analysis;
          outSnapshot = ar.snapshot;
        }
      }
    }

    const tmpPath = makeTempPath(filename);
    await ensureDir(dirname(tmpPath));
    await writeFile(tmpPath, outBuf);
    try {
      const final = await analyzePdf(tmpPath, filename, { bypassCache: true });
      return {
        before,
        after: final.result,
        durationMs: Date.now() - start,
        status: 'ok',
      };
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  } catch (error) {
    return {
      before: {
        id: '',
        timestamp: '',
        filename,
        pageCount: 0,
        pdfClass: 'native_untagged',
        score: 0,
        grade: 'F',
        categories: [],
        findings: [],
        analysisDurationMs: 0,
      },
      after: {
        id: '',
        timestamp: '',
        filename,
        pageCount: 0,
        pdfClass: 'native_untagged',
        score: 0,
        grade: 'F',
        categories: [],
        findings: [],
        analysisDurationMs: 0,
      },
      durationMs: Date.now() - start,
      status: 'failed',
      error: (error as Error).message,
    };
  }
}

function toReportMd(run: BatchReport): string {
  const lines: string[] = [];
  lines.push('# Progressive remediation cycle');
  lines.push(`- Batch: ${run.batch}`);
  lines.push(`- Started: ${run.startedAt}`);
  lines.push(`- Completed: ${run.completedAt}`);
  lines.push(`- Public source: \`${run.publicDir}\``);
  lines.push(`- Files: ${run.files.length}`);
  lines.push(`- Mean before: ${run.beforeMean.toFixed(2)}`);
  lines.push(`- Mean after: ${run.afterMean.toFixed(2)} (target ${run.targetScore})`);
  lines.push(`- Status: ${run.passed ? 'PASS' : 'FAIL'}`);
  if (run.protectedDir) {
    lines.push(`- Protected before: ${run.protectedBeforeMean?.toFixed(2)}`);
    lines.push(`- Protected after: ${run.protectedAfterMean?.toFixed(2)}`);
    const protectedTotal = (run.protectedAnalyzedCount ?? 0) + (run.protectedFailedCount ?? 0);
    lines.push(`- Protected analyzed: ${run.protectedAnalyzedCount ?? 0}/${protectedTotal}`);
    lines.push(`- Protected worst category regression: ${run.protectedWorstCategoryRegression?.toFixed(2)}`);
    lines.push(`- Protected worst overall regression: ${run.protectedWorstOverallRegression?.toFixed(2)}`);
  }
  lines.push('');
  lines.push('| file | before | after | delta | weak-before | weak-after | status | note |');
  lines.push('| --- | --- | --- | ---: | --- | --- | --- | --- |');
  for (const r of run.files) {
    const note = r.error ? r.error.replace(/\|/g, '/') : '';
    lines.push(
      `| ${basename(r.file)} | ${r.beforeScore}/${r.beforeGrade} | ${r.afterScore}/${r.afterGrade} | ${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(2)} | ${r.weakestBefore ?? ''} | ${r.weakestAfter ?? ''} | ${r.status} | ${note} |`,
    );
  }
  return lines.join('\n') + '\n';
}

async function evaluateProtectedCorpus(opts: RawArgs, cfg: RemediationConfig, llmReady: boolean): Promise<{
  beforeMean: number;
  afterMean: number;
  worstCategoryRegression: number;
  worstOverallRegression: number;
  analyzedCount: number;
  failedCount: number;
}> {
  if (!opts.protectedDir) {
    return {
      beforeMean: 0,
      afterMean: 0,
      worstCategoryRegression: 0,
      worstOverallRegression: 0,
      analyzedCount: 0,
      failedCount: 0,
    };
  }

  const files = (await listPdfs(opts.protectedDir)).sort();
  const rows: Array<{ before: AnalysisResult; after: AnalysisResult }> = [];
  let failedCount = 0;
  for (const file of files) {
    const out = await runPipelineOnFile(file, cfg, false, llmReady);
    if (out.status === 'ok') {
      rows.push({ before: out.before, after: out.after });
    } else {
      failedCount += 1;
    }
  }

  const beforeMean = mean(rows.map(r => r.before.score));
  const afterMean = mean(rows.map(r => r.after.score));
  const worstOverallRegression = beforeMean - afterMean;
  let worstCategoryRegression = 0;
  for (const entry of rows) {
    for (const reg of categoryRegression(entry.before, entry.after)) {
      if (reg.drop > worstCategoryRegression) worstCategoryRegression = reg.drop;
    }
  }
  return {
    beforeMean,
    afterMean,
    worstCategoryRegression,
    worstOverallRegression,
    analyzedCount: rows.length,
    failedCount,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  process.env['REMEDIATION_TARGET_SCORE'] = String(opts.targetScore);

  const statePath = opts.statePath;
  let state = await loadState(statePath);
  await ensureDir(opts.workRoot);

  const allPublic = (await listPdfs(opts.publicDir)).sort();
  if (allPublic.length === 0) {
    console.error('No public PDFs found:', opts.publicDir);
    process.exit(1);
  }

  const { getOpenAiCompatBaseUrl } = await import('../src/config.js');
  const cfg: RemediationConfig = {
    targetScore: opts.targetScore,
    maxRounds: opts.maxRounds,
    semanticFigurePasses: 1,
    semanticPromotePasses: 1,
    semanticTimeoutMs: 600_000,
  };
  const llmReady = Boolean(getOpenAiCompatBaseUrl()) && (await probeOpenAiCompatServer());
  const allowSemantic = llmReady;

  const hasAnyPending = allPublic.some(p =>
    opts.includeFailed ? state.processed[p]?.status !== 'ok' : state.processed[p] === undefined,
  );
  if (!hasAnyPending) {
    console.log('No pending public PDFs left according to state:', statePath);
    process.exit(0);
  }

  for (let iter = 0; iter < opts.iterations; iter++) {
    const remaining = allPublic.filter(p =>
      opts.includeFailed ? state.processed[p]?.status !== 'ok' : state.processed[p] === undefined,
    );
    if (!remaining.length) {
      console.log('No remaining public PDFs to process.');
      break;
    }
    const batch = remaining.slice(0, opts.batchSize);
    const start = Date.now();
    const rows: FileRecord[] = [];

    for (const pdfPath of batch) {
      const out = await runPipelineOnFile(pdfPath, cfg, allowSemantic, llmReady);
      rows.push({
        file: pdfPath,
        beforeScore: out.before.score,
        beforeGrade: out.before.grade,
        afterScore: out.after.score,
        afterGrade: out.after.grade,
        delta: out.after.score - out.before.score,
        durationMs: out.durationMs,
        weakestBefore: weakestCategory(out.before),
        weakestAfter: weakestCategory(out.after),
        status: out.status,
        error: out.error,
      });
      state.processed[pdfPath] = {
        status: out.status,
        batch: state.batchCount + 1,
        ...(out.error ? { error: out.error } : {}),
      };
    }

    const okRows = rows.filter(r => r.status === 'ok');
    const beforeMean = mean(okRows.map(r => r.beforeScore));
    const afterMean = mean(okRows.map(r => r.afterScore));
    const hasFailures = rows.some(r => r.status !== 'ok');
    const report: BatchReport = {
      batch: state.batchCount + 1,
      startedAt: new Date(start).toISOString(),
      completedAt: new Date().toISOString(),
      publicDir: opts.publicDir,
      publicFiles: batch,
      targetScore: cfg.targetScore,
      beforeMean,
      afterMean,
      files: rows,
      passed: false,
    };

    if (opts.checkProtected && opts.protectedDir) {
      const protectedSummary = await evaluateProtectedCorpus(opts, cfg, llmReady);
      report.protectedDir = opts.protectedDir;
      report.protectedBeforeMean = protectedSummary.beforeMean;
      report.protectedAfterMean = protectedSummary.afterMean;
      report.protectedAnalyzedCount = protectedSummary.analyzedCount;
      report.protectedFailedCount = protectedSummary.failedCount;
      report.protectedWorstCategoryRegression = protectedSummary.worstCategoryRegression;
      report.protectedWorstOverallRegression = protectedSummary.worstOverallRegression;
    }

    if (
      !hasFailures &&
      afterMean >= cfg.targetScore &&
      (!opts.checkProtected ||
        !opts.protectedDir ||
        (report.protectedFailedCount === 0 &&
          report.protectedAnalyzedCount !== undefined &&
          report.protectedAnalyzedCount > 0 &&
          report.protectedAfterMean !== undefined &&
          report.protectedAfterMean >= opts.protectedTargetScore &&
          report.protectedWorstOverallRegression !== undefined &&
          report.protectedWorstOverallRegression <= opts.protectedOverallRegressionTolerance &&
          report.protectedWorstCategoryRegression !== undefined &&
          report.protectedWorstCategoryRegression <= opts.protectedCategoryRegressionTolerance))
    ) {
      report.passed = true;
    }

    state.batchCount += 1;
    state.lastRunAt = new Date().toISOString();
    await saveState(statePath, state);

    if (report.passed && !opts.keepSources) {
      for (const pdfPath of batch) {
        await unlink(pdfPath).catch(() => {});
      }
    }

    const batchDir = join(opts.workRoot, `batch-${String(state.batchCount).padStart(3, '0')}`);
    await ensureDir(batchDir);
    await writeFile(join(batchDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
    await writeFile(join(batchDir, 'report.md'), toReportMd(report), 'utf8');

    if (report.passed) {
      console.log(
        `PASS batch ${report.batch}: mean before=${report.beforeMean.toFixed(2)} after=${report.afterMean.toFixed(
          2,
        )} protected=${report.protectedAfterMean !== undefined ? report.protectedAfterMean.toFixed(2) : 'n/a'}`,
      );
    } else {
      console.log(
        `FAIL batch ${report.batch}: mean before=${report.beforeMean.toFixed(2)} after=${report.afterMean.toFixed(
          2,
        )} protected=${report.protectedAfterMean !== undefined ? report.protectedAfterMean.toFixed(2) : 'n/a'}`,
      );
      process.exit(2);
    }

  }
  await saveState(statePath, state);
  console.log(`Progressive remediation complete. State: ${statePath}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
