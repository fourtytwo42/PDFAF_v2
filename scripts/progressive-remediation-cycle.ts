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
import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, extname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalysisResult, CategoryKey } from '../src/types.js';

type RemediationConfig = {
  targetScore: number;
  maxRounds: number;
  workerTimeoutMs: number;
  safeOnly: boolean;
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

type ProtectedFileRecord = {
  file: string;
  beforeScore: number;
  beforeGrade: string;
  afterScore: number;
  afterGrade: string;
  delta: number;
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
  protectedRows?: ProtectedFileRecord[];
  protectedCheckAttempts?: number;
  protectedRecoveredWithRetry?: boolean;
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
  workerTimeoutMs: number;
  safeOnly: boolean;
  protectedRerunsOnFailure: number;
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
  --protected-reruns-on-failure <1>   Re-run protected checks up to N additional times after an initial failure.
  --iterations <1>                     Number of batches to process before stopping (default: 1)
  --max-rounds <10>                    Max deterministic remediation rounds per file (default: 10)
  --no-delete                          Keep source PDFs on fail/insufficient batches (default: delete on pass)
  --no-protected-check                  Skip protected corpus regression check.
  --include-failed                      Reprocess files that were previously marked failed.
  --work-root <path>                    Working folder for reports and state (default: ./tmp/progressive-remediation)
  --state-path <path>                   Override default state path.
  --worker-timeout-ms <360000>          Timeout for each worker attempt before marking it failed.
  --safe-only                           Skip full-mode worker attempts; useful for bounded diagnostics.
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
    workerTimeoutMs: 360_000,
    safeOnly: false,
    protectedRerunsOnFailure: 1,
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
      case '--protected-reruns-on-failure':
        opts.protectedRerunsOnFailure = parseInt(next(i), 10);
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
      case '--worker-timeout-ms':
        opts.workerTimeoutMs = parseInt(next(i), 10);
        i += 1;
        break;
      case '--no-delete':
        opts.keepSources = true;
        break;
      case '--no-protected-check':
        opts.checkProtected = false;
        break;
      case '--safe-only':
        opts.safeOnly = true;
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
    workerTimeoutMs: Math.max(1_000, opts.workerTimeoutMs!),
    safeOnly: opts.safeOnly!,
    protectedRerunsOnFailure: Math.max(0, opts.protectedRerunsOnFailure!),
  } as RawArgs;
}

export function resolveWorkerDbPath(kind: 'public' | 'protected', workRoot: string, batchNumber: number): string {
  if (kind === 'protected') return ':memory:';
  return join(workRoot, `batch-${String(batchNumber).padStart(3, '0')}`, 'learning.db');
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

async function saveProgress(path: string, payload: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
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

type WorkerResult = {
  ok: true;
  before: AnalysisResult;
  after: AnalysisResult;
  durationMs: number;
};

async function runPipelineOnFile(filePath: string, cfg: RemediationConfig, allowSemantic: boolean, llmReady: boolean, dbPath: string): Promise<{
  before: AnalysisResult;
  after: AnalysisResult;
  durationMs: number;
  status: 'ok' | 'failed';
  error?: string;
}> {
  const start = Date.now();
  const filename = basename(filePath);
  const tsxCli = resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const worker = resolve(process.cwd(), 'scripts', 'progressive-remediation-worker.ts');

  const attempts = cfg.safeOnly
    ? cfg.maxRounds <= 1
      ? [
          { label: 'safe-1', maxRounds: 1, safeMode: '1', retries: 1 },
        ] as const
      : [
          { label: 'safe-10', maxRounds: cfg.maxRounds, safeMode: '1', retries: 2 },
          { label: 'safe-1', maxRounds: 1, safeMode: '1', retries: 1 },
        ] as const
    : cfg.maxRounds <= 1
      ? [
          { label: 'safe-1', maxRounds: 1, safeMode: '1', retries: 1 },
          { label: 'full-1', maxRounds: 1, safeMode: '0', retries: 1 },
      ] as const
    : [
        { label: 'safe-10', maxRounds: cfg.maxRounds, safeMode: '1', retries: 2 },
        { label: 'safe-1', maxRounds: 1, safeMode: '1', retries: 3 },
        { label: 'full-10', maxRounds: cfg.maxRounds, safeMode: '0', retries: 1 },
        { label: 'full-1', maxRounds: 1, safeMode: '0', retries: 1 },
      ] as const;
  let lastError = `worker failed without output for ${filename}`;
  let lastStderr = '';

  for (const attempt of attempts) {
    for (let retry = 0; retry < attempt.retries; retry++) {
      const suffix = attempt.retries > 1 ? ` ${attempt.label}#${retry + 1}` : attempt.label;
      const workerResult = spawnSync(process.execPath, [
        tsxCli,
        worker,
        filePath,
        String(cfg.targetScore),
        String(attempt.maxRounds),
        allowSemantic ? '1' : '0',
        llmReady ? '1' : '0',
        attempt.safeMode,
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: cfg.workerTimeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        env: {
          ...process.env,
          DB_PATH: dbPath,
        },
      });

      const stdout = (workerResult.stdout ?? '').toString().trim();
      const workerError = (workerResult.stderr ?? '').toString().trim();
      if (workerError) lastStderr = workerError;

      if (workerResult.status === 0 && stdout) {
        try {
          const parsed = JSON.parse(stdout) as WorkerResult;
          if (parsed.ok && parsed.after.score >= cfg.targetScore) {
            return {
              before: parsed.before,
              after: parsed.after,
              durationMs: Date.now() - start,
              status: 'ok',
            };
          }
          if (parsed.ok) {
            lastError = `worker score ${parsed.after.score.toFixed(2)} below target ${cfg.targetScore.toFixed(2)} (${suffix})`;
            continue;
          }
          lastError = `worker returned invalid payload (${suffix})`;
        } catch (error) {
          lastError = `worker parse failure for ${filename} (${suffix}): ${(error as Error).message}`;
        }
        continue;
      }

      const timedOut = workerResult.signal === 'SIGTERM' || (workerResult.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';
      if (timedOut) {
        lastError = `worker timed out after ${cfg.workerTimeoutMs}ms in ${suffix}`;
        break;
      }

      if (!workerResult.status) {
        if (workerResult.error) {
          lastError = `worker execution error (${suffix}): ${workerResult.error.message}`;
        } else {
          lastError = `worker returned no payload (${suffix})`;
        }
        continue;
      }

      if (workerResult.status === 3221225477) {
        lastError = `worker crashed (exit ${workerResult.status}) in ${suffix}`;
        continue;
      }

      lastError = `worker failed (exit ${workerResult.status}) in ${suffix}: ${workerError}`.trim();
    }
  }

  try {
    const { analyzePdf } = await import('../src/services/pdfAnalyzer.js');
    const { result: before } = await analyzePdf(filePath, filename, { bypassCache: true });
    return {
      before,
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
        analysisDurationMs: Date.now() - start,
      },
      durationMs: Date.now() - start,
      status: 'failed',
      error: `${lastError}. ${lastStderr}`.trim(),
    };
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
        analysisDurationMs: Date.now() - start,
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
        analysisDurationMs: Date.now() - start,
      },
      durationMs: Date.now() - start,
      status: 'failed',
      error: `${lastError}. ${lastStderr}. ${(error as Error).message}`.trim(),
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
    if (run.protectedCheckAttempts !== undefined) {
      lines.push(`- Protected check attempts: ${run.protectedCheckAttempts}`);
    }
    if (run.protectedRecoveredWithRetry) {
      lines.push('- Protected regression failed first pass, but recovered on retry.');
    }
    if (run.protectedRows && run.protectedRows.length > 0) {
      lines.push('');
      lines.push('## Protected files');
      lines.push('| file | before | after | delta | weak-before | weak-after | status | note |');
      lines.push('| --- | --- | --- | ---: | --- | --- | --- | --- |');
      for (const r of run.protectedRows) {
        const note = r.error ? r.error.replace(/\|/g, '/') : '';
        lines.push(
          `| ${basename(r.file)} | ${r.beforeScore}/${r.beforeGrade} | ${r.afterScore}/${r.afterGrade} | ${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(2)} | ${r.weakestBefore ?? ''} | ${r.weakestAfter ?? ''} | ${r.status} | ${note} |`,
        );
      }
    }
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

async function evaluateProtectedCorpus(opts: RawArgs, cfg: RemediationConfig, llmReady: boolean, batchNumber: number): Promise<{
  beforeMean: number;
  afterMean: number;
  worstCategoryRegression: number;
  worstOverallRegression: number;
  analyzedCount: number;
  failedCount: number;
  rows: ProtectedFileRecord[];
  attempts: number;
  recoveredWithRetry: boolean;
}> {
  const files = opts.protectedDir ? (await listPdfs(opts.protectedDir)).sort() : [];
  if (!opts.protectedDir || files.length === 0) {
    return {
      beforeMean: 0,
      afterMean: 0,
      worstCategoryRegression: 0,
      worstOverallRegression: 0,
      analyzedCount: 0,
      failedCount: 0,
      rows: [],
      attempts: 1,
      recoveredWithRetry: false,
    };
  }

  const runOnce = async (attemptNumber: number): Promise<{
    beforeMean: number;
    afterMean: number;
    worstCategoryRegression: number;
    worstOverallRegression: number;
    analyzedCount: number;
    failedCount: number;
    rows: ProtectedFileRecord[];
  }> => {
    const rows: ProtectedFileRecord[] = [];
    const analyzedRows: Array<{ before: AnalysisResult; after: AnalysisResult }> = [];
    let failedCount = 0;
    const batchDir = join(opts.workRoot, `batch-${String(batchNumber).padStart(3, '0')}`);
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]!;
      console.log(`START protected attempt=${attemptNumber} ${index + 1}/${files.length}: ${basename(file)}`);
      const out = await runPipelineOnFile(file, cfg, false, llmReady, resolveWorkerDbPath('protected', opts.workRoot, batchNumber));
      const row = {
        file,
        beforeScore: out.before.score,
        beforeGrade: out.before.grade,
        afterScore: out.after.score,
        afterGrade: out.after.grade,
        delta: out.after.score - out.before.score,
        weakestBefore: weakestCategory(out.before),
        weakestAfter: weakestCategory(out.after),
        status: out.status,
        ...(out.error ? { error: out.error } : {}),
      } satisfies ProtectedFileRecord;
      rows.push(row);
      console.log(
        `DONE protected attempt=${attemptNumber} ${index + 1}/${files.length}: ${basename(file)} status=${row.status} before=${row.beforeScore.toFixed(
          2,
        )} after=${row.afterScore.toFixed(2)} delta=${row.delta.toFixed(2)}${row.error ? ` note=${row.error}` : ''}`,
      );
      if (out.status === 'ok') {
        analyzedRows.push({ before: out.before, after: out.after });
      } else {
        failedCount += 1;
      }
      await saveProgress(join(batchDir, `protected-progress-attempt-${attemptNumber}.json`), {
        phase: 'protected',
        batch: batchNumber,
        attempt: attemptNumber,
        protectedDir: opts.protectedDir,
        completedRows: rows.length,
        totalRows: files.length,
        rows,
        updatedAt: new Date().toISOString(),
      });
    }

    const beforeMean = mean(analyzedRows.map(r => r.before.score));
    const afterMean = mean(analyzedRows.map(r => r.after.score));
    const worstOverallRegression = beforeMean - afterMean;
    let worstCategoryRegression = 0;
    for (const entry of analyzedRows) {
      for (const reg of categoryRegression(entry.before, entry.after)) {
        if (reg.drop > worstCategoryRegression) worstCategoryRegression = reg.drop;
      }
    }
    return {
      beforeMean,
      afterMean,
      worstCategoryRegression,
      worstOverallRegression,
      analyzedCount: analyzedRows.length,
      failedCount,
      rows,
    };
  };

  const isPass = (summary: { beforeMean: number; afterMean: number; worstCategoryRegression: number; worstOverallRegression: number; analyzedCount: number; failedCount: number }): boolean =>
    summary.failedCount === 0 &&
    summary.analyzedCount > 0 &&
    summary.afterMean >= opts.protectedTargetScore &&
    summary.worstOverallRegression <= opts.protectedOverallRegressionTolerance &&
    summary.worstCategoryRegression <= opts.protectedCategoryRegressionTolerance;

  let attempts = 0;
  let lastSummary = {
    beforeMean: 0,
    afterMean: 0,
    worstCategoryRegression: 0,
    worstOverallRegression: 0,
    analyzedCount: 0,
    failedCount: 0,
    rows: [] as ProtectedFileRecord[],
  };
  for (let attempt = 0; attempt <= opts.protectedRerunsOnFailure; attempt += 1) {
    attempts += 1;
    const summary = await runOnce(attempts);
    lastSummary = summary;
    if (isPass(summary)) {
      return {
        ...summary,
        attempts,
        recoveredWithRetry: attempt > 0,
      };
    }
  }
  return {
    ...lastSummary,
    attempts,
    recoveredWithRetry: false,
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
    workerTimeoutMs: opts.workerTimeoutMs,
    safeOnly: opts.safeOnly,
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
    const batchDir = join(opts.workRoot, `batch-${String(state.batchCount + 1).padStart(3, '0')}`);
    await ensureDir(batchDir);
    const batchDbPath = resolveWorkerDbPath('public', opts.workRoot, state.batchCount + 1);
    const start = Date.now();
    const rows: FileRecord[] = [];

    for (let index = 0; index < batch.length; index += 1) {
      const pdfPath = batch[index]!;
      console.log(`START public ${index + 1}/${batch.length}: ${basename(pdfPath)}`);
      const out = await runPipelineOnFile(pdfPath, cfg, allowSemantic, llmReady, batchDbPath);
      const row = {
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
      } satisfies FileRecord;
      rows.push(row);
      console.log(
        `DONE public ${index + 1}/${batch.length}: ${basename(pdfPath)} status=${row.status} before=${row.beforeScore.toFixed(
          2,
        )} after=${row.afterScore.toFixed(2)} delta=${row.delta.toFixed(2)} durationMs=${row.durationMs}${
          row.error ? ` note=${row.error}` : ''
        }`,
      );
      state.processed[pdfPath] = {
        status: out.status,
        batch: state.batchCount + 1,
        ...(out.error ? { error: out.error } : {}),
      };
      await saveProgress(join(batchDir, 'progress.json'), {
        phase: 'public',
        batch: state.batchCount + 1,
        publicDir: opts.publicDir,
        targetScore: cfg.targetScore,
        maxRounds: cfg.maxRounds,
        workerTimeoutMs: cfg.workerTimeoutMs,
        safeOnly: cfg.safeOnly,
        completedRows: rows.length,
        totalRows: batch.length,
        files: rows,
        updatedAt: new Date().toISOString(),
      });
    }

    const beforeMean = mean(rows.map(r => r.beforeScore));
    const afterMean = mean(rows.map(r => r.afterScore));
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
      const protectedSummary = await evaluateProtectedCorpus(opts, cfg, llmReady, state.batchCount + 1);
      report.protectedDir = opts.protectedDir;
      report.protectedBeforeMean = protectedSummary.beforeMean;
      report.protectedAfterMean = protectedSummary.afterMean;
      report.protectedAnalyzedCount = protectedSummary.analyzedCount;
      report.protectedFailedCount = protectedSummary.failedCount;
      report.protectedRows = protectedSummary.rows;
      report.protectedWorstCategoryRegression = protectedSummary.worstCategoryRegression;
      report.protectedWorstOverallRegression = protectedSummary.worstOverallRegression;
      report.protectedCheckAttempts = protectedSummary.attempts;
      report.protectedRecoveredWithRetry = protectedSummary.recoveredWithRetry;
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

if (!process.env.VITEST && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
