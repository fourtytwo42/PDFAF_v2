#!/usr/bin/env tsx
/**
 * Summarize progressive remediation report artifacts produced by `progressive-remediation-cycle.ts`.
 * Usage:
 *   tsx scripts/summarize-progressive-cycles.ts [workRoot] [options]
 *   tsx scripts/summarize-progressive-cycles.ts --root <path> --output <path> [--failures-only] [--json]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';

type Row = {
  status?: string;
};

type ProtectedRow = {
  file: string;
  status: string;
  beforeScore: number;
  afterScore: number;
  beforeGrade?: string;
  afterGrade?: string;
  delta?: number;
};

type CycleReport = {
  batch?: number;
  publicFiles?: string[];
  targetScore?: number;
  beforeMean?: number;
  afterMean?: number;
  startedAt?: string;
  completedAt?: string;
  passed?: boolean;
  files?: Row[];
  protectedBeforeMean?: number;
  protectedAfterMean?: number;
  protectedAnalyzedCount?: number;
  protectedFailedCount?: number;
  protectedWorstCategoryRegression?: number;
  protectedWorstOverallRegression?: number;
  protectedRows?: ProtectedRow[];
};

type ParsedReport = {
  path: string;
  batchLabel: string;
  passed: boolean;
  beforeMean: number | null;
  afterMean: number | null;
  targetScore: number | null;
  publicFiles: number;
  failedFiles: number;
  startedAt?: string;
  completedAt?: string;
  deltaMean: number | null;
  protectedBeforeMean: number | null;
  protectedAfterMean: number | null;
  protectedAnalyzedCount: number | null;
  protectedFailedCount: number | null;
  protectedWorstCategoryRegression: number | null;
  protectedWorstOverallRegression: number | null;
  protectedRows: number;
};

function usage(): string {
  return `
Usage:
  tsx scripts/summarize-progressive-cycles.ts [workRoot] [options]

Options:
  --root <path>            Root directory to scan for report.json files (default: ./tmp).
  --output <path>          Write report to a markdown or JSON file.
  --failures-only          Show only failing batches.
  --json                   Emit machine-readable JSON payload only.
  --help                   Show usage text.
`;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function escapePipes(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? 'n/a' : value.toFixed(digits);
}

function formatInt(value: number | null): string {
  return value === null ? 'n/a' : Math.round(value).toString();
}

async function collectReportFiles(workRoot: string): Promise<string[]> {
  const reportFiles: string[] = [];
  const entries = await readdir(workRoot, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(workRoot, entry.name);
    if (entry.isDirectory()) {
      const child = await collectReportFiles(full);
      reportFiles.push(...child);
      continue;
    }
    if (entry.isFile() && entry.name === 'report.json') {
      reportFiles.push(full);
    }
  }
  return reportFiles;
}

async function parseReport(path: string): Promise<ParsedReport> {
  const text = await readFile(path, 'utf8');
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`Malformed report JSON: ${path}`);
  }

  const report = raw as CycleReport;
  const files = Array.isArray(report.files) ? report.files : [];
  const failedRows = files.filter((row: Row) => row.status && row.status !== 'ok');
  const beforeMean = toNumber(report.beforeMean);
  const afterMean = toNumber(report.afterMean);
  const batchDir = basename(dirname(path));
  const inferredBatch = /^batch-(\d+)$/i.exec(batchDir);

  return {
    path,
    batchLabel: report.batch !== undefined
      ? `batch-${String(report.batch).padStart(3, '0')}`
      : inferredBatch
        ? `batch-${inferredBatch[1].padStart(3, '0')}`
        : batchDir,
    passed: Boolean(report.passed),
    beforeMean,
    afterMean,
    targetScore: toNumber(report.targetScore),
    publicFiles: Array.isArray(report.publicFiles) ? report.publicFiles.length : files.length,
    failedFiles: failedRows.length,
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    deltaMean: beforeMean !== null && afterMean !== null ? afterMean - beforeMean : null,
    protectedBeforeMean: toNumber(report.protectedBeforeMean),
    protectedAfterMean: toNumber(report.protectedAfterMean),
    protectedAnalyzedCount: Number.isInteger(report.protectedAnalyzedCount) ? report.protectedAnalyzedCount : null,
    protectedFailedCount: Number.isInteger(report.protectedFailedCount) ? report.protectedFailedCount : null,
    protectedWorstCategoryRegression: toNumber(report.protectedWorstCategoryRegression),
    protectedWorstOverallRegression: toNumber(report.protectedWorstOverallRegression),
    protectedRows: Array.isArray(report.protectedRows) ? report.protectedRows.length : 0,
  };
}

async function buildSummary(root: string, onlyFailures: boolean): Promise<ParsedReport[]> {
  const reportPaths = await collectReportFiles(root);
  const parsed: ParsedReport[] = [];

  for (const reportPath of reportPaths) {
    try {
      const row = await parseReport(reportPath);
      if (onlyFailures && row.passed) {
        continue;
      }
      parsed.push(row);
    } catch (error) {
      console.warn(`Skipping ${reportPath}: ${(error as Error).message}`);
    }
  }

  return parsed.sort((a, b) => {
    if (a.completedAt && b.completedAt) {
      return a.completedAt.localeCompare(b.completedAt);
    }
    if (a.completedAt) return -1;
    if (b.completedAt) return 1;
    return a.path.localeCompare(b.path);
  });
}

function buildMarkdownSummary(root: string, rows: ParsedReport[]): string {
  const lines: string[] = [];
  const passCount = rows.filter(r => r.passed).length;
  const failCount = rows.length - passCount;
  lines.push('# Progressive cycle summary');
  lines.push('');
  lines.push(`- **Root:** \`${root}\``);
  lines.push(`- **Rows:** ${rows.length}`);
  lines.push(`- **Pass:** ${passCount}`);
  lines.push(`- **Fail:** ${failCount}`);
  lines.push(`- **Generated:** ${new Date().toISOString()}`);
  lines.push('');
  lines.push(
    '| Batch | Started | Public mean | Public delta | Target | Public fail ratio | Protected mean (delta) | Protected worst category | Protected worst overall | Protected files | Files | Status |',
  );
  lines.push(
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  );

  for (const row of rows) {
    const status = row.passed ? 'PASS' : 'FAIL';
    const protectedFail =
      row.protectedAnalyzedCount !== null && row.protectedFailedCount !== null
        ? `${row.protectedFailedCount}/${row.protectedAnalyzedCount + row.protectedFailedCount}`
        : 'n/a';
    const publicFailRatio = row.publicFiles > 0 ? `${row.failedFiles}/${row.publicFiles}` : '0/0';
    const started = row.startedAt ?? 'n/a';
    const protectDelta =
      row.protectedBeforeMean !== null && row.protectedAfterMean !== null
        ? `${formatNumber(row.protectedAfterMean)} (${(row.protectedAfterMean - row.protectedBeforeMean).toFixed(2)})`
        : 'n/a';
    lines.push(
      `| ${escapePipes(row.batchLabel)} | ${escapePipes(started)} | ${formatNumber(row.beforeMean)} -> ${formatNumber(
        row.afterMean,
      )} | ${formatNumber(row.deltaMean)} | ${formatNumber(row.targetScore)} | ${publicFailRatio} | ${protectDelta} | ${formatNumber(
        row.protectedWorstCategoryRegression,
      )} | ${formatNumber(row.protectedWorstOverallRegression)} | ${formatInt(row.protectedRows)} | ${formatInt(row.publicFiles)} | ${status} (${protectedFail}) |`,
    );
  }

  lines.push('');
  lines.push('## Failure-only view');
  lines.push('');
  const failing = rows.filter(row => !row.passed);
  if (!failing.length) {
    lines.push('- None');
    return lines.join('\n');
  }

  for (const row of failing) {
    lines.push(`- ${escapePipes(relative(root, row.path))}`);
    if (row.afterMean === null) {
      lines.push('  - Public means unavailable in this report file.');
      continue;
    }
    if (row.targetScore !== null && row.afterMean < row.targetScore) {
      lines.push(`  - Public score below target by ${(row.targetScore - row.afterMean).toFixed(2)} points.`);
    }
    if (row.protectedAfterMean !== null && row.protectedAnalyzedCount !== null && row.protectedFailedCount !== null) {
      const protectedTotal = row.protectedAnalyzedCount + row.protectedFailedCount;
      lines.push(
        `  - Protected analysis: ${row.protectedFailedCount}/${protectedTotal} failed, mean ${formatNumber(
          row.protectedAfterMean,
        )}.`,
      );
    }
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opts = {
    root: join(process.cwd(), 'tmp'),
    output: undefined as string | undefined,
    onlyFailures: false,
    json: false,
  };

  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--failures-only') {
      opts.onlyFailures = true;
      continue;
    }
    if (arg === '--json') {
      opts.json = true;
      continue;
    }
    if (arg === '--root') {
      if (i + 1 >= args.length) {
        throw new Error('Missing value for --root');
      }
      opts.root = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--output') {
      if (i + 1 >= args.length) {
        throw new Error('Missing value for --output');
      }
      opts.output = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    positional.push(arg);
  }

  if (positional[0]) {
    opts.root = positional[0];
  }

  const workRoot = resolve(opts.root);
  const statResult = await stat(workRoot).catch(() => null);
  if (!statResult || !statResult.isDirectory()) {
    throw new Error(`Root is not a directory: ${workRoot}`);
  }

  const rows = await buildSummary(workRoot, opts.onlyFailures);
  if (rows.length === 0) {
    throw new Error(`No report files found under: ${workRoot}`);
  }

  if (opts.json) {
    const payload = { generatedAt: new Date().toISOString(), root: workRoot, count: rows.length, rows };
    const out = JSON.stringify(payload, null, 2);
    if (opts.output) {
      await mkdir(dirname(opts.output), { recursive: true });
      await writeFile(opts.output, out, 'utf8');
      console.log('Wrote JSON summary:', opts.output);
      return;
    }
    console.log(out);
    return;
  }

  const md = buildMarkdownSummary(workRoot, rows);
  if (opts.output) {
    await mkdir(dirname(opts.output), { recursive: true });
    await writeFile(opts.output, md, 'utf8');
    console.log('Wrote summary:', opts.output);
    return;
  }
  console.log(md);
}

main().catch(error => {
  console.error((error as Error).message);
  process.exit(1);
});
