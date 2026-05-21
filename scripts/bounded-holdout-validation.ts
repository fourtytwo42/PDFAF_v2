#!/usr/bin/env tsx
import 'dotenv/config';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_TMP_ROOT = '/mnt/pdf-review/pdfaf-tmp';
const DEFAULT_LIMIT = 20;

interface ParsedArgs {
  inputDir: string;
  outDir: string;
  limit: number;
  perPdfTimeoutMs: number;
  tmpRoot: string;
  keepRowArtifacts: boolean;
}

export interface BoundedHoldoutRow {
  file: string;
  pdfClassBefore: string | null;
  beforeScore: number | null;
  beforeGrade: string | null;
  categoriesBefore: unknown[];
  afterDeterministicScore: number | null;
  afterDeterministicGrade: string | null;
  afterScore: number | null;
  afterGrade: string | null;
  pdfClassAfter: string | null;
  delta: number | null;
  durationMs: number;
  semanticRan: boolean;
  categoryGap?: unknown;
  appliedTools: unknown[];
  falsePositiveApplied: number;
  error?: string;
  boundedRunner?: {
    timedOut: boolean;
    exitCode: number | null;
    signal: string | null;
    rowArtifactDir: string;
  };
}

export interface BoundedHoldoutReport {
  generatedAt: string;
  inputDir: string;
  outputDir: string;
  flags: {
    semantic: false;
    writePdfs: false;
    externalPerPdfTimeoutMs: number;
  };
  pipeline: string;
  summary: {
    count: number;
    completed: number;
    targetScore: number;
    belowTarget: number;
    meanBefore: number;
    meanAfter: number;
    allRowMeanAfter: number;
    falsePositiveApplied: number;
    timeoutOrErrorCount: number;
  };
  rows: BoundedHoldoutRow[];
}

interface ChildRunResult {
  timedOut: boolean;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  stdout: string;
  stderr: string;
}

function usage(): string {
  return `Usage:
  pnpm exec tsx scripts/bounded-holdout-validation.ts <inputDir> <outDir> [options]

Options:
  --limit <n>                 Maximum PDFs to process (default: ${DEFAULT_LIMIT})
  --per-pdf-timeout-ms <ms>   External process timeout per PDF (default: ${DEFAULT_TIMEOUT_MS})
  --tmp-root <dir>            Temp root for per-PDF symlink dirs (default: ${DEFAULT_TMP_ROOT})
  --cleanup-row-artifacts     Remove per-row batch directories after aggregating
  --help                      Show this help`;
}

function parsePositiveInt(value: string | undefined, name: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid ${name}: ${value ?? ''}`);
  return parsed;
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    process.exit(0);
  }
  const positional = argv.filter(arg => !arg.startsWith('-'));
  const inputDir = positional[0];
  const outDir = positional[1];
  if (!inputDir || !outDir) throw new Error(`Missing inputDir/outDir.\n${usage()}`);
  let limit = DEFAULT_LIMIT;
  let perPdfTimeoutMs = DEFAULT_TIMEOUT_MS;
  let tmpRoot = DEFAULT_TMP_ROOT;
  let keepRowArtifacts = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--limit') limit = parsePositiveInt(argv[++i], '--limit');
    else if (arg === '--per-pdf-timeout-ms') perPdfTimeoutMs = parsePositiveInt(argv[++i], '--per-pdf-timeout-ms');
    else if (arg === '--tmp-root') {
      const value = argv[++i];
      if (!value) throw new Error('Missing value for --tmp-root.');
      tmpRoot = value;
    } else if (arg === '--cleanup-row-artifacts') {
      keepRowArtifacts = false;
    }
  }
  return {
    inputDir: resolve(inputDir),
    outDir: resolve(outDir),
    limit,
    perPdfTimeoutMs,
    tmpRoot: resolve(tmpRoot),
    keepRowArtifacts,
  };
}

export function safeBase(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'pdf';
}

export async function listPdfs(inputDir: string, limit: number): Promise<string[]> {
  const entries = await readdir(inputDir, { withFileTypes: true });
  return entries
    .filter(entry => (entry.isFile() || entry.isSymbolicLink()) && entry.name.toLowerCase().endsWith('.pdf'))
    .map(entry => join(inputDir, entry.name))
    .sort((a, b) => basename(a).localeCompare(basename(b)))
    .slice(0, limit);
}

function trimLog(value: string): string {
  const max = 20_000;
  return value.length <= max ? value : value.slice(-max);
}

async function runChildBatch(inputDir: string, outDir: string, timeoutMs: number, tmpRoot: string): Promise<ChildRunResult> {
  const started = Date.now();
  const args = [
    ...process.execArgv,
    resolve('scripts/baseline-corpus-batch.ts'),
    inputDir,
    outDir,
    '--no-semantic',
    '--no-pdfs',
  ];
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      TMPDIR: tmpRoot,
      PDFAF_RUN_LOCAL_LLM: '0',
      PDFAF_REMEDIATE_DEFAULT_SEMANTIC: '0',
      PDFAF_REMEDIATE_DEFAULT_SEMANTIC_HEADINGS: '0',
      OPENAI_COMPAT_BASE_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', chunk => {
    stdout = trimLog(stdout + String(chunk));
  });
  child.stderr?.on('data', chunk => {
    stderr = trimLog(stderr + String(chunk));
  });

  let timedOut = false;
  let killTimer: NodeJS.Timeout | undefined;
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
      killTimer = setTimeout(() => {
        if (child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
        }
      }, 5_000);
    }
  }, timeoutMs);

  return await new Promise(resolvePromise => {
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolvePromise({
        timedOut,
        exitCode,
        signal,
        durationMs: Date.now() - started,
        stdout,
        stderr,
      });
    });
  });
}

function rowFromTimeout(input: {
  file: string;
  durationMs: number;
  error: string;
  child: ChildRunResult;
  rowArtifactDir: string;
}): BoundedHoldoutRow {
  return {
    file: input.file,
    pdfClassBefore: null,
    beforeScore: null,
    beforeGrade: null,
    categoriesBefore: [],
    afterDeterministicScore: null,
    afterDeterministicGrade: null,
    afterScore: null,
    afterGrade: '?',
    pdfClassAfter: null,
    delta: null,
    durationMs: input.durationMs,
    semanticRan: false,
    appliedTools: [],
    falsePositiveApplied: 0,
    error: input.error,
    boundedRunner: {
      timedOut: input.child.timedOut,
      exitCode: input.child.exitCode,
      signal: input.child.signal,
      rowArtifactDir: input.rowArtifactDir,
    },
  };
}

async function readRowArtifact(rowOutDir: string): Promise<BoundedHoldoutRow | null> {
  try {
    const report = JSON.parse(await readFile(join(rowOutDir, 'baseline_report.json'), 'utf8')) as { rows?: BoundedHoldoutRow[] };
    return report.rows?.[0] ?? null;
  } catch {
    return null;
  }
}

function completedRows(rows: BoundedHoldoutRow[]): BoundedHoldoutRow[] {
  return rows.filter(row => !row.error && typeof row.afterScore === 'number' && Number.isFinite(row.afterScore));
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function buildAggregateReport(input: {
  generatedAt?: string;
  inputDir: string;
  outDir: string;
  targetScore?: number;
  perPdfTimeoutMs: number;
  rows: BoundedHoldoutRow[];
}): BoundedHoldoutReport {
  const targetScore = input.targetScore ?? Number.parseInt(process.env['REMEDIATION_TARGET_SCORE'] ?? '95', 10);
  const completed = completedRows(input.rows);
  const belowTarget = completed.filter(row => typeof row.afterScore === 'number' && row.afterScore < targetScore);
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    inputDir: input.inputDir,
    outputDir: input.outDir,
    flags: {
      semantic: false,
      writePdfs: false,
      externalPerPdfTimeoutMs: input.perPdfTimeoutMs,
    },
    pipeline:
      'per-PDF external process timeout -> baseline-corpus-batch one-PDF deterministic run -> aggregate baseline_report; no LLM; no PDFs',
    summary: {
      count: input.rows.length,
      completed: completed.length,
      targetScore,
      belowTarget: belowTarget.length,
      meanBefore: mean(completed.map(row => row.beforeScore ?? 0)),
      meanAfter: mean(completed.map(row => row.afterScore ?? 0)),
      allRowMeanAfter: mean(input.rows.map(row => row.afterScore ?? 0)),
      falsePositiveApplied: input.rows.reduce((sum, row) => sum + (row.falsePositiveApplied ?? 0), 0),
      timeoutOrErrorCount: input.rows.filter(row => row.error).length,
    },
    rows: input.rows,
  };
}

async function writeAggregateReport(report: BoundedHoldoutReport): Promise<void> {
  await mkdir(report.outputDir, { recursive: true });
  await writeFile(join(report.outputDir, 'baseline_report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const lines = [
    '# Bounded Holdout Validation',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Input: \`${report.inputDir}\``,
    `- Count: ${report.summary.count}`,
    `- Completed: ${report.summary.completed}`,
    `- Mean after completed rows: ${report.summary.meanAfter.toFixed(4)}`,
    `- Mean after all rows: ${report.summary.allRowMeanAfter.toFixed(4)}`,
    `- False positives applied: ${report.summary.falsePositiveApplied}`,
    `- Timeout/error rows: ${report.summary.timeoutOrErrorCount}`,
    '',
    '| File | Before | After | Delta | ms | Error |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of report.rows) {
    lines.push([
      `\`${row.file}\``,
      `${row.beforeScore ?? 'n/a'}/${row.beforeGrade ?? '?'}`,
      `${row.afterScore ?? 'n/a'}/${row.afterGrade ?? '?'}`,
      row.delta ?? 'n/a',
      row.durationMs,
      row.error ?? '',
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  await writeFile(join(report.outputDir, 'summary.md'), `${lines.join('\n')}\n`, 'utf8');
}

async function validateOnePdf(pdfPath: string, args: ParsedArgs, index: number): Promise<BoundedHoldoutRow> {
  const file = basename(pdfPath);
  const rowId = `${String(index + 1).padStart(2, '0')}-${safeBase(file.replace(/\.pdf$/i, ''))}-${randomUUID().slice(0, 8)}`;
  const rowInputDir = join(args.tmpRoot, 'bounded-holdout-input', rowId);
  const rowOutDir = join(args.outDir, 'rows', rowId);
  await mkdir(rowInputDir, { recursive: true });
  await mkdir(rowOutDir, { recursive: true });
  await symlink(pdfPath, join(rowInputDir, file));

  const child = await runChildBatch(rowInputDir, rowOutDir, args.perPdfTimeoutMs, args.tmpRoot);
  await writeFile(join(rowOutDir, 'stdout.log'), child.stdout, 'utf8');
  await writeFile(join(rowOutDir, 'stderr.log'), child.stderr, 'utf8');

  const artifactRow = await readRowArtifact(rowOutDir);
  if (artifactRow && !child.timedOut && child.exitCode === 0) {
    artifactRow.boundedRunner = {
      timedOut: false,
      exitCode: child.exitCode,
      signal: child.signal,
      rowArtifactDir: rowOutDir,
    };
    return artifactRow;
  }

  const error = child.timedOut
    ? `external_per_pdf_timeout_${args.perPdfTimeoutMs}ms`
    : `child_exit_${child.exitCode ?? 'null'}_${child.signal ?? 'null'}`;
  const row = rowFromTimeout({
    file,
    durationMs: child.durationMs,
    error,
    child,
    rowArtifactDir: rowOutDir,
  });
  if (!args.keepRowArtifacts) await rm(rowOutDir, { recursive: true, force: true });
  return row;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.outDir, { recursive: true });
  await mkdir(args.tmpRoot, { recursive: true });
  const pdfs = await listPdfs(args.inputDir, args.limit);
  if (pdfs.length === 0) throw new Error(`No PDFs found in ${args.inputDir}`);

  const rows: BoundedHoldoutRow[] = [];
  for (let i = 0; i < pdfs.length; i++) {
    const pdfPath = pdfs[i]!;
    process.stdout.write(`[${i + 1}/${pdfs.length}] ${basename(pdfPath)} ... `);
    const row = await validateOnePdf(pdfPath, args, i);
    rows.push(row);
    const score = typeof row.afterScore === 'number' ? `${row.afterScore}/${row.afterGrade ?? '?'}` : 'timeout/error';
    console.log(row.error ? `${score} (${row.error})` : score);
    await writeAggregateReport(buildAggregateReport({
      inputDir: args.inputDir,
      outDir: args.outDir,
      perPdfTimeoutMs: args.perPdfTimeoutMs,
      rows,
    }));
  }

  const report = buildAggregateReport({
    inputDir: args.inputDir,
    outDir: args.outDir,
    perPdfTimeoutMs: args.perPdfTimeoutMs,
    rows,
  });
  await writeAggregateReport(report);
  console.log(`Wrote bounded holdout report to ${join(args.outDir, 'baseline_report.json')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
