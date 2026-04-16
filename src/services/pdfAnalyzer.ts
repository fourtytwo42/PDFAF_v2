import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  MAX_CONCURRENT_ANALYSES,
  ANALYSIS_CACHE_TTL_MS,
  SCANNED_PAGE_RATIO_THRESHOLD,
  MIXED_PAGE_RATIO_THRESHOLD,
} from '../config.js';
import type { DocumentSnapshot, PdfClass, AnalysisResult, PdfjsResult, PythonAnalysisResult } from '../types.js';
import { extractWithPdfjs } from './pdfjsService.js';
import { extractStructure }  from './structureService.js';
import { score }             from './scorer/scorer.js';
import { getDb }             from '../db/client.js';

// ─── Concurrency semaphore ────────────────────────────────────────────────────

let activeCount = 0;

function acquireSemaphore(): boolean {
  if (activeCount >= MAX_CONCURRENT_ANALYSES) return false;
  activeCount++;
  return true;
}

function releaseSemaphore(): void {
  activeCount = Math.max(0, activeCount - 1);
}

// ─── Result cache (in-memory, keyed by PDF SHA-256 hash) ─────────────────────

interface CacheEntry {
  result: AnalysisResult;
  snapshot: DocumentSnapshot;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(hash: string): CacheEntry | null {
  const entry = cache.get(hash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(hash);
    return null;
  }
  return entry;
}

function setCached(hash: string, result: AnalysisResult, snapshot: DocumentSnapshot): void {
  cache.set(hash, { result, snapshot, expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS });
}

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk as Buffer));
    stream.on('end',  () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export interface AnalyzePdfOutcome {
  result: AnalysisResult;
  snapshot: DocumentSnapshot;
}

export interface AnalyzePdfOptions {
  /** When true, always run pdfjs + Python (benchmarks / regression timing). */
  bypassCache?: boolean;
}

export async function analyzePdf(
  pdfPath: string,
  filename: string,
  options?: AnalyzePdfOptions,
): Promise<AnalyzePdfOutcome> {
  if (!acquireSemaphore()) {
    throw Object.assign(new Error('Too many concurrent analyses'), { statusCode: 429 });
  }

  const startMs = Date.now();

  try {
    // Check cache by file content hash
    const fileHash = await hashFile(pdfPath);
    const cached = options?.bypassCache ? null : getCached(fileHash);
    if (cached) {
      return {
        result: { ...cached.result, analysisDurationMs: Date.now() - startMs },
        snapshot: cached.snapshot,
      };
    }

    // Run pdfjs and pikepdf structural analysis in parallel
    const [pdfjsResult, structResult] = await Promise.all([
      extractWithPdfjs(pdfPath).catch(err => {
        console.error(`[analyzer] pdfjs failed for ${filename}: ${err.message}`);
        return emptyPdfjsResult();
      }),
      extractStructure(pdfPath).catch(err => {
        console.error(`[analyzer] pikepdf failed for ${filename}: ${err.message}`);
        return emptyPythonResult();
      }),
    ]);

    const snap = mergeSnapshot(pdfjsResult, structResult);
    snap.pdfClass = classifyPdf(snap);

    const now = new Date().toISOString();
    const analysisResult = score(snap, {
      id: randomUUID(),
      filename,
      timestamp: now,
      analysisDurationMs: Date.now() - startMs,
    });

    setCached(fileHash, analysisResult, snap);
    persistResult(analysisResult);

    return { result: analysisResult, snapshot: snap };

  } finally {
    releaseSemaphore();
  }
}

// ─── Snapshot merge ────────────────────────────────────────────────────────────

const _linkKey = (page: number, url: string) => `${page}\t${(url ?? '').trim().toLowerCase()}`;

/**
 * Merge pdfjs link samples with pikepdf’s full-document /Link scan so link_quality
 * reflects on-disk /Contents and URI-derived labels, not only sampled pdfjs pages.
 */
export function buildSnapshotLinks(
  pdfjsLinks: DocumentSnapshot['links'],
  linkScoringRows?: Array<{ page: number; url: string; effectiveText: string }>,
): DocumentSnapshot['links'] {
  if (!linkScoringRows?.length) return pdfjsLinks;
  const pyByKey = new Map<string, number>();
  for (const r of linkScoringRows) {
    const k = _linkKey(r.page, r.url ?? '');
    pyByKey.set(k, (pyByKey.get(k) ?? 0) + 1);
  }
  const out: DocumentSnapshot['links'] = linkScoringRows.map(r => ({
    page: r.page,
    url: (r.url ?? '').trim(),
    text: ((r.effectiveText ?? '').trim() || 'Link').slice(0, 500),
  }));
  const pdfByKey = new Map<string, DocumentSnapshot['links'][number][]>();
  for (const L of pdfjsLinks) {
    const k = _linkKey(L.page, L.url ?? '');
    const arr = pdfByKey.get(k);
    if (arr) arr.push(L);
    else pdfByKey.set(k, [L]);
  }
  for (const pList of pdfByKey.values()) {
    if (pList.length === 0) continue;
    const k = _linkKey(pList[0]!.page, pList[0]!.url ?? '');
    const pyCnt = pyByKey.get(k) ?? 0;
    for (let i = pyCnt; i < pList.length; i++) {
      out.push({ ...pList[i]! });
    }
  }
  return out;
}

function normalizeAnnotationAccessibility(
  a: PythonAnalysisResult['annotationAccessibility'],
): NonNullable<DocumentSnapshot['annotationAccessibility']> {
  return {
    pagesMissingTabsS: a?.pagesMissingTabsS ?? 0,
    pagesAnnotationOrderDiffers: a?.pagesAnnotationOrderDiffers ?? 0,
    linkAnnotationsMissingStructure: a?.linkAnnotationsMissingStructure ?? 0,
    nonLinkAnnotationsMissingStructure: a?.nonLinkAnnotationsMissingStructure ?? 0,
    nonLinkAnnotationsMissingContents: a?.nonLinkAnnotationsMissingContents ?? 0,
    linkAnnotationsMissingStructParent: a?.linkAnnotationsMissingStructParent ?? 0,
    nonLinkAnnotationsMissingStructParent: a?.nonLinkAnnotationsMissingStructParent ?? 0,
  };
}

function mergeSnapshot(pdfjs: PdfjsResult, struct: PythonAnalysisResult): DocumentSnapshot {
  const imageToTextRatio = pdfjs.pageCount > 0
    ? pdfjs.imageOnlyPageCount / pdfjs.pageCount
    : 0;

  // Merge metadata: pikepdf Info dict takes precedence over pdfjs for title/author
  const metadata: DocumentSnapshot['metadata'] = {
    title:    struct.title   || pdfjs.metadata.title,
    language: struct.lang    || pdfjs.metadata.language,
    author:   struct.author  || pdfjs.metadata.author,
    subject:  struct.subject || pdfjs.metadata.subject,
    producer: pdfjs.metadata.producer,
    creator:  pdfjs.metadata.creator,
  };

  return {
    // pdfjs
    pageCount:            pdfjs.pageCount,
    textByPage:           pdfjs.textByPage,
    textCharCount:        pdfjs.textCharCount,
    imageOnlyPageCount:   pdfjs.imageOnlyPageCount,
    metadata,
    links:                buildSnapshotLinks(pdfjs.links, struct.linkScoringRows),
    formFieldsFromPdfjs:  pdfjs.formFields,
    // pikepdf
    isTagged:      struct.isTagged,
    markInfo:      struct.markInfo,
    lang:          struct.lang,
    pdfUaVersion:  struct.pdfUaVersion,
    structTitle:   struct.title,
    headings:      struct.headings,
    figures:       struct.figures,
    tables:        struct.tables,
    fonts:         struct.fonts,
    bookmarks:     struct.bookmarks,
    formFields:    struct.formFields,
    structureTree: struct.structureTree,
    paragraphStructElems: struct.paragraphStructElems ?? [],
    threeCcGoldenV1: Boolean(struct.threeCcGoldenV1),
    threeCcGoldenOrphanV1: Boolean(struct.threeCcGoldenOrphanV1),
    orphanMcids: struct.orphanMcids ?? [],
    mcidTextSpans: struct.mcidTextSpans ?? [],
    taggedContentAudit: struct.taggedContentAudit,
    listStructureAudit: struct.listStructureAudit,
    acrobatStyleAltRisks: struct.acrobatStyleAltRisks,
    annotationAccessibility: normalizeAnnotationAccessibility(struct.annotationAccessibility),
    // computed
    pdfClass:         'native_untagged', // overwritten below
    imageToTextRatio,
  };
}

// ─── PDF classification ────────────────────────────────────────────────────────

function classifyPdf(snap: DocumentSnapshot): PdfClass {
  const ratio = snap.imageToTextRatio;
  if (!snap.isTagged && ratio >= SCANNED_PAGE_RATIO_THRESHOLD) return 'scanned';
  if (!snap.isTagged && ratio >= MIXED_PAGE_RATIO_THRESHOLD)   return 'mixed';
  if (!snap.isTagged) return 'native_untagged';
  return 'native_tagged';
}

// ─── Persistence ───────────────────────────────────────────────────────────────

function persistResult(result: AnalysisResult): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO queue_items (id, filename, pdf_class, score, grade, page_count, analysis_result, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.id,
      result.filename,
      result.pdfClass,
      result.score,
      result.grade,
      result.pageCount,
      JSON.stringify(result),
      result.analysisDurationMs,
    );
  } catch (err) {
    // DB failure is non-fatal — analysis result still returned to caller
    console.error(`[analyzer] failed to persist result: ${(err as Error).message}`);
  }
}

// ─── Empty fallback results ────────────────────────────────────────────────────

function emptyPdfjsResult(): PdfjsResult {
  return {
    pageCount: 0,
    textByPage: [],
    textCharCount: 0,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFields: [],
  };
}

function emptyPythonResult(): PythonAnalysisResult {
  return {
    isTagged: false,
    markInfo: null,
    lang: null,
    pdfUaVersion: null,
    headings: [],
    figures: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: null,
    paragraphStructElems: [],
    threeCcGoldenV1: false,
    threeCcGoldenOrphanV1: false,
    orphanMcids: [],
    mcidTextSpans: [],
    taggedContentAudit: undefined,
    acrobatStyleAltRisks: undefined,
  };
}
