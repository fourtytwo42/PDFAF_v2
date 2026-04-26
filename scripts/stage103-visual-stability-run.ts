#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { comparePdfFiles } from '../src/services/benchmark/visualStability.js';
import type { ExperimentCorpusManifestEntry, ManifestSnapshot } from '../src/services/benchmark/experimentCorpus.js';

interface ParsedArgs {
  runDir: string;
  outDir: string;
  strict: boolean;
}

interface VisualRunRow {
  id: string;
  file: string;
  cohort: ExperimentCorpusManifestEntry['cohort'];
  beforePath: string;
  afterPath: string;
  pageCount: number | null;
  status: 'stable' | 'drift' | 'missing' | 'error';
  stable: boolean;
  reason: string | null;
  worstPage: number | null;
  differentPixelCount: number | null;
  totalPixelCount: number | null;
  differentPixelRatio: number | null;
  meanAbsoluteChannelDelta: number | null;
  maxChannelDelta: number | null;
}

interface VisualRunReport {
  generatedAt: string;
  runDir: string;
  manifestPath: string;
  corpusRoot: string;
  writePdfs: boolean;
  strict: boolean;
  selectedCount: number;
  comparedCount: number;
  stableCount: number;
  driftCount: number;
  missingCount: number;
  worstRowId: string | null;
  rows: VisualRunRow[];
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

function renderMarkdown(report: VisualRunReport): string {
  const lines = [
    '# Stage 103 Visual Stability Run Validation',
    '',
    `Generated: \`${report.generatedAt}\``,
    `Run dir: \`${report.runDir}\``,
    `Manifest: \`${report.manifestPath}\``,
    `Decision: \`${report.driftCount === 0 && report.missingCount === 0 ? 'visual_stable' : 'visual_drift_detected'}\``,
    `Strict: ${report.strict ? 'yes' : 'no'}`,
    `Rows compared: ${report.comparedCount}/${report.selectedCount}`,
    `Stable rows: ${report.stableCount}`,
    `Drift rows: ${report.driftCount}`,
    `Missing rows: ${report.missingCount}`,
    `Worst row: ${report.worstRowId ?? 'n/a'}`,
    '',
    '## Rows',
    '',
    '| ID | Cohort | Status | Reason | Pages | Worst page | Diff pixels | Diff ratio | Mean abs delta | Max delta |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const row of report.rows) {
    lines.push(
      `| ${row.id} | ${row.cohort} | ${row.status} | ${row.reason ?? 'none'} | ${row.pageCount ?? 'n/a'} | ${row.worstPage ?? 'n/a'} | ${row.differentPixelCount ?? 'n/a'} / ${row.totalPixelCount ?? 'n/a'} | ${row.differentPixelRatio != null ? row.differentPixelRatio.toFixed(6) : 'n/a'} | ${row.meanAbsoluteChannelDelta != null ? row.meanAbsoluteChannelDelta.toFixed(6) : 'n/a'} | ${row.maxChannelDelta ?? 'n/a'} |`,
    );
  }

  return `${lines.join('\n')}\n`;
}

async function loadSnapshot(runDir: string): Promise<ManifestSnapshot> {
  const snapshotPath = join(resolve(runDir), 'manifest.snapshot.json');
  return JSON.parse(await readFile(snapshotPath, 'utf8')) as ManifestSnapshot;
}

function summarizeComparison(
  entry: ExperimentCorpusManifestEntry,
  beforePath: string,
  afterPath: string,
  comparison: Awaited<ReturnType<typeof comparePdfFiles>>,
): VisualRunRow {
  const worstPage = comparison.worstPage?.pageNumber1Based ?? null;
  const diff = comparison.worstPage?.diff ?? null;
  const reason = comparison.pages.find(page => page.reason)?.reason ?? null;
  const status: VisualRunRow['status'] = reason === 'missing_page_or_render_failure'
    ? 'missing'
    : comparison.stable
      ? 'stable'
      : 'drift';
  return {
    id: entry.id,
    file: entry.file,
    cohort: entry.cohort,
    beforePath,
    afterPath,
    pageCount: comparison.pages.length,
    status,
    stable: comparison.stable,
    reason,
    worstPage,
    differentPixelCount: diff?.differentPixelCount ?? null,
    totalPixelCount: diff?.totalPixelCount ?? null,
    differentPixelRatio: diff?.differentPixelRatio ?? null,
    meanAbsoluteChannelDelta: diff?.meanAbsoluteChannelDelta ?? null,
    maxChannelDelta: diff?.maxChannelDelta ?? null,
  };
}

async function compareRunRow(
  runDir: string,
  corpusRoot: string,
  entry: ExperimentCorpusManifestEntry,
): Promise<VisualRunRow> {
  const beforePath = resolve(corpusRoot, entry.file);
  const afterPath = resolve(runDir, 'pdfs', `${entry.id}.pdf`);
  try {
    const comparison = await comparePdfFiles({
      beforePath,
      afterPath,
      allPages: true,
    });
    return summarizeComparison(entry, beforePath, afterPath, comparison);
  } catch (error) {
    return {
      id: entry.id,
      file: entry.file,
      cohort: entry.cohort,
      beforePath,
      afterPath,
      pageCount: null,
      status: 'error',
      stable: false,
      reason: error instanceof Error ? error.message : String(error),
      worstPage: null,
      differentPixelCount: null,
      totalPixelCount: null,
      differentPixelRatio: null,
      meanAbsoluteChannelDelta: null,
      maxChannelDelta: null,
    };
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runDir = resolve(args.runDir);
  const snapshot = await loadSnapshot(runDir);
  const rows: VisualRunRow[] = [];
  for (const entry of snapshot.selectedEntries) {
    rows.push(await compareRunRow(runDir, snapshot.corpusRoot, entry));
  }

  const comparedCount = rows.filter(row => row.status !== 'error').length;
  const stableCount = rows.filter(row => row.status === 'stable').length;
  const driftCount = rows.filter(row => row.status === 'drift').length;
  const missingCount = rows.filter(row => row.status === 'missing').length;
  const worstRow = rows
    .map(row => ({
      row,
      rank: row.status === 'missing'
        ? 2 + (row.differentPixelRatio ?? 0)
        : row.status === 'drift'
          ? 1 + (row.differentPixelRatio ?? 0)
          : 0,
    }))
    .sort((a, b) => b.rank - a.rank)[0]?.row ?? null;

  const report: VisualRunReport = {
    generatedAt: new Date().toISOString(),
    runDir,
    manifestPath: snapshot.manifestPath,
    corpusRoot: snapshot.corpusRoot,
    writePdfs: snapshot.writePdfs,
    strict: args.strict,
    selectedCount: snapshot.selectedEntries.length,
    comparedCount,
    stableCount,
    driftCount,
    missingCount,
    worstRowId: worstRow?.id ?? null,
    rows,
  };

  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage103-visual-stability-run.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'stage103-visual-stability-run.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${outDir}`);

  if (args.strict && (driftCount > 0 || missingCount > 0)) {
    process.exit(2);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
