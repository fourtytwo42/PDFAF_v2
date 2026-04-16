import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  SEMANTIC_LAYOUT_BAND_PAD_PT,
  SEMANTIC_LAYOUT_FOOTER_YNORM_MAX,
  SEMANTIC_LAYOUT_HEADER_YNORM_MIN,
  SEMANTIC_LAYOUT_MAX_PAGES,
  SEMANTIC_LAYOUT_REPEAT_MIN_PAGES,
  SEMANTIC_LAYOUT_REPEAT_MIN_TEXT_LEN,
  SEMANTIC_LAYOUT_Y_NORM_BUCKET,
} from '../../config.js';

const require = createRequire(import.meta.url);

export interface LayoutZone {
  type: 'header' | 'footer' | 'sidebar' | 'main' | 'caption' | 'unknown';
  pageNumber: number;
  bbox: [number, number, number, number];
}

export interface LayoutAnalysis {
  isMultiColumn: boolean;
  columnCount: number;
  zones: LayoutZone[];
  captionCandidates: Array<{ text: string; pageNumber: number; bbox: [number, number, number, number] }>;
  /** Median text run height (pt) per sampled page index (0-based). */
  medianFontSizePtByPage: Record<number, number>;
  /** Repeated-line header/footer text per page (for TS filters without struct bbox). */
  headerFooterBandTexts: Array<{ pageNumber: number; kind: 'header' | 'footer'; text: string }>;
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface PageRun {
  pageIdx: number;
  pageW: number;
  pageH: number;
  normText: string;
  /** Baseline y (pdf user space). */
  y: number;
  h: number;
  bbox: [number, number, number, number];
}

function samplePageIndices(pageCount: number, maxPages: number): number[] {
  const n = Math.min(pageCount, maxPages);
  if (n >= pageCount) return Array.from({ length: pageCount }, (_, i) => i);
  const indices = new Set<number>([0, pageCount - 1]);
  const step = pageCount > 1 ? (pageCount - 1) / (n - 1) : 0;
  for (let i = 1; i < n - 1; i++) indices.add(Math.round(i * step));
  return Array.from(indices).sort((a, b) => a - b);
}

function normalizeRepeatKey(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 100);
}

const CAPTION_RE = /^(figure|fig\.|chart|graph|table)\s*\d+/i;

function yNormBucket(y: number, pageH: number): number {
  if (pageH <= 0) return 0;
  const yn = Math.min(1, Math.max(0, y / pageH));
  return Math.round(yn / SEMANTIC_LAYOUT_Y_NORM_BUCKET);
}

function clusterKey(normText: string, bucket: number): string {
  return `${normText}@@${bucket}`;
}

function detectHeaderFooterZones(
  runs: PageRun[],
): { zones: LayoutZone[]; bandTexts: LayoutAnalysis['headerFooterBandTexts'] } {
  const byKey = new Map<string, PageRun[]>();
  for (const r of runs) {
    if (r.normText.length < SEMANTIC_LAYOUT_REPEAT_MIN_TEXT_LEN) continue;
    const b = yNormBucket(r.y, r.pageH);
    const k = clusterKey(r.normText, b);
    const arr = byKey.get(k);
    if (arr) arr.push(r);
    else byKey.set(k, [r]);
  }

  const zones: LayoutZone[] = [];
  const bandTexts: LayoutAnalysis['headerFooterBandTexts'] = [];
  for (const group of byKey.values()) {
    const pages = new Set(group.map(g => g.pageIdx));
    if (pages.size < SEMANTIC_LAYOUT_REPEAT_MIN_PAGES) continue;

    const yNorms = group.map(g => (g.pageH > 0 ? g.y / g.pageH : 0));
    const meanYn = yNorms.reduce((a, b) => a + b, 0) / yNorms.length;
    let band: 'header' | 'footer' | null = null;
    if (meanYn >= SEMANTIC_LAYOUT_HEADER_YNORM_MIN) band = 'header';
    else if (meanYn <= SEMANTIC_LAYOUT_FOOTER_YNORM_MAX) band = 'footer';
    if (!band) continue;

    const byPage = new Map<number, PageRun[]>();
    for (const r of group) {
      const list = byPage.get(r.pageIdx);
      if (list) list.push(r);
      else byPage.set(r.pageIdx, [r]);
    }

    const labelText = group[0]?.normText ?? '';

    for (const [pageIdx, prs] of byPage) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let pageW = 0;
      let pageH = 0;
      for (const p of prs) {
        x0 = Math.min(x0, p.bbox[0]);
        y0 = Math.min(y0, p.bbox[1]);
        x1 = Math.max(x1, p.bbox[2]);
        y1 = Math.max(y1, p.bbox[3]);
        pageW = p.pageW;
        pageH = p.pageH;
      }
      const pad = SEMANTIC_LAYOUT_BAND_PAD_PT;
      zones.push({
        type: band,
        pageNumber: pageIdx,
        bbox: [
          Math.max(0, x0 - pad),
          Math.max(0, y0 - pad),
          Math.min(pageW || x1 + pad, x1 + pad),
          Math.min(pageH || y1 + pad, y1 + pad),
        ],
      });
      bandTexts.push({ pageNumber: pageIdx, kind: band, text: labelText });
    }
  }

  return { zones, bandTexts };
}

/**
 * Heuristic layout from pdfjs text positions (no vision model).
 * Detects multi-column layout, caption-shaped lines, repeated header/footer bands, and per-page median font height.
 */
export async function analyzeLayout(buffer: Buffer, maxPages = SEMANTIC_LAYOUT_MAX_PAGES): Promise<LayoutAnalysis> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  // Copy bytes: pdf.js may detach the underlying ArrayBuffer; do not alias Buffer.pool.
  const data = Uint8Array.from(buffer);
  const loadingTask = pdfjs.getDocument({ data, disableFontFace: true, verbosity: 0 });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const indices = samplePageIndices(pageCount, maxPages);

  const zones: LayoutZone[] = [];
  const captionCandidates: LayoutAnalysis['captionCandidates'] = [];
  const xSamples: number[] = [];
  const runs: PageRun[] = [];
  const medianFontSizePtByPage: Record<number, number> = {};
  let headerFooterBandTexts: LayoutAnalysis['headerFooterBandTexts'] = [];

  try {
    for (const pageIdx of indices) {
      const page = await pdf.getPage(pageIdx + 1);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items as TextItem[];
      const heights: number[] = [];

      for (const item of items) {
        const t = item.transform;
        if (!t || t.length < 6) continue;
        const x = t[4] ?? 0;
        const y = t[5] ?? 0;
        const w = item.width ?? 0;
        const h = item.height ?? 12;
        heights.push(h > 0 ? h : 12);
        xSamples.push(x + w / 2);

        const str = ('str' in item ? String((item as { str?: string }).str) : '').trim();
        if (str && CAPTION_RE.test(str)) {
          captionCandidates.push({
            text: str.slice(0, 200),
            pageNumber: pageIdx,
            bbox: [x, y, x + w, y + h],
          });
        }

        const normText = normalizeRepeatKey(str);
        if (normText.length >= SEMANTIC_LAYOUT_REPEAT_MIN_TEXT_LEN) {
          runs.push({
            pageIdx,
            pageW: viewport.width,
            pageH: viewport.height,
            normText,
            y,
            h,
            bbox: [x, y, x + w, y + h],
          });
        }
      }

      if (heights.length > 0) {
        const sorted = [...heights].sort((a, b) => a - b);
        medianFontSizePtByPage[pageIdx] = sorted[Math.floor(sorted.length / 2)]!;
      }

      zones.push({
        type: 'unknown',
        pageNumber: pageIdx,
        bbox: [0, 0, viewport.width, viewport.height],
      });

      page.cleanup();
    }
  } finally {
    await pdf.destroy().catch(() => {});
  }

  const hf = detectHeaderFooterZones(runs);
  zones.push(...hf.zones);
  headerFooterBandTexts = hf.bandTexts;

  let columnCount = 1;
  let isMultiColumn = false;
  if (xSamples.length >= 8) {
    const sorted = [...xSamples].sort((a, b) => a - b);
    let maxGap = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i]! - sorted[i - 1]!;
      if (gap > maxGap) maxGap = gap;
    }
    const span = sorted[sorted.length - 1]! - sorted[0]!;
    if (span > 40 && maxGap / span > 0.35) {
      columnCount = 2;
      isMultiColumn = true;
    }
  }

  return {
    isMultiColumn,
    columnCount,
    zones,
    captionCandidates,
    medianFontSizePtByPage,
    headerFooterBandTexts,
  };
}
