import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  REMEDIATION_CATEGORY_THRESHOLD,
  SEMANTIC_MAX_PROMOTE_CANDIDATES,
  SEMANTIC_MIN_PROMOTE_CONFIDENCE,
  SEMANTIC_PROMOTE_BATCH_SIZE,
  SEMANTIC_PROMOTE_REQUEST_CONCURRENCY,
  SEMANTIC_REGRESSION_TOLERANCE,
  semanticUntaggedTier2Enabled,
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
import {
  filterPromoteCandidatesByLayout,
  PROMOTE_SOURCE_TAGS,
  type PromoteCandidateRow,
} from './promoteHeadingSemantic.js';
import type { SemanticRepairOutput } from './semanticService.js';

export interface SemanticUntaggedHeadingRepairInput {
  buffer: Buffer;
  filename: string;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
  };
}

interface UntaggedCandidateRow {
  structRef: string;
  text: string;
  page: number;
  bbox?: [number, number, number, number];
}

const PROPOSE_UNTAGGED_PROMOTE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'propose_untagged_heading_promote',
    description:
      'Propose which /P structure elements should become headings (golden Phase 3c-c fixture only).',
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

function buildUntaggedCandidates(snapshot: DocumentSnapshot): UntaggedCandidateRow[] {
  const rows = snapshot.paragraphStructElems ?? [];
  const seen = new Set<string>();
  const out: UntaggedCandidateRow[] = [];
  for (const r of rows) {
    if (!PROMOTE_SOURCE_TAGS.has(normalizeParagraphTag(r.tag))) continue;
    const ref = (r.structRef ?? '').trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    const row: UntaggedCandidateRow = {
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

function untaggedPromoteOp(snapshot: DocumentSnapshot): string {
  if (snapshot.threeCcGoldenV1) return 'golden_v1_promote_p_to_heading';
  if (snapshot.threeCcGoldenOrphanV1) return 'orphan_v1_promote_p_to_heading';
  return 'retag_struct_as_heading';
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

interface LlmUntaggedProposal {
  id: string;
  level: number;
  confidence: number;
}

async function proposeUntaggedBatch(
  batch: UntaggedCandidateRow[],
  domain: DocumentDomain,
  ctx: { title: string; filename: string },
  options: { timeoutMs?: number; signal?: AbortSignal },
  batchIndex: number,
): Promise<{ proposals: LlmUntaggedProposal[]; summary: SemanticBatchSummary }> {
  const systemPrompt = `You are assigning heading levels for the Phase 3c-c tagged golden fixture (experimental).
Document: "${ctx.title || ctx.filename}"
Domain: ${domain}
Domain guidance: ${DOMAIN_ALT_TEXT_GUIDANCE[domain]}

Rules:
- Only propose when the paragraph clearly acts as a section heading.
- If uncertain, set confidence below 0.72.
- id must match structRef from the input JSON exactly.`;

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
      tools: [PROPOSE_UNTAGGED_PROMOTE_TOOL],
      toolChoice: { type: 'function', function: { name: 'propose_untagged_heading_promote' } },
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });

    const raw = payload.arguments['proposals'];
    const proposals: LlmUntaggedProposal[] = [];
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
 * Experimental Phase 3c-c path: `pdfaf-3cc-golden-v1` / `pdfaf-3cc-orphan-v1` fixtures, or opt-in tier-2
 * Marked native_tagged PDFs (`PDFAF_SEMANTIC_UNTAGGED_TIER2=1`) using `retag_struct_as_heading` (fail-closed in Python).
 */
export async function applySemanticUntaggedHeadingRepairs(
  input: SemanticUntaggedHeadingRepairInput,
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

  const tier2Allowed =
    semanticUntaggedTier2Enabled() &&
    snapshot.pdfClass === 'native_tagged' &&
    snapshot.markInfo?.Marked === true;

  const producerGoldenLike =
    Boolean(snapshot.threeCcGoldenV1) || Boolean(snapshot.threeCcGoldenOrphanV1);

  if (!producerGoldenLike && !tier2Allowed) {
    return empty('unsupported_pdf');
  }

  if (snapshot.pdfClass === 'scanned') {
    return empty('scanned_pdf');
  }

  const hs = analysis.categories.find(c => c.key === 'heading_structure');
  if (!hs?.applicable || hs.score >= REMEDIATION_CATEGORY_THRESHOLD) {
    return empty('heading_structure_sufficient');
  }

  let workBuffer = buffer;
  let workSnapshot = snapshot;

  if (snapshot.threeCcGoldenOrphanV1) {
    const pre = buildUntaggedCandidates(workSnapshot);
    if (pre.length === 0 && (workSnapshot.orphanMcids?.length ?? 0) > 0) {
      const mcid = workSnapshot.orphanMcids![0]!.mcid;
      const ins = await runPythonMutationBatch(
        workBuffer,
        [{ op: 'orphan_v1_insert_p_for_mcid', params: { mcid } }],
        { signal: options?.signal, timeoutMs: options?.timeoutMs },
      );
      if (!ins.result.success || !ins.result.applied.includes('orphan_v1_insert_p_for_mcid')) {
        return empty(
          'error',
          ins.result.failed.map(f => f.error).join('; ') || 'orphan_v1_insert_p_for_mcid not applied',
        );
      }
      workBuffer = ins.buffer;
      const insTmp = join(tmpdir(), `pdfaf-orph-insert-${randomUUID()}.pdf`);
      await writeFile(insTmp, workBuffer);
      try {
        const out = await analyzePdf(insTmp, filename);
        workSnapshot = out.snapshot;
      } finally {
        await unlink(insTmp).catch(() => {});
      }
    }
  }

  const rawCandidates = buildUntaggedCandidates(workSnapshot);
  if (rawCandidates.length === 0) {
    return empty('no_candidates');
  }

  let layout: LayoutAnalysis;
  try {
    layout = await analyzeLayout(workBuffer);
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
  const candidates = filterPromoteCandidatesByLayout(rawCandidates as PromoteCandidateRow[], layout);
  if (candidates.length === 0) {
    return empty('no_candidates');
  }

  const title = workSnapshot.metadata.title ?? workSnapshot.structTitle ?? null;
  const domain = detectDomain(title, textSample(workSnapshot));

  const batches = chunk(candidates, SEMANTIC_PROMOTE_BATCH_SIZE);
  const batchResults = await runBatchesWithConcurrency(
    batches,
    SEMANTIC_PROMOTE_REQUEST_CONCURRENCY,
    (batch, i) =>
      proposeUntaggedBatch(
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
      buffer: workBuffer,
      analysis,
      snapshot: workSnapshot,
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

  const merged = new Map<string, LlmUntaggedProposal>();
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
      op: untaggedPromoteOp(workSnapshot),
      params: { structRef: row.structRef, level: p.level },
    });
  }

  if (mutations.length === 0) {
    return {
      buffer: workBuffer,
      analysis,
      snapshot: workSnapshot,
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

  const { buffer: mutated, result } = await runPythonMutationBatch(workBuffer, mutations, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  });

  if (!result.success) {
    return {
      buffer: workBuffer,
      analysis,
      snapshot: workSnapshot,
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

  const tmpPath = join(tmpdir(), `pdfaf-sem-untag-${randomUUID()}.pdf`);
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
