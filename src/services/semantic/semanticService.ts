import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PYTHON_MUTATION_TIMEOUT_MS,
  REMEDIATION_CATEGORY_THRESHOLD,
  SEMANTIC_FIGURE_BATCH_SIZE,
  SEMANTIC_FIGURE_PROMPT_MAX_BAND_LINES_PER_PAGE,
  SEMANTIC_FIGURE_PROMPT_MAX_CAPTIONS_PER_PAGE,
  SEMANTIC_MAX_FIGURE_CANDIDATES,
  SEMANTIC_MIN_FIGURE_CONFIDENCE,
  SEMANTIC_REGRESSION_TOLERANCE,
  SEMANTIC_REQUEST_CONCURRENCY,
} from '../../config.js';
import type {
  AnalysisResult,
  DocumentSnapshot,
  SemanticBatchSummary,
  SemanticRemediationSummary,
} from '../../types.js';
import { analyzePdf } from '../pdfAnalyzer.js';
import { analyzeLayout, type LayoutAnalysis } from '../layout/layoutAnalyzer.js';
import { rectsOverlap } from './promoteHeadingSemantic.js';
import { runPythonMutationBatch, type PythonMutation } from '../../python/bridge.js';
import { detectDomain, DOMAIN_ALT_TEXT_GUIDANCE, type DocumentDomain } from './domainDetector.js';
import { chatCompletionToolCall } from './openAiCompatClient.js';
import { isLlmTimeoutOrAbortError } from './llmBatchGuard.js';
import { renderPageToJpegDataUrl } from './pdfPageRender.js';

export interface SemanticRepairInput {
  buffer: Buffer;
  filename: string;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
  };
}

export interface SemanticRepairOutput {
  buffer: Buffer;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  summary: SemanticRemediationSummary;
}

interface FigureCandidate {
  id: string;
  structRef: string;
  page: number;
  hasAlt: boolean;
  altText?: string;
  bbox?: [number, number, number, number];
}

const PROPOSE_ALT_TEXT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'propose_alt_text',
    description: 'Propose WCAG 2.1 AA alt text for PDF figure elements.',
    parameters: {
      type: 'object',
      properties: {
        proposals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              altText: { type: 'string' },
              confidence: { type: 'number' },
              isDecorative: { type: 'boolean' },
            },
            required: ['id', 'altText', 'confidence', 'isDecorative'],
          },
        },
      },
      required: ['proposals'],
    },
  },
};

function isGenericAlt(altText: string | undefined): boolean {
  if (!altText?.trim()) return false;
  const t = altText.trim().toLowerCase();
  return t === 'image' || t === 'figure' || t === 'img' || t === 'untitled' || t === 'graphic';
}

function textSample(snapshot: DocumentSnapshot): string {
  const parts = snapshot.textByPage.slice(0, 3).join(' ');
  return parts.slice(0, 500);
}

function buildFigureCandidates(snapshot: DocumentSnapshot): FigureCandidate[] {
  const out: FigureCandidate[] = [];
  for (const fig of snapshot.figures) {
    if (fig.isArtifact) continue;
    if (!fig.structRef) continue;
    const needs =
      !fig.hasAlt ||
      !fig.altText?.trim() ||
      isGenericAlt(fig.altText);
    if (!needs) continue;
    const row: FigureCandidate = {
      id: fig.structRef,
      structRef: fig.structRef,
      page: fig.page,
      hasAlt: fig.hasAlt,
      altText: fig.altText,
    };
    if (Array.isArray(fig.bbox) && fig.bbox.length === 4) {
      row.bbox = fig.bbox as [number, number, number, number];
    }
    out.push(row);
    if (out.length >= SEMANTIC_MAX_FIGURE_CANDIDATES) break;
  }
  return out;
}

function expandFigBboxForCaptionProximity(fig: [number, number, number, number]): [number, number, number, number] {
  const pad = 64;
  return [fig[0] - pad, fig[1] - pad, fig[2] + pad, fig[3] + pad];
}

function buildFigureLayoutContextBlock(
  layout: LayoutAnalysis,
  batchPages: number[],
  figureGeoms: Array<{ page: number; bbox?: [number, number, number, number] }>,
): string {
  const lines: string[] = [];
  lines.push(`multiColumn=${layout.isMultiColumn}, columns=${layout.columnCount}`);
  const uniq = [...new Set(batchPages)].sort((a, b) => a - b);
  for (const p of uniq) {
    const pageFigs = figureGeoms.filter(f => f.page === p && f.bbox);
    let caps = layout.captionCandidates.filter(c => c.pageNumber === p);
    if (pageFigs.length > 0 && caps.length > 0) {
      caps = caps.filter(c =>
        pageFigs.some(f => rectsOverlap(expandFigBboxForCaptionProximity(f.bbox!), c.bbox)),
      );
    }
    const capTexts = caps
      .slice(0, SEMANTIC_FIGURE_PROMPT_MAX_CAPTIONS_PER_PAGE)
      .map(c => c.text);
    if (capTexts.length) {
      lines.push(`Page ${p + 1} caption-like: ${capTexts.join(' | ')}`);
    }
    const bandTxt = layout.headerFooterBandTexts.filter(b => b.pageNumber === p);
    const seen = new Set<string>();
    const bits: string[] = [];
    for (const b of bandTxt) {
      const key = `${b.kind}:${b.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      bits.push(`${b.kind} "${b.text.slice(0, 120)}"`);
      if (bits.length >= SEMANTIC_FIGURE_PROMPT_MAX_BAND_LINES_PER_PAGE) break;
    }
    if (bits.length) lines.push(`Page ${p + 1} repeating bands: ${bits.join('; ')}`);

    const hfZones = layout.zones.filter(
      z => z.pageNumber === p && (z.type === 'header' || z.type === 'footer'),
    );
    if (hfZones.length && bits.length === 0) {
      lines.push(
        `Page ${p + 1} layout zones: ${hfZones
          .map(z => `${z.type} y${z.bbox[1].toFixed(0)}-${z.bbox[3].toFixed(0)}`)
          .join('; ')}`,
      );
    }
    const med = layout.medianFontSizePtByPage[p];
    if (med !== undefined) {
      lines.push(`Page ${p + 1} median text height(pt): ${med.toFixed(1)}`);
    }
  }
  return lines.join('\n');
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

interface LlmProposal {
  id: string;
  altText: string;
  confidence: number;
  isDecorative: boolean;
}

async function proposeForBatch(
  batch: FigureCandidate[],
  pageImages: Map<number, string>,
  domain: DocumentDomain,
  ctx: { title: string; language: string; filename: string; layoutContextBlock: string },
  options: { timeoutMs?: number; signal?: AbortSignal },
  batchIndex: number,
): Promise<{ proposals: LlmProposal[]; summary: SemanticBatchSummary }> {
  const systemPrompt = `You are generating alt text for PDF accessibility (WCAG 2.1 AA).
Document: "${ctx.title || ctx.filename}"
Domain: ${domain}
Language: ${ctx.language}
Layout context (heuristic; captions may describe nearby figures; repeating header/footer lines are not figure subjects):
${ctx.layoutContextBlock}

Rules:
- Describe what the figure conveys, not decorative appearance.
- For ${domain} documents: ${DOMAIN_ALT_TEXT_GUIDANCE[domain]}
- Max 200 characters per alt text.
- Decorative figures (dividers, logos, purely ornamental): set isDecorative true and altText empty string.
- Never start with "Image of", "Picture of", or "Graph showing".
- If unsure, set confidence to 0.3.`;

  const meta = batch.map(f => ({
    id: f.id,
    pageNumber: f.page + 1,
    priorAlt: f.altText ?? null,
  }));

  const userParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: `Figure metadata (JSON):\n${JSON.stringify(meta)}` },
  ];

  const pagesNeeded = [...new Set(batch.map(b => b.page))];
  for (const p of pagesNeeded) {
    const url = pageImages.get(p);
    if (url) {
      userParts.push({
        type: 'image_url',
        image_url: { url },
      });
    }
  }

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userParts },
  ];

  try {
    const { endpoint, payload } = await chatCompletionToolCall({
      messages,
      tools: [PROPOSE_ALT_TEXT_TOOL],
      toolChoice: { type: 'function', function: { name: 'propose_alt_text' } },
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });

    const raw = payload.arguments['proposals'];
    const proposals: LlmProposal[] = [];
    if (Array.isArray(raw)) {
      for (const row of raw) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const id = String(r['id'] ?? '');
        if (!id) continue;
        proposals.push({
          id,
          altText: String(r['altText'] ?? ''),
          confidence: Number(r['confidence'] ?? 0),
          isDecorative: Boolean(r['isDecorative']),
        });
      }
    }

    return {
      proposals,
      summary: {
        batchIndex,
        figureIds: batch.map(b => b.id),
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
        figureIds: batch.map(b => b.id),
        model: '',
        endpoint: 'primary',
        proposalCount: 0,
        error: (e as Error).message,
      },
    };
  }
}

/**
 * LLM vision pass for figure alt text. Caller must have LLM env configured.
 * Does not run if there are no eligible figure candidates.
 */
export async function applySemanticRepairs(input: SemanticRepairInput): Promise<SemanticRepairOutput> {
  const started = Date.now();
  const { buffer, filename, analysis, snapshot, options } = input;
  const scoreBefore = analysis.score;

  const emptySummary = (
    reason: SemanticRemediationSummary['skippedReason'],
    err?: string,
  ): SemanticRemediationSummary => ({
    skippedReason: reason,
    durationMs: Date.now() - started,
    proposalsAccepted: 0,
    proposalsRejected: 0,
    scoreBefore,
    scoreAfter: scoreBefore,
    batches: [],
    errorMessage: err,
  });

  if (snapshot.pdfClass === 'scanned') {
    return {
      buffer,
      analysis,
      snapshot,
      summary: emptySummary('scanned_pdf'),
    };
  }

  const altCat = analysis.categories.find(c => c.key === 'alt_text');
  if (!altCat?.applicable || altCat.score >= REMEDIATION_CATEGORY_THRESHOLD) {
    return {
      buffer,
      analysis,
      snapshot,
      summary: emptySummary('alt_text_sufficient'),
    };
  }

  const candidates = buildFigureCandidates(snapshot);
  if (candidates.length === 0) {
    return {
      buffer,
      analysis,
      snapshot,
      summary: emptySummary('no_candidates'),
    };
  }

  const layout = await analyzeLayout(buffer).catch(() => ({
    isMultiColumn: false,
    columnCount: 1,
    zones: [],
    captionCandidates: [],
    medianFontSizePtByPage: {} as Record<number, number>,
    headerFooterBandTexts: [] as LayoutAnalysis['headerFooterBandTexts'],
  }));

  const title = snapshot.metadata.title ?? snapshot.structTitle ?? null;
  const domain = detectDomain(title, textSample(snapshot));
  const language = snapshot.lang ?? snapshot.metadata.language ?? 'en-US';

  const uniquePages = [...new Set(candidates.map(c => c.page))];
  const pageImages = new Map<number, string>();
  for (const p of uniquePages) {
    const dataUrl = await renderPageToJpegDataUrl(buffer, p + 1);
    if (dataUrl) pageImages.set(p, dataUrl);
  }

  const figureBatches = chunk(candidates, SEMANTIC_FIGURE_BATCH_SIZE);
  const batchResults = await runBatchesWithConcurrency(
    figureBatches,
    SEMANTIC_REQUEST_CONCURRENCY,
    (batch, i) =>
      proposeForBatch(
        batch,
        pageImages,
        domain,
        {
          title: title ?? filename,
          language,
          filename,
          layoutContextBlock: buildFigureLayoutContextBlock(layout, [...new Set(batch.map(b => b.page))], batch),
        },
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

  const merged = new Map<string, LlmProposal>();
  for (const br of batchResults) {
    for (const p of br.proposals) {
      if (!candidates.some(c => c.id === p.id)) continue;
      merged.set(p.id, p);
    }
  }

  const accepted: LlmProposal[] = [];
  let rejected = 0;
  for (const p of merged.values()) {
    if (p.confidence < SEMANTIC_MIN_FIGURE_CONFIDENCE) {
      rejected++;
      continue;
    }
    accepted.push(p);
  }

  if (accepted.length === 0) {
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

  const mutations: PythonMutation[] = [];
  for (const p of accepted) {
    const cand = candidates.find(c => c.id === p.id);
    if (!cand) continue;
    if (p.isDecorative) {
      mutations.push({ op: 'mark_figure_decorative', params: { structRef: cand.structRef } });
    } else {
      const alt = p.altText.trim().slice(0, 200);
      if (!alt) continue;
      mutations.push({ op: 'set_figure_alt_text', params: { structRef: cand.structRef, altText: alt } });
    }
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
        proposalsRejected: rejected + accepted.length,
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

  let bufferForAnalyze = mutated;
  const repairAlt = await runPythonMutationBatch(
    mutated,
    [{ op: 'repair_alt_text_structure', params: {} }],
    {
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? PYTHON_MUTATION_TIMEOUT_MS,
    },
  );
  if (repairAlt.result.success) {
    bufferForAnalyze = repairAlt.buffer;
  }

  const tmpPath = join(tmpdir(), `pdfaf-sem-${randomUUID()}.pdf`);
  await writeFile(tmpPath, bufferForAnalyze);
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
        proposalsRejected: rejected + accepted.length,
        scoreBefore,
        scoreAfter: scoreBefore,
        batches: batchSummaries,
        errorMessage: 'regression_reverted',
      },
    };
  }

  return {
    buffer: bufferForAnalyze,
    analysis: nextAnalysis,
    snapshot: nextSnapshot,
    summary: {
      skippedReason: 'completed',
      durationMs: Date.now() - started,
      proposalsAccepted: accepted.length,
      proposalsRejected: rejected,
      scoreBefore,
      scoreAfter: nextAnalysis.score,
      batches: batchSummaries,
    },
  };
}
