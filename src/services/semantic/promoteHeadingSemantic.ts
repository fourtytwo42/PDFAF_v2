import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  REMEDIATION_CATEGORY_THRESHOLD,
  SEMANTIC_MAX_PROMOTE_CANDIDATES,
  SEMANTIC_MIN_PROMOTE_CONFIDENCE,
  SEMANTIC_PROMOTE_BATCH_SIZE,
  SEMANTIC_PROMOTE_LAYOUT_TEXT_MIN_LEN,
  SEMANTIC_PROMOTE_REQUEST_CONCURRENCY,
  SEMANTIC_REGRESSION_TOLERANCE,
} from '../../config.js';
import type {
  AnalysisResult,
  DocumentSnapshot,
  SemanticBatchSummary,
  SemanticRemediationSummary,
} from '../../types.js';
import { analyzePdf } from '../pdfAnalyzer.js';
import { runPythonMutationBatch, type PythonMutation } from '../../python/bridge.js';
import { analyzeLayout, type LayoutAnalysis } from '../layout/layoutAnalyzer.js';
import { detectDomain, DOMAIN_ALT_TEXT_GUIDANCE, type DocumentDomain } from './domainDetector.js';
import { chatCompletionToolCall } from './openAiCompatClient.js';
import { isLlmTimeoutOrAbortError } from './llmBatchGuard.js';
import type { SemanticRepairOutput } from './semanticService.js';

export interface SemanticPromoteHeadingRepairInput {
  buffer: Buffer;
  filename: string;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
  };
}

export interface PromoteCandidateRow {
  structRef: string;
  text: string;
  page: number;
  /** From Python structure attributes when available (page space). */
  bbox?: [number, number, number, number];
}

export function rectsOverlap(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): boolean {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

const PROPOSE_PROMOTE_TO_HEADING_TOOL = {
  type: 'function' as const,
  function: {
    name: 'propose_promote_to_heading',
    description:
      'Propose which tagged /P structure elements should become headings (H1–H6) based on their text role.',
    parameters: {
      type: 'object',
      properties: {
        proposals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              level: { type: 'integer', minimum: 1, maximum: 6 },
              confidence: { type: 'number' },
            },
            required: ['id', 'level', 'confidence'],
          },
        },
      },
      required: ['proposals'],
    },
  },
};

function textSample(snapshot: DocumentSnapshot): string {
  return snapshot.textByPage.slice(0, 3).join(' ').slice(0, 500);
}

function normalizeParagraphTag(tag: string): string {
  return tag.replace(/^\//, '').toUpperCase();
}

/** Phase 3c-a: paragraph-like roles Python emits (structure /S). Exported for untagged heading pass. */
export const PROMOTE_SOURCE_TAGS = new Set(['P', 'SPAN', 'DIV']);

function buildPromoteCandidates(snapshot: DocumentSnapshot): PromoteCandidateRow[] {
  const rows = snapshot.paragraphStructElems ?? [];
  const seen = new Set<string>();
  const out: PromoteCandidateRow[] = [];
  for (const r of rows) {
    if (!PROMOTE_SOURCE_TAGS.has(normalizeParagraphTag(r.tag))) continue;
    const ref = (r.structRef ?? '').trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    const row: PromoteCandidateRow = {
      structRef: ref,
      text: (r.text ?? '').trim().slice(0, 500),
      page: r.page,
    };
    if (Array.isArray(r.bbox) && r.bbox.length === 4) {
      row.bbox = r.bbox as [number, number, number, number];
    }
    out.push(row);
  }
  out.sort((a, b) => a.page - b.page || a.text.length - b.text.length);
  return out.slice(0, SEMANTIC_MAX_PROMOTE_CANDIDATES);
}

function normLayoutText(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Exclude promote candidates whose text matches repeated header/footer lines on the same page
 * (from layout analysis; no struct bbox required).
 */
export function filterPromoteCandidatesByLayout(
  candidates: PromoteCandidateRow[],
  layout: LayoutAnalysis,
): PromoteCandidateRow[] {
  const bands = layout.headerFooterBandTexts ?? [];
  let out = candidates;
  if (bands.length > 0) {
    out = candidates.filter(c => {
      const ct = normLayoutText(c.text);
      if (ct.length < SEMANTIC_PROMOTE_LAYOUT_TEXT_MIN_LEN) return true;
      for (const b of bands) {
        if (b.pageNumber !== c.page) continue;
        const bt = normLayoutText(b.text);
        if (bt.length < SEMANTIC_PROMOTE_LAYOUT_TEXT_MIN_LEN) continue;
        // Exact match only: substring matching removed too many real section titles (e.g. shared brand words).
        if (ct === bt) return false;
      }
      return true;
    });
  }
  const hfZones = layout.zones.filter(z => z.type === 'header' || z.type === 'footer');
  if (hfZones.length === 0) return out;
  return out.filter(c => {
    if (!c.bbox) return true;
    for (const z of hfZones) {
      if (z.pageNumber !== c.page) continue;
      if (rectsOverlap(c.bbox, z.bbox)) return false;
    }
    return true;
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

async function runBatchesWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length) as R[];
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]!, idx);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

interface LlmPromoteProposal {
  id: string;
  level: number;
  confidence: number;
}

async function proposePromoteBatch(
  batch: PromoteCandidateRow[],
  domain: DocumentDomain,
  ctx: { title: string; filename: string },
  options: { timeoutMs?: number; signal?: AbortSignal },
  batchIndex: number,
): Promise<{ proposals: LlmPromoteProposal[]; summary: SemanticBatchSummary }> {
  const systemPrompt = `You are promoting tagged PDF/UA structure elements (role /P, /Span, or /Div) to headings (H1–H6) when they function as titles or section headers.
Document: "${ctx.title || ctx.filename}"
Domain: ${domain}
Domain guidance (for tone): ${DOMAIN_ALT_TEXT_GUIDANCE[domain]}

Rules:
- Only propose promotion when the text clearly acts as a heading or section title (short phrase, title case or ALL CAPS section labels, chapter-style lines).
- Do not promote body paragraphs, legal boilerplate, or long narrative blocks.
- Assign level H1 for document title on page 1; H2 for major sections; H3–H6 for nested headings. Prefer not to skip levels.
- If uncertain, set confidence below 0.60 (caller will reject).
- id must match the structRef from the input JSON exactly.`;

  const userPayload = batch.map(p => ({
    id: p.structRef,
    text: p.text.slice(0, 200),
    pageNumber: p.page + 1,
  }));

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: JSON.stringify(userPayload) },
  ];

  try {
    const { endpoint, payload } = await chatCompletionToolCall({
      messages,
      tools: [PROPOSE_PROMOTE_TO_HEADING_TOOL],
      toolChoice: { type: 'function', function: { name: 'propose_promote_to_heading' } },
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });

    const raw = payload.arguments['proposals'];
    const proposals: LlmPromoteProposal[] = [];
    if (Array.isArray(raw)) {
      for (const row of raw) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const id = String(r['id'] ?? '');
        const level = Number(r['level']);
        const confidence = Number(r['confidence'] ?? 0);
        if (!id || level < 1 || level > 6) continue;
        proposals.push({ id, level, confidence });
      }
    }

    return {
      proposals,
      summary: {
        batchIndex,
        figureIds: [],
        headingStructRefs: batch.map(b => b.structRef),
        model: endpoint.model,
        endpoint: endpoint.label,
        proposalCount: proposals.length,
      },
    };
  } catch (e) {
    return {
      proposals: [],
      summary: {
        batchIndex,
        figureIds: [],
        headingStructRefs: batch.map(b => b.structRef),
        model: '',
        endpoint: 'primary',
        proposalCount: 0,
        error: (e as Error).message,
      },
    };
  }
}

/**
 * LLM text pass: promote /P tagged structure elements to /H1–/H6 (Phase 3c-a).
 */
export async function applySemanticPromoteHeadingRepairs(
  input: SemanticPromoteHeadingRepairInput,
): Promise<SemanticRepairOutput> {
  const started = Date.now();
  const { buffer, filename, analysis, snapshot, options } = input;
  const scoreBefore = analysis.score;

  const empty = (
    reason: SemanticRemediationSummary['skippedReason'],
    err?: string,
  ): SemanticRepairOutput => ({
    buffer,
    analysis,
    snapshot,
    summary: {
      skippedReason: reason,
      durationMs: Date.now() - started,
      proposalsAccepted: 0,
      proposalsRejected: 0,
      scoreBefore,
      scoreAfter: scoreBefore,
      batches: [],
      errorMessage: err,
    },
  });

  if (snapshot.pdfClass === 'scanned') {
    return empty('scanned_pdf');
  }

  const hs = analysis.categories.find(c => c.key === 'heading_structure');
  if (!hs?.applicable || hs.score >= REMEDIATION_CATEGORY_THRESHOLD) {
    return empty('heading_structure_sufficient');
  }

  const rawCandidates = buildPromoteCandidates(snapshot);
  if (rawCandidates.length === 0) {
    return empty('no_candidates');
  }

  let layout: LayoutAnalysis;
  try {
    layout = await analyzeLayout(buffer);
  } catch {
    layout = {
      isMultiColumn: false,
      columnCount: 1,
      zones: [],
      captionCandidates: [],
      medianFontSizePtByPage: {},
      headerFooterBandTexts: [],
    };
  }
  const candidates = filterPromoteCandidatesByLayout(rawCandidates, layout);
  if (candidates.length === 0) {
    return empty('no_candidates');
  }

  const title = snapshot.metadata.title ?? snapshot.structTitle ?? null;
  const domain = detectDomain(title, textSample(snapshot));

  const batches = chunk(candidates, SEMANTIC_PROMOTE_BATCH_SIZE);
  const batchResults = await runBatchesWithConcurrency(
    batches,
    SEMANTIC_PROMOTE_REQUEST_CONCURRENCY,
    (batch, i) =>
      proposePromoteBatch(
        batch,
        domain,
        { title: title ?? filename, filename },
        { timeoutMs: options?.timeoutMs, signal: options?.signal },
        i,
      ),
  );

  const batchSummaries: SemanticBatchSummary[] = batchResults.map(r => r.summary);
  if (batchSummaries.some(b => isLlmTimeoutOrAbortError(b.error))) {
    return {
      buffer,
      analysis,
      snapshot,
      summary: {
        skippedReason: 'llm_timeout',
        durationMs: Date.now() - started,
        proposalsAccepted: 0,
        proposalsRejected: 0,
        scoreBefore,
        scoreAfter: scoreBefore,
        batches: batchSummaries,
        errorMessage: batchSummaries.find(b => isLlmTimeoutOrAbortError(b.error))?.error,
      },
    };
  }

  const merged = new Map<string, LlmPromoteProposal>();
  for (const br of batchResults) {
    for (const p of br.proposals) {
      if (!candidates.some(c => c.structRef === p.id)) continue;
      merged.set(p.id, p);
    }
  }

  let rejected = 0;
  const mutations: PythonMutation[] = [];
  for (const p of merged.values()) {
    if (p.confidence < SEMANTIC_MIN_PROMOTE_CONFIDENCE) {
      rejected++;
      continue;
    }
    const row = candidates.find(c => c.structRef === p.id);
    if (!row) continue;
    mutations.push({
      op: 'retag_struct_as_heading',
      params: { structRef: row.structRef, level: p.level },
    });
  }

  if (mutations.length === 0) {
    return {
      buffer,
      analysis,
      snapshot,
      summary: {
        skippedReason: 'completed_no_changes',
        durationMs: Date.now() - started,
        proposalsAccepted: 0,
        proposalsRejected: rejected,
        scoreBefore,
        scoreAfter: scoreBefore,
        batches: batchSummaries,
      },
    };
  }

  const { buffer: mutated, result } = await runPythonMutationBatch(buffer, mutations, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  });

  if (!result.success) {
    return {
      buffer,
      analysis,
      snapshot,
      summary: {
        skippedReason: 'error',
        durationMs: Date.now() - started,
        proposalsAccepted: 0,
        proposalsRejected: rejected,
        scoreBefore,
        scoreAfter: scoreBefore,
        batches: batchSummaries,
        errorMessage: JSON.stringify(result.failed),
      },
    };
  }

  const tmpPath = join(tmpdir(), `pdfaf-sem-promote-${randomUUID()}.pdf`);
  await writeFile(tmpPath, mutated);
  let nextAnalysis: AnalysisResult;
  let nextSnapshot: DocumentSnapshot;
  try {
    const out = await analyzePdf(tmpPath, filename);
    nextAnalysis = out.result;
    nextSnapshot = out.snapshot;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }

  if (nextAnalysis.score < scoreBefore - SEMANTIC_REGRESSION_TOLERANCE) {
    return {
      buffer,
      analysis,
      snapshot,
      summary: {
        skippedReason: 'regression_reverted',
        durationMs: Date.now() - started,
        proposalsAccepted: 0,
        proposalsRejected: rejected + merged.size,
        scoreBefore,
        scoreAfter: scoreBefore,
        batches: batchSummaries,
        errorMessage: 'regression_reverted',
      },
    };
  }

  return {
    buffer: mutated,
    analysis: nextAnalysis,
    snapshot: nextSnapshot,
    summary: {
      skippedReason: 'completed',
      durationMs: Date.now() - started,
      proposalsAccepted: mutations.length,
      proposalsRejected: rejected,
      scoreBefore,
      scoreAfter: nextAnalysis.score,
      batches: batchSummaries,
    },
  };
}
