import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  REMEDIATION_CATEGORY_THRESHOLD,
  SEMANTIC_HEADING_BATCH_SIZE,
  SEMANTIC_HEADING_REQUEST_CONCURRENCY,
  SEMANTIC_MAX_HEADING_CANDIDATES,
  SEMANTIC_MIN_HEADING_CONFIDENCE,
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
import { detectDomain, DOMAIN_ALT_TEXT_GUIDANCE, type DocumentDomain } from './domainDetector.js';
import { chatCompletionToolCall } from './openAiCompatClient.js';
import { isLlmTimeoutOrAbortError } from './llmBatchGuard.js';
import type { SemanticRepairOutput } from './semanticService.js';
import { logInfo } from '../../logging.js';
import {
  buildSemanticGateSummary,
  buildSemanticSummary,
  evaluateSemanticMutation,
} from './semanticPolicy.js';

export interface SemanticHeadingRepairInput {
  buffer: Buffer;
  filename: string;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
  };
}

interface HeadingCandidateRow {
  structRef: string;
  level: number;
  text: string;
  page: number;
}

const PROPOSE_HEADING_LEVELS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'propose_heading_levels',
    description: 'Propose corrected PDF/UA heading levels (H1–H6) for tagged structure elements.',
    parameters: {
      type: 'object',
      properties: {
        proposals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              proposedLevel: { type: 'integer', minimum: 1, maximum: 6 },
              confidence: { type: 'number' },
            },
            required: ['id', 'proposedLevel', 'confidence'],
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

function buildHeadingCandidates(snapshot: DocumentSnapshot): HeadingCandidateRow[] {
  const out: HeadingCandidateRow[] = [];
  for (const h of snapshot.headings) {
    if (!h.structRef) continue;
    const text = (h.text ?? '').trim();
    out.push({
      structRef: h.structRef,
      level: h.level,
      text: text.slice(0, 500),
      page: h.page,
    });
    if (out.length >= SEMANTIC_MAX_HEADING_CANDIDATES) break;
  }
  return out;
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

interface LlmHeadingProposal {
  id: string;
  proposedLevel: number;
  confidence: number;
}

async function proposeHeadingBatch(
  batch: HeadingCandidateRow[],
  domain: DocumentDomain,
  ctx: { title: string; filename: string },
  options: { timeoutMs?: number; signal?: AbortSignal },
  batchIndex: number,
): Promise<{ proposals: LlmHeadingProposal[]; summary: SemanticBatchSummary }> {
  const systemPrompt = `You are assigning heading levels (H1–H6) for PDF/UA tagged structure.
Document: "${ctx.title || ctx.filename}"
Domain: ${domain}
Domain guidance (for tone, not for images): ${DOMAIN_ALT_TEXT_GUIDANCE[domain]}

Rules:
- Exactly one H1 is allowed — the document title only. Demote any other top-level content to H2.
- H2 are major sections; H3–H6 are subsections.
- Do not skip levels in the outline (avoid H1 then H4 with no H2/H3).
- Only propose changes where the current level is clearly wrong for the text role.
- If uncertain, set confidence below 0.65 (caller will reject).
- id must match the structRef from the input JSON exactly.`;

  const userPayload = batch.map(h => ({
    id: h.structRef,
    currentLevel: h.level,
    text: h.text.slice(0, 200),
    pageNumber: h.page + 1,
  }));

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: JSON.stringify(userPayload) },
  ];

  try {
    const { endpoint, payload } = await chatCompletionToolCall({
      messages,
      tools: [PROPOSE_HEADING_LEVELS_TOOL],
      toolChoice: { type: 'function', function: { name: 'propose_heading_levels' } },
      timeoutMs: options.timeoutMs,
      signal: options.signal,
      operation: 'semantic_headings',
      traceId: `${ctx.filename}:heading_batch:${batchIndex}`,
    });

    const raw = payload.arguments['proposals'];
    const proposals: LlmHeadingProposal[] = [];
    if (Array.isArray(raw)) {
      for (const row of raw) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const id = String(r['id'] ?? '');
        const proposedLevel = Number(r['proposedLevel']);
        const confidence = Number(r['confidence'] ?? 0);
        if (!id || proposedLevel < 1 || proposedLevel > 6) continue;
        proposals.push({ id, proposedLevel, confidence });
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
 * LLM text pass: propose /S heading levels for tagged structure elements with structRef.
 */
export async function applySemanticHeadingRepairs(
  input: SemanticHeadingRepairInput,
): Promise<SemanticRepairOutput> {
  const started = Date.now();
  let gateMs = 0;
  let candidateMs = 0;
  let llmMs = 0;
  let mutationMs = 0;
  let verifyMs = 0;
  const { buffer, filename, analysis, snapshot, options } = input;
  const scoreBefore = analysis.score;
  const hs = analysis.categories.find(c => c.key === 'heading_structure');
  const runtimeFor = (
    skippedReason: SemanticRemediationSummary['skippedReason'],
    changeStatus: SemanticRemediationSummary['changeStatus'],
    candidateCountBefore: number,
    candidateCountAfter: number,
  ) => ({
    lane: 'headings' as const,
    totalMs: Date.now() - started,
    gateMs,
    candidateMs,
    llmMs,
    mutationMs,
    verifyMs,
    candidateCountBefore,
    candidateCountAfter,
    candidateCapHit: false,
    skippedReason,
    changeStatus,
  });

  const empty = (
    reason: SemanticRemediationSummary['skippedReason'],
    gate: ReturnType<typeof buildSemanticGateSummary>,
    err?: string,
  ): SemanticRepairOutput => ({
    buffer,
    analysis,
    snapshot,
    summary: buildSemanticSummary({
      lane: 'headings',
      skippedReason: reason,
      durationMs: Date.now() - started,
      proposalsAccepted: 0,
      proposalsRejected: 0,
      scoreBefore,
      scoreAfter: scoreBefore,
      batches: [],
      gate,
      runtime: runtimeFor(
        reason,
        reason === 'completed_no_changes' ? 'no_change' : 'skipped',
        gate.candidateCountBefore ?? 0,
        gate.candidateCountAfter ?? gate.candidateCountBefore ?? 0,
      ),
      changeStatus: reason === 'completed_no_changes' ? 'no_change' : 'skipped',
      errorMessage: err,
    }),
  });

  const gateStarted = Date.now();
  if (snapshot.pdfClass === 'scanned') {
    gateMs += Date.now() - gateStarted;
    return empty(
      'scanned_pdf',
      buildSemanticGateSummary({
        passed: false,
        reason: 'scanned_pdf',
        details: ['semantic heading refinement disabled for scanned PDFs'],
        targetCategoryKey: 'heading_structure',
        targetCategoryScoreBefore: hs?.score ?? null,
      }),
    );
  }

  if (!hs?.applicable || hs.score >= REMEDIATION_CATEGORY_THRESHOLD) {
    gateMs += Date.now() - gateStarted;
    return empty(
      'heading_structure_sufficient',
      buildSemanticGateSummary({
        passed: false,
        reason: 'heading_structure_sufficient',
        details: ['heading_structure category already meets deterministic threshold'],
        targetCategoryKey: 'heading_structure',
        targetCategoryScoreBefore: hs?.score ?? null,
      }),
    );
  }

  const candidateStarted = Date.now();
  const candidates = buildHeadingCandidates(snapshot);
  logInfo({
    message: 'semantic_headings_candidate_scan',
    details: {
      filename,
      scoreBefore,
      headingCategoryScore: hs.score,
      candidateCount: candidates.length,
      pageCount: analysis.pageCount,
    },
  });
  if (candidates.length === 0) {
    candidateMs += Date.now() - candidateStarted;
    gateMs += Date.now() - gateStarted;
    return empty(
      'no_candidates',
      buildSemanticGateSummary({
        passed: false,
        reason: 'no_candidates',
        details: ['no residual tagged heading candidates remain after deterministic normalization'],
        targetCategoryKey: 'heading_structure',
        targetCategoryScoreBefore: hs.score,
      }),
    );
  }
  candidateMs += Date.now() - candidateStarted;
  gateMs += Date.now() - gateStarted;

  const title = snapshot.metadata.title ?? snapshot.structTitle ?? null;
  const domain = detectDomain(title, textSample(snapshot));

  const batches = chunk(candidates, SEMANTIC_HEADING_BATCH_SIZE);
  const llmStarted = Date.now();
  const batchResults = await runBatchesWithConcurrency(
    batches,
    SEMANTIC_HEADING_REQUEST_CONCURRENCY,
    (batch, i) =>
      proposeHeadingBatch(
        batch,
        domain,
        { title: title ?? filename, filename },
        { timeoutMs: options?.timeoutMs, signal: options?.signal },
        i,
      ),
  );
  llmMs += Date.now() - llmStarted;

  const batchSummaries: SemanticBatchSummary[] = batchResults.map(r => r.summary);
  if (batchSummaries.some(b => isLlmTimeoutOrAbortError(b.error))) {
    return {
      buffer,
      analysis,
      snapshot,
      summary: buildSemanticSummary({
        lane: 'headings',
        skippedReason: 'llm_timeout',
        durationMs: Date.now() - started,
        proposalsAccepted: 0,
        proposalsRejected: 0,
        scoreBefore,
        scoreAfter: scoreBefore,
        batches: batchSummaries,
        gate: buildSemanticGateSummary({
          passed: true,
          reason: 'llm_timeout',
          details: ['semantic heading gate passed but LLM call timed out'],
          candidateCountBefore: candidates.length,
          targetCategoryKey: 'heading_structure',
          targetCategoryScoreBefore: hs.score,
        }),
        runtime: runtimeFor('llm_timeout', 'skipped', candidates.length, candidates.length),
        changeStatus: 'skipped',
        errorMessage: batchSummaries.find(b => isLlmTimeoutOrAbortError(b.error))?.error,
      }),
    };
  }

  const merged = new Map<string, LlmHeadingProposal>();
  for (const br of batchResults) {
    for (const p of br.proposals) {
      if (!candidates.some(c => c.structRef === p.id)) continue;
      merged.set(p.id, p);
    }
  }

  // Track H1 ownership across all proposals to enforce single-H1
  const proposalIds = new Set(merged.keys());
  const existingH1NotReplaced = snapshot.headings.some(
    h => h.level === 1 && !proposalIds.has(h.structRef ?? ''),
  );
  let h1Assigned = existingH1NotReplaced;

  let rejected = 0;
  const mutations: PythonMutation[] = [];
  for (const p of merged.values()) {
    if (p.confidence < SEMANTIC_MIN_HEADING_CONFIDENCE) {
      rejected++;
      continue;
    }
    const row = candidates.find(c => c.structRef === p.id);
    if (!row) continue;
    let targetLevel = p.proposedLevel;
    if (targetLevel === 1) {
      if (h1Assigned) {
        targetLevel = 2;
      } else {
        h1Assigned = true;
      }
    }
    if (targetLevel === row.level) continue;
    mutations.push({
      op: 'set_heading_level',
      params: { structRef: row.structRef, level: targetLevel },
    });
  }

  if (mutations.length === 0) {
    return {
      buffer,
      analysis,
      snapshot,
      summary: buildSemanticSummary({
        lane: 'headings',
        skippedReason: 'completed_no_changes',
        durationMs: Date.now() - started,
        proposalsAccepted: 0,
        proposalsRejected: rejected,
        scoreBefore,
        scoreAfter: scoreBefore,
        batches: batchSummaries,
        gate: buildSemanticGateSummary({
          passed: true,
          reason: 'no_confident_heading_proposals',
          details: ['semantic heading gate passed but no proposals survived filtering'],
          candidateCountBefore: candidates.length,
          candidateCountAfter: candidates.length,
          targetCategoryKey: 'heading_structure',
          targetCategoryScoreBefore: hs.score,
          targetCategoryScoreAfter: hs.score,
        }),
        runtime: runtimeFor('completed_no_changes', 'no_change', candidates.length, candidates.length),
        changeStatus: 'no_change',
      }),
    };
  }

  const mutationStarted = Date.now();
  const { buffer: mutated, result } = await runPythonMutationBatch(buffer, mutations, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  });

  if (!result.success) {
    mutationMs += Date.now() - mutationStarted;
    return {
      buffer,
      analysis,
      snapshot,
      summary: buildSemanticSummary({
        lane: 'headings',
        skippedReason: 'error',
        durationMs: Date.now() - started,
        proposalsAccepted: 0,
        proposalsRejected: rejected,
        scoreBefore,
        scoreAfter: scoreBefore,
        batches: batchSummaries,
        gate: buildSemanticGateSummary({
          passed: true,
          reason: 'mutation_error',
          details: ['semantic heading gate passed but Python mutation failed'],
          candidateCountBefore: candidates.length,
          candidateCountAfter: candidates.length,
          targetCategoryKey: 'heading_structure',
          targetCategoryScoreBefore: hs.score,
          targetCategoryScoreAfter: hs.score,
        }),
        runtime: runtimeFor('error', 'skipped', candidates.length, candidates.length),
        changeStatus: 'skipped',
        errorMessage: JSON.stringify(result.failed),
      }),
    };
  }
  mutationMs += Date.now() - mutationStarted;

  const verifyStarted = Date.now();
  const tmpPath = join(tmpdir(), `pdfaf-sem-h-${randomUUID()}.pdf`);
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
  verifyMs += Date.now() - verifyStarted;

  const nextCandidates = buildHeadingCandidates(nextSnapshot);
  const decision = evaluateSemanticMutation({
    lane: 'headings',
    beforeAnalysis: analysis,
    afterAnalysis: nextAnalysis,
    beforeSnapshot: snapshot,
    afterSnapshot: nextSnapshot,
    targetCategoryKey: 'heading_structure',
    candidateCountBefore: candidates.length,
    candidateCountAfter: nextCandidates.length,
    proposalsAccepted: mutations.length,
    proposalsRejected: rejected,
    batches: batchSummaries,
    durationMs: Date.now() - started,
    regressionTolerance: SEMANTIC_REGRESSION_TOLERANCE,
  });
  if (!decision.accepted) {
    return {
      buffer,
      analysis,
      snapshot,
      summary: buildSemanticSummary({
        lane: 'headings',
        skippedReason: decision.skippedReason,
        durationMs: Date.now() - started,
        proposalsAccepted: 0,
        proposalsRejected: rejected + merged.size,
        scoreBefore,
        scoreAfter: scoreBefore,
        batches: batchSummaries,
        gate: decision.gate,
        runtime: runtimeFor(decision.skippedReason, decision.changeStatus, candidates.length, candidates.length),
        changeStatus: decision.changeStatus,
        errorMessage: decision.errorMessage,
      }),
    };
  }

  return {
    buffer: mutated,
    analysis: nextAnalysis,
    snapshot: nextSnapshot,
    summary: buildSemanticSummary({
      lane: 'headings',
      skippedReason: 'completed',
      durationMs: Date.now() - started,
      proposalsAccepted: mutations.length,
      proposalsRejected: rejected,
      scoreBefore,
      scoreAfter: nextAnalysis.score,
      batches: batchSummaries,
      gate: decision.gate,
      runtime: runtimeFor('completed', 'applied', candidates.length, nextCandidates.length),
      changeStatus: 'applied',
    }),
  };
}
