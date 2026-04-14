import { createHash, randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  REMEDIATION_IMPLEMENTED_TOOLS,
  REMEDIATION_MAX_BASE64_MB,
  REMEDIATION_MAX_ROUNDS,
  REMEDIATION_MIN_ROUND_IMPROVEMENT,
  REMEDIATION_TARGET_SCORE,
} from '../../config.js';
import type {
  AnalysisResult,
  AppliedRemediationTool,
  DocumentSnapshot,
  PlannedRemediationTool,
  RemediationPlan,
  RemediationResult,
  RemediationRoundSummary,
} from '../../types.js';
import { analyzePdf } from '../pdfAnalyzer.js';
import { planForRemediation } from './planner.js';
import { runPythonMutationBatch, type PythonMutation } from '../../python/bridge.js';
import * as metadataTools from './tools/metadata.js';

const implemented = new Set<string>(REMEDIATION_IMPLEMENTED_TOOLS);

function filterPlan(plan: RemediationPlan): RemediationPlan {
  return {
    stages: plan.stages
      .map(s => ({
        ...s,
        tools: s.tools.filter(t => implemented.has(t.toolName)),
      }))
      .filter(s => s.tools.length > 0),
  };
}

async function bufferSha256(buf: Buffer): Promise<string> {
  return createHash('sha256').update(buf).digest('hex');
}

async function runSingleTool(
  buffer: Buffer,
  tool: PlannedRemediationTool,
  _snapshot: DocumentSnapshot,
): Promise<{ buffer: Buffer; outcome: AppliedRemediationTool['outcome']; details?: string }> {
  const { toolName, params } = tool;
  const beforeHash = await bufferSha256(buffer);

  try {
    switch (toolName) {
      case 'set_document_title': {
        const title = String(params['title'] ?? '').trim();
        if (!title) return { buffer, outcome: 'no_effect', details: 'empty_title' };
        const next = await metadataTools.setDocumentTitle(buffer, title);
        return { buffer: next, outcome: (await bufferSha256(next)) !== beforeHash ? 'applied' : 'no_effect' };
      }
      case 'set_document_language': {
        const lang = String(params['language'] ?? '').trim();
        if (!lang) return { buffer, outcome: 'no_effect', details: 'empty_language' };
        const next = await metadataTools.setDocumentLanguage(buffer, lang);
        return { buffer: next, outcome: (await bufferSha256(next)) !== beforeHash ? 'applied' : 'no_effect' };
      }
      case 'set_pdfua_identification': {
        const lang = String(params['language'] ?? 'en-US').trim();
        const next = await metadataTools.setPdfUaIdentification(buffer, lang);
        return { buffer: next, outcome: (await bufferSha256(next)) !== beforeHash ? 'applied' : 'no_effect' };
      }
      case 'bootstrap_struct_tree':
      case 'repair_structure_conformance':
      case 'set_figure_alt_text':
      case 'mark_figure_decorative': {
        const mutations: PythonMutation[] = [{ op: toolName, params }];
        const { buffer: next, result } = await runPythonMutationBatch(buffer, mutations);
        if (!result.success) {
          return { buffer, outcome: 'failed', details: JSON.stringify(result.failed) };
        }
        if (result.applied.length === 0) {
          return { buffer, outcome: 'no_effect' };
        }
        return { buffer: next, outcome: 'applied' };
      }
      default:
        return { buffer, outcome: 'rejected', details: 'not_implemented' };
    }
  } catch (e) {
    return { buffer, outcome: 'failed', details: (e as Error).message };
  }
}

export interface RemediatePdfOptions {
  targetScore?: number;
  maxRounds?: number;
  signal?: AbortSignal;
}

export async function remediatePdf(
  buffer: Buffer,
  filename: string,
  initialAnalysis: AnalysisResult,
  initialSnapshot: DocumentSnapshot,
  options?: RemediatePdfOptions,
): Promise<RemediationResult> {
  const started = Date.now();
  const targetScore = options?.targetScore ?? REMEDIATION_TARGET_SCORE;
  const maxRounds = options?.maxRounds ?? REMEDIATION_MAX_ROUNDS;

  const before = initialAnalysis;
  let currentBuffer = buffer;
  let currentAnalysis = initialAnalysis;
  let currentSnapshot = initialSnapshot;
  const appliedTools: AppliedRemediationTool[] = [];
  const rounds: RemediationRoundSummary[] = [];

  for (let round = 1; round <= maxRounds; round++) {
    if (currentAnalysis.score >= targetScore) break;

    const roundStartScore = currentAnalysis.score;
    let rawPlan = planForRemediation(currentAnalysis, currentSnapshot, appliedTools);
    const plan = filterPlan(rawPlan);
    if (plan.stages.length === 0) break;

    for (const stage of plan.stages) {
      const stageStartBuffer = currentBuffer;
      const stageStartScore = currentAnalysis.score;
      const stageApplied: AppliedRemediationTool[] = [];

      let buf = currentBuffer;
      for (const tool of stage.tools) {
        const { buffer: next, outcome, details } = await runSingleTool(buf, tool, currentSnapshot);
        buf = next;
        stageApplied.push({
          toolName: tool.toolName,
          stage: stage.stageNumber,
          round,
          scoreBefore: stageStartScore,
          scoreAfter: stageStartScore,
          delta: 0,
          outcome,
          details,
        });
      }

      const tmp = join(tmpdir(), `pdfaf-rem-${randomUUID()}.pdf`);
      await writeFile(tmp, buf);
      let analyzed: Awaited<ReturnType<typeof analyzePdf>>;
      try {
        analyzed = await analyzePdf(tmp, filename);
      } finally {
        await unlink(tmp).catch(() => {});
      }

      if (analyzed.result.score < stageStartScore) {
        currentBuffer = stageStartBuffer;
        const regressedScore = analyzed.result.score;
        const restorePath = join(tmpdir(), `pdfaf-rem-restore-${randomUUID()}.pdf`);
        await writeFile(restorePath, stageStartBuffer);
        try {
          const restored = await analyzePdf(restorePath, filename);
          currentAnalysis = restored.result;
          currentSnapshot = restored.snapshot;
        } finally {
          await unlink(restorePath).catch(() => {});
        }
        for (const a of stageApplied) {
          a.outcome = 'rejected';
          a.details = `stage_regressed_score(${regressedScore})`;
          a.scoreAfter = currentAnalysis.score;
          a.delta = currentAnalysis.score - stageStartScore;
        }
      } else {
        currentBuffer = buf;
        currentAnalysis = analyzed.result;
        currentSnapshot = analyzed.snapshot;
        for (const a of stageApplied) {
          a.scoreAfter = analyzed.result.score;
          a.delta = analyzed.result.score - stageStartScore;
        }
      }
      appliedTools.push(...stageApplied);
    }

    const roundDelta = currentAnalysis.score - roundStartScore;
    const improvedThisRound = roundDelta >= REMEDIATION_MIN_ROUND_IMPROVEMENT;
    rounds.push({
      round,
      scoreAfter: currentAnalysis.score,
      improved: improvedThisRound,
    });

    if (currentAnalysis.score >= targetScore) break;
    if (!improvedThisRound) {
      break;
    }
  }

  const maxBytes = REMEDIATION_MAX_BASE64_MB * 1024 * 1024;
  let remediatedPdfBase64: string | null = null;
  let remediatedPdfTooLarge = false;
  if (currentBuffer.length <= maxBytes) {
    remediatedPdfBase64 = currentBuffer.toString('base64');
  } else {
    remediatedPdfTooLarge = true;
  }

  return {
    before,
    after: currentAnalysis,
    remediatedPdfBase64,
    remediatedPdfTooLarge,
    appliedTools,
    rounds,
    remediationDurationMs: Date.now() - started,
    improved: currentAnalysis.score > before.score,
  };
}
