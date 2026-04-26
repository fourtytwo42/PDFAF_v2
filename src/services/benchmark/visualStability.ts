import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getPdfPageCount, renderPageToCanvas } from '../semantic/pdfPageRender.js';
import type { ExperimentCorpusManifestEntry, ManifestSnapshot } from './experimentCorpus.js';

export interface VisualPageImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface VisualPageDiff {
  pageNumber1Based: number;
  dimensionMismatch: boolean;
  differentPixelCount: number;
  totalPixelCount: number;
  differentPixelRatio: number;
  meanAbsoluteChannelDelta: number;
  maxChannelDelta: number;
}

export interface VisualPageComparison {
  pageNumber1Based: number;
  before: { width: number; height: number } | null;
  after: { width: number; height: number } | null;
  diff: VisualPageDiff | null;
  stable: boolean;
  reason: string | null;
}

export interface VisualComparisonReport {
  beforePath: string;
  afterPath: string;
  pages: VisualPageComparison[];
  stable: boolean;
  worstPage: VisualPageComparison | null;
}

export interface VisualRunRow {
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

export interface VisualRunReport {
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

export interface VisualComparisonInput {
  beforePath: string;
  afterPath: string;
  pageNumbers?: number[];
  allPages?: boolean;
}

function normalizePageNumbers(pageNumbers: number[]): number[] {
  return [...new Set(pageNumbers.map(pageNumber => Math.max(1, Math.trunc(pageNumber))).filter(pageNumber => pageNumber > 0))]
    .sort((a, b) => a - b);
}

export async function resolveComparisonPageNumbers(input: VisualComparisonInput): Promise<number[]> {
  if (input.allPages) {
    const [beforeCount, afterCount] = await Promise.all([
      getPdfPageCount(await readFile(input.beforePath)),
      getPdfPageCount(await readFile(input.afterPath)),
    ]);
    if (!beforeCount || !afterCount) {
      throw new Error('Unable to determine page count for all-pages comparison.');
    }
    const maxPages = Math.max(beforeCount, afterCount);
    return Array.from({ length: maxPages }, (_, index) => index + 1);
  }

  const pageNumbers = normalizePageNumbers(input.pageNumbers ?? [1]);
  return pageNumbers.length > 0 ? pageNumbers : [1];
}

export function compareRenderedPages(
  before: VisualPageImage,
  after: VisualPageImage,
  pageNumber1Based = 1,
): VisualPageDiff {
  const beforePixels = before.width * before.height;
  const afterPixels = after.width * after.height;
  if (before.width !== after.width || before.height !== after.height) {
    return {
      pageNumber1Based,
      dimensionMismatch: true,
      differentPixelCount: Math.max(beforePixels, afterPixels),
      totalPixelCount: Math.max(beforePixels, afterPixels),
      differentPixelRatio: 1,
      meanAbsoluteChannelDelta: 255,
      maxChannelDelta: 255,
    };
  }

  let differentPixelCount = 0;
  let totalAbsoluteChannelDelta = 0;
  let maxChannelDelta = 0;
  for (let i = 0; i < before.data.length; i += 4) {
    let pixelDifferent = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(before.data[i + channel]! - after.data[i + channel]!);
      totalAbsoluteChannelDelta += delta;
      if (delta > maxChannelDelta) maxChannelDelta = delta;
      if (delta > 0) pixelDifferent = true;
    }
    if (pixelDifferent) differentPixelCount += 1;
  }

  const totalPixelCount = beforePixels;
  return {
    pageNumber1Based,
    dimensionMismatch: false,
    differentPixelCount,
    totalPixelCount,
    differentPixelRatio: totalPixelCount === 0 ? 0 : differentPixelCount / totalPixelCount,
    meanAbsoluteChannelDelta: totalPixelCount === 0 ? 0 : totalAbsoluteChannelDelta / (totalPixelCount * 4),
    maxChannelDelta,
  };
}

async function renderPage(buffer: Buffer, pageNumber1Based: number): Promise<VisualPageImage | null> {
  const rendered = await renderPageToCanvas(buffer, pageNumber1Based);
  if (!rendered) return null;
  const ctx = rendered.canvas.getContext('2d');
  return {
    width: rendered.width,
    height: rendered.height,
    data: ctx.getImageData(0, 0, rendered.width, rendered.height).data,
  };
}

async function loadSnapshot(runDir: string): Promise<ManifestSnapshot> {
  const snapshotPath = join(resolve(runDir), 'manifest.snapshot.json');
  return JSON.parse(await readFile(snapshotPath, 'utf8')) as ManifestSnapshot;
}

function summarizeRunRow(
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
    return summarizeRunRow(entry, beforePath, afterPath, comparison);
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

export async function compareVisualStabilityRun(input: {
  runDir: string;
  strict?: boolean;
}): Promise<VisualRunReport> {
  const snapshot = await loadSnapshot(input.runDir);
  const rows: VisualRunRow[] = [];
  for (const entry of snapshot.selectedEntries) {
    rows.push(await compareRunRow(input.runDir, snapshot.corpusRoot, entry));
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

  return {
    generatedAt: new Date().toISOString(),
    runDir: resolve(input.runDir),
    manifestPath: snapshot.manifestPath,
    corpusRoot: snapshot.corpusRoot,
    writePdfs: snapshot.writePdfs,
    strict: input.strict ?? false,
    selectedCount: snapshot.selectedEntries.length,
    comparedCount,
    stableCount,
    driftCount,
    missingCount,
    worstRowId: worstRow?.id ?? null,
    rows,
  };
}

export function renderVisualStabilityRunMarkdown(report: VisualRunReport): string {
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

export async function writeVisualStabilityRunReport(report: VisualRunReport, outDir: string): Promise<void> {
  const resolvedOutDir = resolve(outDir);
  await mkdir(resolvedOutDir, { recursive: true });
  await writeFile(join(resolvedOutDir, 'stage103-visual-stability-run.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(resolvedOutDir, 'stage103-visual-stability-run.md'), renderVisualStabilityRunMarkdown(report), 'utf8');
}

export async function comparePdfPages(input: {
  beforePath: string;
  afterPath: string;
  pageNumbers: number[];
}): Promise<VisualComparisonReport> {
  const [beforeBuffer, afterBuffer] = await Promise.all([
    readFile(input.beforePath),
    readFile(input.afterPath),
  ]);
  const pages: VisualPageComparison[] = [];
  for (const pageNumber1Based of input.pageNumbers) {
    const [before, after] = await Promise.all([
      renderPage(beforeBuffer, pageNumber1Based),
      renderPage(afterBuffer, pageNumber1Based),
    ]);
    if (!before || !after) {
      pages.push({
        pageNumber1Based,
        before: before ? { width: before.width, height: before.height } : null,
        after: after ? { width: after.width, height: after.height } : null,
        diff: null,
        stable: false,
        reason: before && after ? null : 'missing_page_or_render_failure',
      });
      continue;
    }

    const diff = compareRenderedPages(before, after, pageNumber1Based);
    pages.push({
      pageNumber1Based,
      before: { width: before.width, height: before.height },
      after: { width: after.width, height: after.height },
      diff,
      stable: !diff.dimensionMismatch && diff.differentPixelRatio === 0 && diff.maxChannelDelta === 0,
      reason: diff.dimensionMismatch ? 'dimension_mismatch' : null,
    });
  }

  const worstPage = pages
    .map(page => {
      if (!page.diff) return { page, rank: Number.POSITIVE_INFINITY };
      return { page, rank: page.diff.differentPixelRatio + (page.diff.dimensionMismatch ? 1 : 0) };
    })
    .sort((a, b) => b.rank - a.rank)[0]?.page ?? null;

  return {
    beforePath: input.beforePath,
    afterPath: input.afterPath,
    pages,
    stable: pages.every(page => page.stable),
    worstPage,
  };
}

export async function comparePdfFiles(input: VisualComparisonInput): Promise<VisualComparisonReport> {
  return comparePdfPages({
    beforePath: input.beforePath,
    afterPath: input.afterPath,
    pageNumbers: await resolveComparisonPageNumbers(input),
  });
}
