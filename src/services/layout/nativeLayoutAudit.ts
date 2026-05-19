import {
  SEMANTIC_LAYOUT_FOOTER_YNORM_MAX,
  SEMANTIC_LAYOUT_HEADER_YNORM_MIN,
  SEMANTIC_LAYOUT_REPEAT_MIN_PAGES,
  SEMANTIC_LAYOUT_REPEAT_MIN_TEXT_LEN,
  SEMANTIC_LAYOUT_Y_NORM_BUCKET,
} from '../../config.js';
import type { NativeLayoutAudit } from '../../types.js';

export interface NativeLayoutTextRun {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Run extends NativeLayoutTextRun {
  normText: string;
  bbox: [number, number, number, number];
  sequence: number;
}

interface HeaderFooterBand {
  pageNumber: number;
  kind: 'header' | 'footer';
  text: string;
  bbox: [number, number, number, number];
}

const CAPTION_RE = /^(figure|fig\.|chart|graph|table)\s*[\dA-ZIVX]+[\s:.\-]/i;
const MAX_SAMPLES = 32;

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function normalizeKey(text: string): string {
  return normalizeText(text).toLowerCase().slice(0, 100);
}

function yNormBucket(y: number, pageHeight: number): number {
  if (pageHeight <= 0) return 0;
  const yNorm = Math.min(1, Math.max(0, y / pageHeight));
  return Math.round(yNorm / SEMANTIC_LAYOUT_Y_NORM_BUCKET);
}

function rectsOverlap(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

function toRuns(textRuns: NativeLayoutTextRun[]): Run[] {
  const runs: Run[] = [];
  for (const [sequence, input] of textRuns.entries()) {
    const text = normalizeText(input.text);
    if (!text) continue;
    const width = Math.max(0, input.width);
    const height = Math.max(0, input.height || 12);
    runs.push({
      ...input,
      text,
      width,
      height,
      normText: normalizeKey(text),
      bbox: [input.x, input.y, input.x + width, input.y + height],
      sequence,
    });
  }
  return runs;
}

function groupLineRuns(runs: Run[]): Run[] {
  const byPage = new Map<number, Run[]>();
  for (const run of runs) {
    const list = byPage.get(run.pageNumber);
    if (list) list.push(run);
    else byPage.set(run.pageNumber, [run]);
  }

  const lines: Run[] = [];
  for (const pageRuns of byPage.values()) {
    const byLine = new Map<number, Run[]>();
    for (const run of pageRuns) {
      const key = Math.round(run.y / 4);
      const list = byLine.get(key);
      if (list) list.push(run);
      else byLine.set(key, [run]);
    }
    for (const row of byLine.values()) {
      const sorted = [...row].sort((a, b) => a.x - b.x || a.sequence - b.sequence);
      const segments: Run[][] = [];
      for (const run of sorted) {
        const current = segments[segments.length - 1];
        const previous = current?.[current.length - 1];
        if (!current || (previous && run.bbox[0] - previous.bbox[2] > 80)) {
          segments.push([run]);
        } else {
          current.push(run);
        }
      }
      for (const segment of segments) {
        const first = segment[0]!;
        const text = normalizeText(segment.map(run => run.text).join(' '));
        const bbox: [number, number, number, number] = [
          Math.min(...segment.map(run => run.bbox[0])),
          Math.min(...segment.map(run => run.bbox[1])),
          Math.max(...segment.map(run => run.bbox[2])),
          Math.max(...segment.map(run => run.bbox[3])),
        ];
        lines.push({
          pageNumber: first.pageNumber,
          pageWidth: first.pageWidth,
          pageHeight: first.pageHeight,
          text,
          x: bbox[0],
          y: bbox[1],
          width: Math.max(0, bbox[2] - bbox[0]),
          height: Math.max(...segment.map(run => run.height)),
          normText: normalizeKey(text),
          bbox,
          sequence: Math.min(...segment.map(run => run.sequence)),
        });
      }
    }
  }
  return lines.sort((a, b) => a.sequence - b.sequence);
}

function detectHeaderFooterBands(runs: Run[]): HeaderFooterBand[] {
  const byKey = new Map<string, Run[]>();
  for (const run of runs) {
    if (run.normText.length < SEMANTIC_LAYOUT_REPEAT_MIN_TEXT_LEN) continue;
    const key = `${run.normText}@@${yNormBucket(run.y, run.pageHeight)}`;
    const list = byKey.get(key);
    if (list) list.push(run);
    else byKey.set(key, [run]);
  }

  const bands: HeaderFooterBand[] = [];
  for (const group of byKey.values()) {
    const pages = new Set(group.map(run => run.pageNumber));
    if (pages.size < SEMANTIC_LAYOUT_REPEAT_MIN_PAGES) continue;

    const meanYNorm =
      group.reduce((sum, run) => sum + (run.pageHeight > 0 ? run.y / run.pageHeight : 0), 0) / group.length;
    const kind = meanYNorm >= SEMANTIC_LAYOUT_HEADER_YNORM_MIN
      ? 'header'
      : meanYNorm <= SEMANTIC_LAYOUT_FOOTER_YNORM_MAX
        ? 'footer'
        : null;
    if (!kind) continue;

    const byPage = new Map<number, Run[]>();
    for (const run of group) {
      const list = byPage.get(run.pageNumber);
      if (list) list.push(run);
      else byPage.set(run.pageNumber, [run]);
    }
    for (const [pageNumber, pageRuns] of byPage) {
      const first = pageRuns[0]!;
      const bbox: [number, number, number, number] = [
        Math.min(...pageRuns.map(run => run.bbox[0])),
        Math.min(...pageRuns.map(run => run.bbox[1])),
        Math.max(...pageRuns.map(run => run.bbox[2])),
        Math.max(...pageRuns.map(run => run.bbox[3])),
      ];
      bands.push({ pageNumber, kind, text: first.text.slice(0, 160), bbox });
    }
  }
  return bands;
}

function overlapsHeaderFooter(run: Run, bands: HeaderFooterBand[]): boolean {
  return bands.some(band =>
    band.pageNumber === run.pageNumber &&
    (band.text.toLowerCase() === run.text.toLowerCase() || rectsOverlap(run.bbox, band.bbox)),
  );
}

function pageMedianHeight(runs: Run[]): Map<number, number> {
  const byPage = new Map<number, number[]>();
  for (const run of runs) {
    const list = byPage.get(run.pageNumber);
    if (list) list.push(run.height);
    else byPage.set(run.pageNumber, [run.height]);
  }
  const medians = new Map<number, number>();
  for (const [page, heights] of byPage.entries()) {
    const sorted = [...heights].sort((a, b) => a - b);
    medians.set(page, sorted[Math.floor(sorted.length / 2)] ?? 12);
  }
  return medians;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isTitleCaseLike(text: string): boolean {
  const words = text.split(/\s+/).filter(word => /[A-Za-z]/.test(word));
  if (words.length === 0 || words.length > 14) return false;
  const titleish = words.filter(word => /^[A-Z][A-Za-z0-9'’/-]*$/.test(word)).length;
  return titleish >= Math.ceil(words.length * 0.6);
}

function isAllCapsLike(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4) return false;
  return letters.replace(/[^A-Z]/g, '').length / letters.length >= 0.85;
}

function looksLikeTableLine(text: string): boolean {
  return /\t|\s{4,}|\|/.test(text);
}

function layoutHeadingCandidates(
  runs: Run[],
  bands: HeaderFooterBand[],
): { count: number; samples: NativeLayoutAudit['layoutHeadingCandidates'] } {
  const medians = pageMedianHeight(runs);
  const samples: NativeLayoutAudit['layoutHeadingCandidates'] = [];
  let count = 0;
  for (const run of runs) {
    const words = wordCount(run.text);
    if (run.text.length < 4 || run.text.length > 140 || words === 0 || words > 14) continue;
    if (overlapsHeaderFooter(run, bands) || CAPTION_RE.test(run.text) || looksLikeTableLine(run.text)) continue;
    if (words > 6 && /[.!?]$/.test(run.text)) continue;

    const median = medians.get(run.pageNumber) ?? 12;
    const nearTop = run.pageHeight > 0 && run.y / run.pageHeight >= 0.55;
    const prominentFont = run.height >= median * 1.25;
    const titleLike = isTitleCaseLike(run.text) || isAllCapsLike(run.text);
    if (!prominentFont && !(nearTop && titleLike)) continue;
    count += 1;
    if (samples.length < MAX_SAMPLES) {
      samples.push({ text: run.text.slice(0, 160), page: run.pageNumber, bbox: run.bbox });
    }
  }
  return { count, samples };
}

function captionCandidates(
  runs: Run[],
  bands: HeaderFooterBand[],
): { count: number; samples: NativeLayoutAudit['captionCandidates'] } {
  let count = 0;
  const samples: NativeLayoutAudit['captionCandidates'] = [];
  for (const run of runs) {
    if (!CAPTION_RE.test(run.text) || overlapsHeaderFooter(run, bands)) continue;
    count += 1;
    if (samples.length < MAX_SAMPLES) {
      samples.push({ text: run.text.slice(0, 200), page: run.pageNumber, bbox: run.bbox });
    }
  }
  return { count, samples };
}

function pageColumnRisk(runs: Run[], bands: HeaderFooterBand[]): { multiColumnPageCount: number; geometryOrderRiskPages: number } {
  const byPage = new Map<number, Run[]>();
  for (const run of runs) {
    if (overlapsHeaderFooter(run, bands)) continue;
    const list = byPage.get(run.pageNumber);
    if (list) list.push(run);
    else byPage.set(run.pageNumber, [run]);
  }

  let multiColumnPageCount = 0;
  let geometryOrderRiskPages = 0;
  for (const pageRuns of byPage.values()) {
    if (pageRuns.length < 6) continue;
    const centers = pageRuns
      .map(run => run.x + run.width / 2)
      .sort((a, b) => a - b);
    const span = (centers[centers.length - 1] ?? 0) - (centers[0] ?? 0);
    if (span < 120) continue;
    let split = 0;
    let maxGap = 0;
    for (let i = 1; i < centers.length; i++) {
      const gap = centers[i]! - centers[i - 1]!;
      if (gap > maxGap) {
        maxGap = gap;
        split = (centers[i]! + centers[i - 1]!) / 2;
      }
    }
    if (maxGap / span < 0.28) continue;
    const left = pageRuns.filter(run => run.x + run.width / 2 <= split).length;
    const right = pageRuns.length - left;
    if (left < 3 || right < 3) continue;
    multiColumnPageCount += 1;

    const sequence = [...pageRuns].sort((a, b) => a.sequence - b.sequence);
    const sides = sequence.map(run => (run.x + run.width / 2 <= split ? 'L' : 'R'));
    let transitions = 0;
    for (let i = 1; i < sides.length; i++) {
      if (sides[i] !== sides[i - 1]) transitions += 1;
    }
    if (transitions >= 2) geometryOrderRiskPages += 1;
  }
  return { multiColumnPageCount, geometryOrderRiskPages };
}

function clusterColumnCount(centers: number[]): number {
  const sorted = [...centers].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  let count = 1;
  let last = sorted[0]!;
  for (const center of sorted.slice(1)) {
    if (Math.abs(center - last) >= 28) {
      count += 1;
      last = center;
    } else {
      last = (last + center) / 2;
    }
  }
  return count;
}

function tableCandidates(
  runs: Run[],
  bands: HeaderFooterBand[],
  captions: NativeLayoutAudit['captionCandidates'],
): {
  count: number;
  denseCount: number;
  undersegmentedCount: number;
  samples: NativeLayoutAudit['tableCandidates'];
} {
  const captionBboxes = captions.map(caption => ({ page: caption.page, bbox: caption.bbox }));
  const usable = runs.filter(run =>
    !overlapsHeaderFooter(run, bands) &&
    !captionBboxes.some(caption => caption.page === run.pageNumber && rectsOverlap(caption.bbox, run.bbox)),
  );
  const byPage = new Map<number, Run[]>();
  for (const run of usable) {
    const list = byPage.get(run.pageNumber);
    if (list) list.push(run);
    else byPage.set(run.pageNumber, [run]);
  }

  const samples: NativeLayoutAudit['tableCandidates'] = [];
  let count = 0;
  let denseCount = 0;
  let undersegmentedCount = 0;
  for (const [page, pageRuns] of byPage.entries()) {
    const rows = new Map<number, Run[]>();
    for (const run of pageRuns) {
      const key = Math.round(run.y / 6);
      const list = rows.get(key);
      if (list) list.push(run);
      else rows.set(key, [run]);
    }
    const denseRows = [...rows.values()].filter(row => row.length >= 3);
    if (denseRows.length < 2) continue;
    const centers = denseRows.flatMap(row => row.map(run => run.x + run.width / 2));
    const columns = clusterColumnCount(centers);
    const dense = denseRows.length >= 3 && columns >= 3;
    const undersegmented = denseRows.length >= 2 && columns >= 4;
    if (!dense && !undersegmented) continue;
    count += 1;
    if (dense) denseCount += 1;
    if (undersegmented) undersegmentedCount += 1;
    const all = denseRows.flat();
    if (samples.length < MAX_SAMPLES) {
      samples.push({
        page,
        bbox: [
          Math.min(...all.map(run => run.bbox[0])),
          Math.min(...all.map(run => run.bbox[1])),
          Math.max(...all.map(run => run.bbox[2])),
          Math.max(...all.map(run => run.bbox[3])),
        ],
        rowCount: denseRows.length,
        columnCount: columns,
        dense,
        undersegmented,
      });
    }
  }
  return { count, denseCount, undersegmentedCount, samples };
}

export function buildNativeLayoutAudit(textRuns: NativeLayoutTextRun[]): NativeLayoutAudit {
  const runs = toRuns(textRuns);
  const lineRuns = groupLineRuns(runs);
  const sampledPages = new Set(runs.map(run => run.pageNumber));
  const bands = detectHeaderFooterBands(lineRuns);
  const captions = captionCandidates(lineRuns, bands);
  const headings = layoutHeadingCandidates(lineRuns, bands);
  const tables = tableCandidates(runs, bands, captions.samples);
  const orderRisk = pageColumnRisk(lineRuns, bands);
  const headerFooterPages = new Set(bands.map(band => band.pageNumber));

  return {
    sampledPageCount: sampledPages.size,
    textRunCount: runs.length,
    repeatedHeaderFooterBandCount: new Set(bands.map(band => `${band.kind}:${band.text.toLowerCase()}`)).size,
    repeatedHeaderFooterPageCount: headerFooterPages.size,
    headerFooterBandTexts: bands
      .slice(0, MAX_SAMPLES)
      .map(band => ({ page: band.pageNumber, kind: band.kind, text: band.text })),
    multiColumnPageCount: orderRisk.multiColumnPageCount,
    geometryOrderRiskPages: orderRisk.geometryOrderRiskPages,
    layoutHeadingCandidateCount: headings.count,
    layoutHeadingCandidates: headings.samples,
    captionCandidateCount: captions.count,
    captionCandidates: captions.samples,
    layoutTableCandidateCount: tables.count,
    denseRowBandTableCandidateCount: tables.denseCount,
    undersegmentedTableCandidateCount: tables.undersegmentedCount,
    tableCandidates: tables.samples,
  };
}
