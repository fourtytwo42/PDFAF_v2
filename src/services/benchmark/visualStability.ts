import { readFile } from 'node:fs/promises';
import { getPdfPageCount, renderPageToCanvas } from '../semantic/pdfPageRender.js';

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
