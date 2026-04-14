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
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(hash: string): AnalysisResult | null {
  const entry = cache.get(hash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(hash);
    return null;
  }
  return entry.result;
}

function setCached(hash: string, result: AnalysisResult): void {
  cache.set(hash, { result, expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS });
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

export async function analyzePdf(pdfPath: string, filename: string): Promise<AnalysisResult> {
  if (!acquireSemaphore()) {
    throw Object.assign(new Error('Too many concurrent analyses'), { statusCode: 429 });
  }

  const startMs = Date.now();

  try {
    // Check cache by file content hash
    const fileHash = await hashFile(pdfPath);
    const cached = getCached(fileHash);
    if (cached) {
      return { ...cached, analysisDurationMs: Date.now() - startMs };
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

    setCached(fileHash, analysisResult);
    persistResult(analysisResult);

    return analysisResult;

  } finally {
    releaseSemaphore();
  }
}

// ─── Snapshot merge ────────────────────────────────────────────────────────────

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
  };

  return {
    // pdfjs
    pageCount:            pdfjs.pageCount,
    textByPage:           pdfjs.textByPage,
    textCharCount:        pdfjs.textCharCount,
    imageOnlyPageCount:   pdfjs.imageOnlyPageCount,
    metadata,
    links:                pdfjs.links,
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
  };
}
