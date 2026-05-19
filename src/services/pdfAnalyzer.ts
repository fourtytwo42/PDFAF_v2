import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  CHECK_ANALYSIS_TIMEOUT_MS,
  MAX_CONCURRENT_ANALYSES,
  ANALYSIS_CACHE_TTL_MS,
  SCANNED_PAGE_RATIO_THRESHOLD,
  MIXED_PAGE_RATIO_THRESHOLD,
} from '../config.js';
import type { DocumentSnapshot, PdfClass, AnalysisResult, PdfjsResult, PythonAnalysisResult } from '../types.js';
import { extractWithPdfjs } from './pdfjsService.js';
import { extractStructure }  from './structureService.js';
import { score }             from './scorer/scorer.js';
import { deriveAnalysisClassification } from './classification/analysisClassification.js';
import { deriveDetectionProfile } from './detection/boundedDetection.js';
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

export function analysisCacheKey(fileHash: string, filename: string): string {
  return `${fileHash}\0${filename}`;
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
  /** Per-extractor timeout for check/analyze work. */
  timeoutMs?: number;
  /** Abort long-running extraction when remediation/request wall time expires. */
  signal?: AbortSignal;
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
  const timeoutMs = Math.max(1, options?.timeoutMs ?? CHECK_ANALYSIS_TIMEOUT_MS);

  try {
    options?.signal?.throwIfAborted();
    // Check cache by file content hash
    const fileHash = await hashFile(pdfPath);
    const cacheKey = analysisCacheKey(fileHash, filename);
    const cached = options?.bypassCache ? null : getCached(cacheKey);
    if (cached) {
      const cacheMs = Date.now() - startMs;
      return {
        result: {
          ...cached.result,
          analysisDurationMs: cacheMs,
          runtimeSummary: {
            ...(cached.result.runtimeSummary ?? {
              totalMs: cacheMs,
              cacheHit: true,
              pdfjsMs: 0,
              structureMs: 0,
              mergeMs: 0,
              structuralAuditMs: 0,
              scoringMs: 0,
              classificationMs: 0,
              finalizeEvidenceMs: 0,
              scorerCategoryMs: {},
            }),
            totalMs: cacheMs,
            cacheHit: true,
          },
        },
        snapshot: cached.snapshot,
      };
    }

    // Run pdfjs and pikepdf structural analysis in parallel
    let pdfjsMs = 0;
    let structureMs = 0;
    const [pdfjsResult, structResult] = await Promise.all([
      (async () => {
        const started = performance.now();
        try {
          return await extractWithPdfjs(pdfPath, { timeoutMs, signal: options?.signal });
        } catch (err) {
          console.error(`[analyzer] pdfjs failed for ${filename}: ${(err as Error).message}`);
          return emptyPdfjsResult();
        } finally {
          pdfjsMs = performance.now() - started;
        }
      })(),
      (async () => {
        const started = performance.now();
        try {
          return await extractStructure(pdfPath, { timeoutMs, signal: options?.signal });
        } catch (err) {
          console.error(`[analyzer] pikepdf failed for ${filename}: ${(err as Error).message}`);
          return emptyPythonResult();
        } finally {
          structureMs = performance.now() - started;
        }
      })(),
    ]);
    options?.signal?.throwIfAborted();

    const mergeStarted = performance.now();
    const snap = mergeSnapshot(pdfjsResult, structResult);
    const mergeMs = performance.now() - mergeStarted;
    snap.pdfClass = classifyPdf(snap);
    const auditStarted = performance.now();
    snap.detectionProfile = deriveDetectionProfile(snap);
    const structuralAuditMs = performance.now() - auditStarted;

    const now = new Date().toISOString();
    const scoredResult = score(snap, {
      id: randomUUID(),
      filename,
      timestamp: now,
      analysisDurationMs: Date.now() - startMs,
    });
    const classificationStarted = performance.now();
    const analysisResult: AnalysisResult = {
      ...scoredResult,
      ...deriveAnalysisClassification(snap, scoredResult),
      detectionProfile: snap.detectionProfile,
    };
    const classificationMs = performance.now() - classificationStarted;
    const totalMs = Date.now() - startMs;
    analysisResult.analysisDurationMs = totalMs;
    analysisResult.runtimeSummary = {
      ...(scoredResult.runtimeSummary ?? {
        totalMs,
        cacheHit: false,
        pdfjsMs: 0,
        structureMs: 0,
        mergeMs: 0,
        structuralAuditMs: 0,
        scoringMs: 0,
        classificationMs: 0,
        finalizeEvidenceMs: 0,
        scorerCategoryMs: {},
      }),
      totalMs,
      cacheHit: false,
      pdfjsMs,
      structureMs,
      mergeMs,
      structuralAuditMs,
      classificationMs,
    };

    setCached(cacheKey, analysisResult, snap);
    persistResult(analysisResult);

    return { result: analysisResult, snapshot: snap };

  } finally {
    releaseSemaphore();
  }
}

// ─── Snapshot merge ────────────────────────────────────────────────────────────

const _linkKey = (page: number, url: string) => `${page}\t${(url ?? '').trim().toLowerCase()}`;
const REPLACEMENT_CHARACTER = '\uFFFD';
const HIGH_REPLACEMENT_CHARACTER_PAGE_RATIO = 0.3;

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

export interface ReplacementCharacterAudit {
  replacementCharacterCount: number;
  replacementCharacterRatio: number;
  highReplacementCharacterPageCount: number;
}

export function replacementCharacterAuditFromTextByPage(textByPage: string[]): ReplacementCharacterAudit {
  let replacementCharacterCount = 0;
  let totalCharacterCount = 0;
  let highReplacementCharacterPageCount = 0;

  for (const pageText of textByPage) {
    const text = pageText ?? '';
    const pageCharacterCount = text.length;
    let pageReplacementCount = 0;
    for (const char of text) {
      if (char === REPLACEMENT_CHARACTER) pageReplacementCount += 1;
    }
    replacementCharacterCount += pageReplacementCount;
    totalCharacterCount += pageCharacterCount;
    if (
      pageCharacterCount > 0 &&
      pageReplacementCount / pageCharacterCount >= HIGH_REPLACEMENT_CHARACTER_PAGE_RATIO
    ) {
      highReplacementCharacterPageCount += 1;
    }
  }

  return {
    replacementCharacterCount,
    replacementCharacterRatio: totalCharacterCount > 0 ? replacementCharacterCount / totalCharacterCount : 0,
    highReplacementCharacterPageCount,
  };
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

export function mergeSnapshot(pdfjs: PdfjsResult, struct: PythonAnalysisResult): DocumentSnapshot {
  const imageToTextRatio = pdfjs.pageCount > 0
    ? pdfjs.imageOnlyPageCount / pdfjs.pageCount
    : 0;
  const replacementCharacterAudit = replacementCharacterAuditFromTextByPage(pdfjs.textByPage);
  const fontSyntaxAudit: NonNullable<DocumentSnapshot['fontSyntaxAudit']> = {
    fontsChecked: struct.fontSyntaxAudit?.fontsChecked ?? struct.fonts.length,
    missingToUnicodeCMapCount: struct.fontSyntaxAudit?.missingToUnicodeCMapCount ?? 0,
    invalidToUnicodeCMapCount: struct.fontSyntaxAudit?.invalidToUnicodeCMapCount ?? 0,
    emptyToUnicodeCMapCount: struct.fontSyntaxAudit?.emptyToUnicodeCMapCount ?? 0,
    cidToGidMapRiskCount: struct.fontSyntaxAudit?.cidToGidMapRiskCount ?? 0,
    trueTypeEncodingMismatchCount: struct.fontSyntaxAudit?.trueTypeEncodingMismatchCount ?? 0,
    wModeMismatchCount: struct.fontSyntaxAudit?.wModeMismatchCount ?? 0,
    externalCMapReferenceCount: struct.fontSyntaxAudit?.externalCMapReferenceCount ?? 0,
    type0DescendantFontRiskCount: struct.fontSyntaxAudit?.type0DescendantFontRiskCount ?? 0,
    ...replacementCharacterAudit,
  };

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
    layoutAudit:          pdfjs.layoutAudit,
    // pikepdf
    isTagged:      struct.isTagged,
    markInfo:      struct.markInfo,
    viewerPreferences: struct.viewerPreferences,
    lang:          struct.lang,
    pdfUaVersion:  struct.pdfUaVersion,
    structTitle:   struct.title,
    headings:      struct.headings,
    figures:       struct.figures,
    checkerFigureTargets: struct.checkerFigureTargets ?? [],
    tables:        struct.tables,
    fonts:         struct.fonts,
    bookmarks:     struct.bookmarks,
    formFields:    struct.formFields,
    structureTree: struct.structureTree,
    structureDebug: struct.structureDebug,
    paragraphStructElems: struct.paragraphStructElems ?? [],
    threeCcGoldenV1: Boolean(struct.threeCcGoldenV1),
    threeCcGoldenOrphanV1: Boolean(struct.threeCcGoldenOrphanV1),
    orphanMcids: struct.orphanMcids ?? [],
    mcidTextSpans: struct.mcidTextSpans ?? [],
    ocrTitleMcidCandidates: struct.ocrTitleMcidCandidates ?? [],
    nativeTitleBtCandidates: struct.nativeTitleBtCandidates ?? [],
    taggedContentAudit: struct.taggedContentAudit,
    parentTreeAudit: struct.parentTreeAudit,
    contentTaggingAudit: struct.contentTaggingAudit,
    tableHeaderAudit: struct.tableHeaderAudit,
    fontSyntaxAudit,
    languageAudit: struct.languageAudit,
    renderedContrastAudit: struct.renderedContrastAudit,
    structureSyntaxAudit: struct.structureSyntaxAudit,
    tocNoteAudit: struct.tocNoteAudit,
    optionalContentAudit: struct.optionalContentAudit,
    linkReachabilityAudit: struct.linkReachabilityAudit,
    aiVisualTagAudit: struct.aiVisualTagAudit,
    listStructureAudit: struct.listStructureAudit,
    acrobatStyleAltRisks: struct.acrobatStyleAltRisks,
    annotationAccessibility: normalizeAnnotationAccessibility(struct.annotationAccessibility),
    remediationProvenance: struct.remediationProvenance,
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
    layoutAudit: undefined,
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
    structureDebug: undefined,
    paragraphStructElems: [],
    threeCcGoldenV1: false,
    threeCcGoldenOrphanV1: false,
    orphanMcids: [],
    mcidTextSpans: [],
    taggedContentAudit: undefined,
    parentTreeAudit: undefined,
    contentTaggingAudit: undefined,
    tableHeaderAudit: undefined,
    fontSyntaxAudit: undefined,
    languageAudit: undefined,
    renderedContrastAudit: undefined,
    structureSyntaxAudit: undefined,
    tocNoteAudit: undefined,
    optionalContentAudit: undefined,
    linkReachabilityAudit: undefined,
    aiVisualTagAudit: undefined,
    acrobatStyleAltRisks: undefined,
    remediationProvenance: {
      engineAppliedOcr: false,
      engineTaggedOcrText: false,
      bookmarkStrategy: 'none',
    },
  };
}
