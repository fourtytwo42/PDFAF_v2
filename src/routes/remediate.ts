import { Router, type IRouter } from 'express';
import multer from 'multer';
import Database from 'better-sqlite3';
import { unlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  getDefaultRemediateReadabilityOptions,
  getDefaultRemediateSemanticOptions,
  getOpenAiCompatBaseUrl,
  MAX_FILE_SIZE_MB,
  REMEDIATION_ANALYSIS_TIMEOUT_MS,
  REMEDIATION_MAX_BASE64_MB,
  REMEDIATION_SOFT_DEADLINE_BUFFER_MS,
  REMEDIATION_TARGET_SCORE,
  REQUEST_TIMEOUT_REMEDIATE_MS,
  SEMANTIC_REMEDIATE_FIGURE_PASSES,
  SEMANTIC_REMEDIATE_PROMOTE_PASSES,
  semanticDebugLogEnabled,
} from '../config.js';
import { sendApiError } from '../apiError.js';
import { logError, logInfo } from '../logging.js';
import { recordRemediation } from '../metrics.js';
import {
  completeRemediationProgress,
  failRemediationProgress,
  getRemediationProgress,
  startRemediationProgress,
  updateRemediationProgress,
} from '../remediationProgress.js';
import { analyzePdf } from '../services/pdfAnalyzer.js';
import { remediatePdf } from '../services/remediation/orchestrator.js';
import { applyPostRemediationAltRepair, shouldKeepPostRemediationAltRepair } from '../services/remediation/altStructureRepair.js';
import { buildRemediationOutcomeSummary } from '../services/remediation/outcomeSummary.js';
import { buildPacRuleEvidence } from '../services/compliance/pacRuleEvidence.js';
import { applySemanticRepairs } from '../services/semantic/semanticService.js';
import { applySemanticHeadingRepairs } from '../services/semantic/headingSemantic.js';
import { applySemanticPromoteHeadingRepairs } from '../services/semantic/promoteHeadingSemantic.js';
import { applySemanticUntaggedHeadingRepairs } from '../services/semantic/untaggedHeadingSemantic.js';
import { reviewRemediatedReadability } from '../services/semantic/readabilityReview.js';
import { buildSemanticGateSummary, buildSemanticSummary, enforceSemanticTrust } from '../services/semantic/semanticPolicy.js';
import { remediateOptionsSchema, type ParsedRemediateOptions } from '../schemas/remediateOptions.js';
import { generateHtmlReport } from '../services/reporter/htmlReport.js';
import { toApiRemediationResult } from '../services/api/serializeAnalysis.js';
import { initSchema } from '../db/schema.js';
import { createPlaybookStore } from '../services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../services/learning/toolOutcomes.js';
import type { RemediationResult, RemediationRuntimeSummary, RuntimeCountRow, SemanticRemediationSummary, ReadabilityReviewSummary } from '../types.js';

/** Merge per-pass semantic summaries (same buffer evolved); `scoreBefore` is the block start score. */
export function mergeSequentialSemanticSummaries(
  scoreBeforeBlock: number,
  parts: SemanticRemediationSummary[],
): SemanticRemediationSummary {
  if (parts.length === 0) {
    return buildSemanticSummary({
      lane: 'figures',
      skippedReason: 'completed_no_changes',
      durationMs: 0,
      proposalsAccepted: 0,
      proposalsRejected: 0,
      scoreBefore: scoreBeforeBlock,
      scoreAfter: scoreBeforeBlock,
      batches: [],
      gate: buildSemanticGateSummary({
        passed: false,
        reason: 'no_passes',
        details: ['no semantic passes executed'],
      }),
      changeStatus: 'no_change',
    });
  }
  const fatal = parts.find(p =>
    ['error', 'llm_timeout', 'regression_reverted', 'unsupported_pdf', 'no_target_improvement'].includes(p.skippedReason),
  );
  const last = parts[parts.length - 1]!;
  const anyApplied = parts.some(part => part.changeStatus === 'applied');
  const anyNoChange = parts.some(part => part.changeStatus === 'no_change');
  const skippedReason =
    anyApplied
      ? 'completed'
      : fatal?.skippedReason
        ?? (anyNoChange ? 'completed_no_changes' : last.skippedReason);
  const changeStatus =
    anyApplied
      ? 'applied'
      : fatal?.changeStatus
        ?? (anyNoChange ? 'no_change' : last.changeStatus);
  const gateReason =
    anyApplied && !fatal
      ? 'gate_passed'
      : fatal?.gate.reason ?? last.gate.reason;
  return buildSemanticSummary({
    lane: parts[0]!.lane,
    skippedReason,
    durationMs: parts.reduce((s, p) => s + p.durationMs, 0),
    proposalsAccepted: parts.reduce((s, p) => s + p.proposalsAccepted, 0),
    proposalsRejected: parts.reduce((s, p) => s + p.proposalsRejected, 0),
    scoreBefore: scoreBeforeBlock,
    scoreAfter: last.scoreAfter,
    batches: parts.flatMap(p => p.batches),
    gate: buildSemanticGateSummary({
      passed: parts.some(p => p.gate.passed),
      reason: gateReason,
      details: [...new Set(parts.flatMap(p => p.gate.details))],
      candidateCountBefore: parts[0]!.gate.candidateCountBefore,
      candidateCountAfter: last.gate.candidateCountAfter,
      targetCategoryKey: parts[0]!.gate.targetCategoryKey ?? null,
      targetCategoryScoreBefore: parts[0]!.gate.targetCategoryScoreBefore ?? null,
      targetCategoryScoreAfter: last.gate.targetCategoryScoreAfter ?? null,
    }),
    changeStatus,
    ...(!anyApplied && fatal?.errorMessage ? { errorMessage: fatal.errorMessage } : {}),
    trustDowngraded: parts.some(p => p.trustDowngraded === true),
  });
}

function runtimeCounts(values: string[]): RuntimeCountRow[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function mergeCountRows(rows: RuntimeCountRow[]): RuntimeCountRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.key, (counts.get(row.key) ?? 0) + row.count);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function mergeDeterministicRuntimeSummaries(
  summaries: Array<RemediationRuntimeSummary | undefined>,
): RemediationRuntimeSummary | undefined {
  const present = summaries.filter((summary): summary is RemediationRuntimeSummary => Boolean(summary));
  if (present.length === 0) return undefined;
  return {
    analysisBefore: present[0]?.analysisBefore ?? null,
    analysisAfter: present.at(-1)?.analysisAfter ?? null,
    deterministicTotalMs: present.reduce((sum, summary) => sum + (summary.deterministicTotalMs ?? 0), 0),
    stageTimings: present.flatMap(summary => summary.stageTimings ?? []),
    toolTimings: present.flatMap(summary => summary.toolTimings ?? []),
    liveAnalysisTimings: present.flatMap(summary => summary.liveAnalysisTimings ?? []),
    semanticLaneTimings: present.flatMap(summary => summary.semanticLaneTimings ?? []),
    boundedWork: {
      semanticCandidateCapsHit: present.reduce((sum, summary) => sum + (summary.boundedWork?.semanticCandidateCapsHit ?? 0), 0),
      deterministicEarlyExitCount: present.reduce((sum, summary) => sum + (summary.boundedWork?.deterministicEarlyExitCount ?? 0), 0),
      deterministicEarlyExitReasons: mergeCountRows(present.flatMap(summary => summary.boundedWork?.deterministicEarlyExitReasons ?? [])),
      semanticSkipReasons: mergeCountRows(present.flatMap(summary => summary.boundedWork?.semanticSkipReasons ?? [])),
      zeroHeadingLaneActivations: present.reduce((sum, summary) => sum + (summary.boundedWork?.zeroHeadingLaneActivations ?? 0), 0),
      headingConvergenceAttemptCount: present.reduce((sum, summary) => sum + (summary.boundedWork?.headingConvergenceAttemptCount ?? 0), 0),
      headingConvergenceSuccessCount: present.reduce((sum, summary) => sum + (summary.boundedWork?.headingConvergenceSuccessCount ?? 0), 0),
      headingConvergenceFailureCount: present.reduce((sum, summary) => sum + (summary.boundedWork?.headingConvergenceFailureCount ?? 0), 0),
      headingConvergenceTimeoutCount: present.reduce((sum, summary) => sum + (summary.boundedWork?.headingConvergenceTimeoutCount ?? 0), 0),
      structureConformanceTimeoutCount: present.reduce((sum, summary) => sum + (summary.boundedWork?.structureConformanceTimeoutCount ?? 0), 0),
    },
  };
}

function hasVerifiedCheckpointTimeoutReturn(result: { runtimeSummary?: RemediationRuntimeSummary }): boolean {
  const reasons = result.runtimeSummary?.boundedWork?.deterministicEarlyExitReasons;
  return reasons?.some(row =>
    (row.key === 'verified_checkpoint_timeout_return' ||
      row.key === 'verified_low_score_checkpoint_timeout_return' ||
      row.key === 'verified_low_score_checkpoint_slow_no_gain_figure_alt_return') &&
    row.count > 0
  ) ?? false;
}

const API_SECOND_PASS_MIN_SCORE = parseInt(process.env['PDFAF_SECOND_PASS_MIN_SCORE'] ?? '93', 10);

export function shouldRunApiSecondDeterministicPass(input: {
  verifiedCheckpointReturned: boolean;
  score: number;
  remediationTargetScore?: number;
  secondPassMinScore?: number;
  hasBudget: boolean;
}): boolean {
  if (input.verifiedCheckpointReturned) return false;
  if (!input.hasBudget) return false;
  const targetScore = input.remediationTargetScore ?? REMEDIATION_TARGET_SCORE;
  if (input.score >= targetScore) return false;
  const secondPassMinScore = input.secondPassMinScore ?? API_SECOND_PASS_MIN_SCORE;
  return input.score < secondPassMinScore;
}

function createTransientLearningStores(dbHandles: Array<{ close: () => void }>) {
  const db = new Database(':memory:');
  initSchema(db);
  dbHandles.push(db);
  return {
    playbookStore: createPlaybookStore(db),
    toolOutcomeStore: createToolOutcomeStore(db),
  };
}

function mergeRuntimeSummary(
  deterministic: RemediationRuntimeSummary | Array<RemediationRuntimeSummary | undefined> | undefined,
  afterRuntime: RemediationResult['after']['runtimeSummary'] | undefined,
  semanticSummaries: SemanticRemediationSummary[],
): RemediationRuntimeSummary | undefined {
  const deterministicSummary = Array.isArray(deterministic)
    ? mergeDeterministicRuntimeSummaries(deterministic)
    : deterministic;
  if (!deterministicSummary && semanticSummaries.length === 0 && !afterRuntime) return undefined;
  const semanticSkipReasons = runtimeCounts(
    semanticSummaries.map(summary => `${summary.lane}:${summary.skippedReason}`),
  );
  return {
    analysisBefore: deterministicSummary?.analysisBefore ?? null,
    analysisAfter: afterRuntime ?? null,
    deterministicTotalMs: deterministicSummary?.deterministicTotalMs ?? 0,
    stageTimings: deterministicSummary?.stageTimings ?? [],
    toolTimings: deterministicSummary?.toolTimings ?? [],
    liveAnalysisTimings: deterministicSummary?.liveAnalysisTimings ?? [],
    semanticLaneTimings: semanticSummaries.flatMap(summary => summary.runtime ? [summary.runtime] : []),
    boundedWork: {
      semanticCandidateCapsHit: semanticSummaries.filter(summary => summary.runtime?.candidateCapHit).length,
      deterministicEarlyExitCount: deterministicSummary?.boundedWork.deterministicEarlyExitCount ?? 0,
      deterministicEarlyExitReasons: deterministicSummary?.boundedWork.deterministicEarlyExitReasons ?? [],
      semanticSkipReasons,
      zeroHeadingLaneActivations: deterministicSummary?.boundedWork.zeroHeadingLaneActivations ?? 0,
      headingConvergenceAttemptCount: deterministicSummary?.boundedWork.headingConvergenceAttemptCount ?? 0,
      headingConvergenceSuccessCount: deterministicSummary?.boundedWork.headingConvergenceSuccessCount ?? 0,
      headingConvergenceFailureCount: deterministicSummary?.boundedWork.headingConvergenceFailureCount ?? 0,
      headingConvergenceTimeoutCount: deterministicSummary?.boundedWork.headingConvergenceTimeoutCount ?? 0,
      structureConformanceTimeoutCount: deterministicSummary?.boundedWork.structureConformanceTimeoutCount ?? 0,
    },
  };
}

export const remediateRouter: IRouter = Router();

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
});

function encodePdfBase64(buffer: Buffer): Pick<RemediationResult, 'remediatedPdfBase64' | 'remediatedPdfTooLarge'> {
  const maxBytes = REMEDIATION_MAX_BASE64_MB * 1024 * 1024;
  if (buffer.length <= maxBytes) {
    return { remediatedPdfBase64: buffer.toString('base64'), remediatedPdfTooLarge: false };
  }
  return { remediatedPdfBase64: null, remediatedPdfTooLarge: true };
}

function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const active = signals.filter(signal => !signal.aborted);
  if (active.length === 0) return signals[0]!;
  if (active.length === 1) return active[0]!;
  return AbortSignal.any(active);
}

remediateRouter.get('/progress/:jobId', (req, res) => {
  const jobId = String(req.params.jobId ?? '').trim();
  if (!jobId) {
    sendApiError(res, 400, 'BAD_REQUEST', 'Missing remediation progress job id.');
    return;
  }

  const progress = getRemediationProgress(jobId);
  if (!progress) {
    sendApiError(res, 404, 'NOT_FOUND', 'Remediation progress was not found.');
    return;
  }

  res.status(200).json(progress);
});

remediateRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    sendApiError(
      res,
      400,
      'BAD_REQUEST',
      'No file uploaded. Send a PDF as multipart field "file".',
    );
    return;
  }

  const tempPath = req.file.path;
  const filename = req.file.originalname || `upload-${randomUUID()}.pdf`;
  const progressJobId =
    typeof req.headers['x-pdfaf-progress-job-id'] === 'string'
      ? req.headers['x-pdfaf-progress-job-id'].trim()
      : '';
  const reportProgress = async (percent: number, stage: string, detail?: string) => {
    if (!progressJobId) return;
    updateRemediationProgress(progressJobId, stage, percent, detail);
  };

  if (progressJobId) {
    startRemediationProgress(progressJobId, 'Uploading PDF', 4, filename);
  }

  let parsedOptions: ParsedRemediateOptions = {};
  const rawOpts = req.body?.['options'];
  if (rawOpts !== undefined && rawOpts !== null && rawOpts !== '') {
    if (typeof rawOpts !== 'string') {
      sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'Field "options" must be a JSON string when provided.',
      );
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(rawOpts) as unknown;
    } catch {
      sendApiError(res, 400, 'BAD_REQUEST', 'Field "options" must be valid JSON.');
      return;
    }
    const parsed = remediateOptionsSchema.safeParse(json);
    if (!parsed.success) {
      sendApiError(res, 400, 'INVALID_OPTIONS', 'Invalid options', parsed.error.flatten());
      return;
    }
    parsedOptions = parsed.data;
  }

  parsedOptions = {
    ...getDefaultRemediateSemanticOptions(),
    ...getDefaultRemediateReadabilityOptions(),
    ...parsedOptions,
  };

  const semanticAbort = new AbortController();
  const timeoutSignal =
    REQUEST_TIMEOUT_REMEDIATE_MS > 0
      ? AbortSignal.timeout(REQUEST_TIMEOUT_REMEDIATE_MS)
      : null;
  const remediationSignal = timeoutSignal
    ? combineAbortSignals([semanticAbort.signal, timeoutSignal])
    : semanticAbort.signal;
  const onClientClose = () => semanticAbort.abort();
  req.on('close', onClientClose);

  const routeStarted = Date.now();
  const transientLearningDbs: Array<{ close: () => void }> = [];

  try {
    logInfo({
      message: 'remediate_request_received',
      requestId: res.locals.requestId,
      filename,
      details: {
        semantic: Boolean(parsedOptions.semantic),
        semanticHeadings: Boolean(parsedOptions.semanticHeadings),
        semanticPromoteHeadings: Boolean(parsedOptions.semanticPromoteHeadings),
        semanticUntaggedHeadings: Boolean(parsedOptions.semanticUntaggedHeadings),
        readabilityReview: Boolean(parsedOptions.readabilityReview),
        targetScore: parsedOptions.targetScore ?? null,
        maxRounds: parsedOptions.maxRounds ?? null,
        llmConfigured: Boolean(getOpenAiCompatBaseUrl()),
      },
    });

    await reportProgress(10, 'Reading your PDF', filename);
    const { result, snapshot } = await analyzePdf(tempPath, filename, {
      signal: remediationSignal,
      timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS,
    });
    const buffer = await readFile(tempPath);
    await reportProgress(18, 'Getting fixes ready');
    const firstPassStores = createTransientLearningStores(transientLearningDbs);
    const { remediation, buffer: detBuffer, snapshot: detSnapshot } = await remediatePdf(
      buffer,
      filename,
      result,
      snapshot,
      {
        targetScore: parsedOptions.targetScore,
        maxRounds: parsedOptions.maxRounds,
        includeOptionalRemediation: parsedOptions.includeOptionalRemediation ?? false,
        playbookStore: firstPassStores.playbookStore,
        toolOutcomeStore: firstPassStores.toolOutcomeStore,
        signal: remediationSignal,
        onProgress: update => reportProgress(update.percent, update.stage, update.detail),
      },
    );

    let outBuffer = detBuffer;
    let outAfter = remediation.after;
    let outSnapshot = detSnapshot;
    let appliedToolsOut = [...remediation.appliedTools];
    let roundsOut = [...remediation.rounds];
    const deterministicRuntimeSummaries: Array<RemediationRuntimeSummary | undefined> = [
      remediation.runtimeSummary,
    ];
    let deterministicDurationMs = remediation.remediationDurationMs;
    let verifiedCheckpointReturned = hasVerifiedCheckpointTimeoutReturn(remediation);
    const remediationTargetScore = parsedOptions.targetScore ?? REMEDIATION_TARGET_SCORE;
    const runPostRemediationAltPhase = async (details: string): Promise<void> => {
      if (verifiedCheckpointReturned) return;
      if (!outSnapshot.isTagged) return;
      if (outAfter.scoreProfile.overallScore >= remediationTargetScore) return;
      const scoreBeforeAltFix = outAfter.scoreProfile.overallScore;
      const phaseStarted = Date.now();
      const ar = await applyPostRemediationAltRepair(outBuffer, filename, outAfter, outSnapshot, {
        signal: remediationSignal,
      });
      deterministicDurationMs += Date.now() - phaseStarted;
      if (!ar.buffer.equals(outBuffer) && shouldKeepPostRemediationAltRepair(outAfter, ar.analysis)) {
        outBuffer = ar.buffer;
        outAfter = ar.analysis;
        outSnapshot = ar.snapshot;
        appliedToolsOut = [
          ...appliedToolsOut,
          {
            toolName: 'repair_alt_text_structure',
            stage: 9,
            round: roundsOut[roundsOut.length - 1]?.round ?? 1,
            scoreBefore: scoreBeforeAltFix,
            scoreAfter: outAfter.scoreProfile.overallScore,
            delta: outAfter.scoreProfile.overallScore - scoreBeforeAltFix,
            outcome: 'applied' as const,
            details,
            source: 'post_pass' as const,
          },
        ];
      }
    };
    const hasSecondPassBudget = (): boolean => {
      if (REQUEST_TIMEOUT_REMEDIATE_MS <= 0) return true;
      const remainingMs = REQUEST_TIMEOUT_REMEDIATE_MS - (Date.now() - routeStarted);
      return remainingMs >= (REMEDIATION_ANALYSIS_TIMEOUT_MS + REMEDIATION_SOFT_DEADLINE_BUFFER_MS);
    };
    await runPostRemediationAltPhase('nested_alt_cleanup_post_first_pass');
    if (shouldRunApiSecondDeterministicPass({
      verifiedCheckpointReturned,
      score: outAfter.scoreProfile.overallScore,
      remediationTargetScore,
      hasBudget: hasSecondPassBudget(),
    })) {
      await reportProgress(90, 'Running a final deterministic check');
      const secondPassStores = createTransientLearningStores(transientLearningDbs);
      const r2 = await remediatePdf(
        outBuffer,
        filename,
        outAfter,
        outSnapshot,
        {
          targetScore: parsedOptions.targetScore,
          maxRounds: parsedOptions.maxRounds,
          includeOptionalRemediation: parsedOptions.includeOptionalRemediation ?? false,
          playbookStore: secondPassStores.playbookStore,
          toolOutcomeStore: secondPassStores.toolOutcomeStore,
          signal: remediationSignal,
          onProgress: update => reportProgress(
            Math.min(91.5, 90 + (update.percent / 100) * 1.5),
            update.stage,
            update.detail,
          ),
        },
      );
      deterministicDurationMs += r2.remediation.remediationDurationMs;
      if (r2.remediation.runtimeSummary) deterministicRuntimeSummaries.push(r2.remediation.runtimeSummary);
      if (r2.remediation.after.scoreProfile.overallScore >= outAfter.scoreProfile.overallScore) {
        const roundOffset = roundsOut[roundsOut.length - 1]?.round ?? 0;
        outBuffer = r2.buffer;
        outAfter = r2.remediation.after;
        outSnapshot = r2.snapshot;
        roundsOut = [
          ...roundsOut,
          ...r2.remediation.rounds.map(round => ({ ...round, round: round.round + roundOffset })),
        ];
        appliedToolsOut = [
          ...appliedToolsOut,
          ...r2.remediation.appliedTools.map(tool => ({ ...tool, round: tool.round + roundOffset })),
        ];
        verifiedCheckpointReturned = hasVerifiedCheckpointTimeoutReturn(r2.remediation);
      }
      await runPostRemediationAltPhase('nested_alt_cleanup_post_second_pass');
    }
    let semanticSummary: SemanticRemediationSummary | undefined;
    let semanticHeadingsSummary: SemanticRemediationSummary | undefined;
    let semanticPromoteHeadingsSummary: SemanticRemediationSummary | undefined;
    let semanticUntaggedHeadingsSummary: SemanticRemediationSummary | undefined;
    const semanticRequested = Boolean(parsedOptions.semantic);
    const semanticHeadingsRequested = Boolean(parsedOptions.semanticHeadings);
    const semanticPromoteHeadingsRequested = Boolean(parsedOptions.semanticPromoteHeadings);
    const semanticUntaggedHeadingsRequested = Boolean(parsedOptions.semanticUntaggedHeadings);
    const figureTimeout = parsedOptions.semanticTimeoutMs;
    const headingTimeout =
      parsedOptions.semanticHeadingTimeoutMs ?? parsedOptions.semanticTimeoutMs;
    const promoteTimeout =
      parsedOptions.semanticPromoteHeadingTimeoutMs ?? parsedOptions.semanticTimeoutMs;
    const untaggedTimeout =
      parsedOptions.semanticUntaggedHeadingTimeoutMs ?? parsedOptions.semanticTimeoutMs;

    if (semanticRequested) {
      await reportProgress(92, 'Describing figures');
      const scoreRef = outAfter.scoreProfile.overallScore;
      if (!getOpenAiCompatBaseUrl()) {
        semanticSummary = buildSemanticSummary({
          lane: 'figures',
          skippedReason: 'no_llm_config',
          durationMs: 0,
          proposalsAccepted: 0,
          proposalsRejected: 0,
          scoreBefore: scoreRef,
          scoreAfter: scoreRef,
          batches: [],
          gate: buildSemanticGateSummary({
            passed: false,
            reason: 'no_llm_config',
            details: ['no OpenAI-compatible endpoint configured for semantic figures'],
            targetCategoryKey: 'alt_text',
          }),
          changeStatus: 'skipped',
        });
      } else {
        const figureParts: SemanticRemediationSummary[] = [];
        for (let pass = 0; pass < SEMANTIC_REMEDIATE_FIGURE_PASSES; pass++) {
          await reportProgress(
            92 + (((pass + 0.2) / Math.max(1, SEMANTIC_REMEDIATE_FIGURE_PASSES)) * 2),
            'Describing figures',
            `Pass ${pass + 1} of ${SEMANTIC_REMEDIATE_FIGURE_PASSES}`,
          );
          const sem = await applySemanticRepairs({
            buffer: outBuffer,
            filename,
            analysis: outAfter,
            snapshot: outSnapshot,
            options: {
              timeoutMs: figureTimeout,
              signal: remediationSignal,
            },
          });
          figureParts.push(sem.summary);
          outBuffer = sem.buffer;
          outAfter = sem.analysis;
          outSnapshot = sem.snapshot;
          if (sem.summary.skippedReason !== 'completed') break;
          if (sem.summary.proposalsAccepted === 0) break;
        }
        semanticSummary = mergeSequentialSemanticSummaries(scoreRef, figureParts);
      }
    }

    // Promote /P → headings before tuning existing heading levels (many PDFs have no H tags yet).
    if (semanticPromoteHeadingsRequested) {
      await reportProgress(94, 'Organizing headings');
      const scoreRef = outAfter.scoreProfile.overallScore;
      if (!getOpenAiCompatBaseUrl()) {
        semanticPromoteHeadingsSummary = buildSemanticSummary({
          lane: 'promote_headings',
          skippedReason: 'no_llm_config',
          durationMs: 0,
          proposalsAccepted: 0,
          proposalsRejected: 0,
          scoreBefore: scoreRef,
          scoreAfter: scoreRef,
          batches: [],
          gate: buildSemanticGateSummary({
            passed: false,
            reason: 'no_llm_config',
            details: ['no OpenAI-compatible endpoint configured for promote-heading semantics'],
            targetCategoryKey: 'heading_structure',
          }),
          changeStatus: 'skipped',
        });
      } else {
        const promoteParts: SemanticRemediationSummary[] = [];
        for (let pass = 0; pass < SEMANTIC_REMEDIATE_PROMOTE_PASSES; pass++) {
          await reportProgress(
            94 + (((pass + 0.2) / Math.max(1, SEMANTIC_REMEDIATE_PROMOTE_PASSES)) * 1.5),
            'Organizing headings',
            `Promote pass ${pass + 1} of ${SEMANTIC_REMEDIATE_PROMOTE_PASSES}`,
          );
          const promote = await applySemanticPromoteHeadingRepairs({
            buffer: outBuffer,
            filename,
            analysis: outAfter,
            snapshot: outSnapshot,
            options: { timeoutMs: promoteTimeout, signal: remediationSignal },
          });
          promoteParts.push(promote.summary);
          outBuffer = promote.buffer;
          outAfter = promote.analysis;
          outSnapshot = promote.snapshot;
          if (promote.summary.skippedReason !== 'completed') break;
          if (promote.summary.proposalsAccepted === 0) break;
        }
        semanticPromoteHeadingsSummary = mergeSequentialSemanticSummaries(scoreRef, promoteParts);
      }
    }

    if (semanticHeadingsRequested) {
      await reportProgress(95.5, 'Refining heading levels');
      const scoreRef = outAfter.scoreProfile.overallScore;
      if (!getOpenAiCompatBaseUrl()) {
        semanticHeadingsSummary = buildSemanticSummary({
          lane: 'headings',
          skippedReason: 'no_llm_config',
          durationMs: 0,
          proposalsAccepted: 0,
          proposalsRejected: 0,
          scoreBefore: scoreRef,
          scoreAfter: scoreRef,
          batches: [],
          gate: buildSemanticGateSummary({
            passed: false,
            reason: 'no_llm_config',
            details: ['no OpenAI-compatible endpoint configured for heading semantics'],
            targetCategoryKey: 'heading_structure',
          }),
          changeStatus: 'skipped',
        });
      } else {
        const head = await applySemanticHeadingRepairs({
          buffer: outBuffer,
          filename,
          analysis: outAfter,
          snapshot: outSnapshot,
          options: { timeoutMs: headingTimeout, signal: remediationSignal },
        });
        outBuffer = head.buffer;
        outAfter = head.analysis;
        outSnapshot = head.snapshot;
        semanticHeadingsSummary = head.summary;
      }
    }

    if (semanticUntaggedHeadingsRequested) {
      await reportProgress(96.5, 'Adding missing headings');
      const scoreRef = outAfter.scoreProfile.overallScore;
      if (!getOpenAiCompatBaseUrl()) {
        semanticUntaggedHeadingsSummary = buildSemanticSummary({
          lane: 'untagged_headings',
          skippedReason: 'no_llm_config',
          durationMs: 0,
          proposalsAccepted: 0,
          proposalsRejected: 0,
          scoreBefore: scoreRef,
          scoreAfter: scoreRef,
          batches: [],
          gate: buildSemanticGateSummary({
            passed: false,
            reason: 'no_llm_config',
            details: ['no OpenAI-compatible endpoint configured for untagged heading semantics'],
            targetCategoryKey: 'heading_structure',
          }),
          changeStatus: 'skipped',
        });
      } else {
        const untag = await applySemanticUntaggedHeadingRepairs({
          buffer: outBuffer,
          filename,
          analysis: outAfter,
          snapshot: outSnapshot,
          options: { timeoutMs: untaggedTimeout, signal: remediationSignal },
        });
        outBuffer = untag.buffer;
        outAfter = untag.analysis;
        outSnapshot = untag.snapshot;
        semanticUntaggedHeadingsSummary = untag.summary;
      }
    }

    if ([
      semanticSummary,
      semanticHeadingsSummary,
      semanticPromoteHeadingsSummary,
      semanticUntaggedHeadingsSummary,
    ].some(summary => summary?.changeStatus === 'applied')) {
      await runPostRemediationAltPhase('nested_alt_cleanup_post_semantic');
    }

    const trustAdjusted = enforceSemanticTrust({
      before: remediation.before,
      after: outAfter,
      summaries: [
        semanticSummary,
        semanticHeadingsSummary,
        semanticPromoteHeadingsSummary,
        semanticUntaggedHeadingsSummary,
      ],
    });
    outAfter = trustAdjusted.analysis;
    if (trustAdjusted.trustDowngraded) {
      if (semanticSummary?.changeStatus === 'applied') semanticSummary.trustDowngraded = true;
      if (semanticHeadingsSummary?.changeStatus === 'applied') semanticHeadingsSummary.trustDowngraded = true;
      if (semanticPromoteHeadingsSummary?.changeStatus === 'applied') semanticPromoteHeadingsSummary.trustDowngraded = true;
      if (semanticUntaggedHeadingsSummary?.changeStatus === 'applied') semanticUntaggedHeadingsSummary.trustDowngraded = true;
    }

    let readabilityReview: ReadabilityReviewSummary | undefined;
    if (parsedOptions.readabilityReview) {
      await reportProgress(97.2, 'Reviewing screen-reader readability');
      readabilityReview = await reviewRemediatedReadability({
        filename,
        analysis: outAfter,
        snapshot: outSnapshot,
        options: {
          timeoutMs: parsedOptions.readabilityReviewTimeoutMs,
          signal: remediationSignal,
        },
      });
    }

    const enc = encodePdfBase64(outBuffer);
    await reportProgress(98, 'Saving your fixed PDF');
    const totalDuration =
      deterministicDurationMs +
      (semanticSummary?.durationMs ?? 0) +
      (semanticHeadingsSummary?.durationMs ?? 0) +
      (semanticPromoteHeadingsSummary?.durationMs ?? 0) +
      (semanticUntaggedHeadingsSummary?.durationMs ?? 0) +
      (readabilityReview?.durationMs ?? 0);
    const semanticSummaries = [
      semanticSummary,
      semanticHeadingsSummary,
      semanticPromoteHeadingsSummary,
      semanticUntaggedHeadingsSummary,
    ].filter((summary): summary is SemanticRemediationSummary => summary != null);
    const runtimeSummary = mergeRuntimeSummary(
      deterministicRuntimeSummaries,
      outAfter.runtimeSummary,
      semanticSummaries,
    );

    const body: RemediationResult = {
      ...remediation,
      appliedTools: appliedToolsOut,
      rounds: roundsOut,
      after: outAfter,
      remediatedPdfBase64: enc.remediatedPdfBase64,
      remediatedPdfTooLarge: enc.remediatedPdfTooLarge,
      remediationDurationMs: totalDuration,
      improved: outAfter.scoreProfile.overallScore > remediation.before.scoreProfile.overallScore,
      ...(runtimeSummary ? { runtimeSummary } : {}),
      ...(buildRemediationOutcomeSummary({
        before: remediation.before,
        after: outAfter,
        appliedTools: appliedToolsOut,
        planningSummary: remediation.planningSummary,
      })
        ? {
            remediationOutcomeSummary: buildRemediationOutcomeSummary({
              before: remediation.before,
              after: outAfter,
              appliedTools: appliedToolsOut,
              planningSummary: remediation.planningSummary,
            }),
          }
        : {}),
      ...(semanticRequested && semanticSummary ? { semantic: semanticSummary } : {}),
      ...(semanticHeadingsRequested && semanticHeadingsSummary
        ? { semanticHeadings: semanticHeadingsSummary }
        : {}),
      ...(semanticPromoteHeadingsRequested && semanticPromoteHeadingsSummary
        ? { semanticPromoteHeadings: semanticPromoteHeadingsSummary }
        : {}),
      ...(semanticUntaggedHeadingsRequested && semanticUntaggedHeadingsSummary
        ? { semanticUntaggedHeadings: semanticUntaggedHeadingsSummary }
        : {}),
      ...(parsedOptions.readabilityReview && readabilityReview
        ? { readabilityReview }
        : {}),
    };

    logInfo({
      message: 'remediate_path_summary',
      requestId: res.locals.requestId,
      filename,
      score: outAfter.scoreProfile.overallScore,
      grade: outAfter.scoreProfile.grade,
      details: {
        beforeScore: remediation.before.scoreProfile.overallScore,
        deterministicScoreAfter: remediation.after.scoreProfile.overallScore,
        finalScoreAfter: outAfter.scoreProfile.overallScore,
        semantic: semanticSummary
          ? {
              skippedReason: semanticSummary.skippedReason,
              proposalsAccepted: semanticSummary.proposalsAccepted,
              proposalsRejected: semanticSummary.proposalsRejected,
              batches: semanticSummary.batches.length,
            }
          : null,
        semanticHeadings: semanticHeadingsSummary
          ? {
              skippedReason: semanticHeadingsSummary.skippedReason,
              proposalsAccepted: semanticHeadingsSummary.proposalsAccepted,
              proposalsRejected: semanticHeadingsSummary.proposalsRejected,
              batches: semanticHeadingsSummary.batches.length,
            }
          : null,
        semanticPromoteHeadings: semanticPromoteHeadingsSummary
          ? {
              skippedReason: semanticPromoteHeadingsSummary.skippedReason,
              proposalsAccepted: semanticPromoteHeadingsSummary.proposalsAccepted,
              proposalsRejected: semanticPromoteHeadingsSummary.proposalsRejected,
              batches: semanticPromoteHeadingsSummary.batches.length,
            }
          : null,
        semanticUntaggedHeadings: semanticUntaggedHeadingsSummary
          ? {
              skippedReason: semanticUntaggedHeadingsSummary.skippedReason,
              proposalsAccepted: semanticUntaggedHeadingsSummary.proposalsAccepted,
              proposalsRejected: semanticUntaggedHeadingsSummary.proposalsRejected,
              batches: semanticUntaggedHeadingsSummary.batches.length,
            }
          : null,
        readabilityReview: readabilityReview
          ? {
              status: readabilityReview.status,
              score: readabilityReview.score,
              confidence: readabilityReview.confidence,
              skippedReason: readabilityReview.skippedReason ?? null,
              findingCount: readabilityReview.findings.length,
            }
          : null,
      },
    });

    if (parsedOptions.htmlReport) {
      const html = generateHtmlReport(
        remediation.before,
        outAfter,
        appliedToolsOut,
        {
          includeBeforeAfter: parsedOptions.htmlReportIncludeBeforeAfter,
          includeFindingsDetail: parsedOptions.htmlReportIncludeFindingsDetail,
          includeAppliedTools: parsedOptions.htmlReportIncludeAppliedTools,
          ocrPipeline: remediation.ocrPipeline,
          planningSummary: remediation.planningSummary,
          structuralConfidenceGuard: remediation.structuralConfidenceGuard,
          remediationOutcomeSummary: body.remediationOutcomeSummary,
          semanticSummaries,
          readabilityReview,
          pacRuleEvidence: buildPacRuleEvidence(outSnapshot),
        },
      );
      const maxReport = 512 * 1024;
      body.htmlReport = html.length <= maxReport ? html : null;
    }

    if (semanticDebugLogEnabled()) {
      logInfo({
        message: 'remediate_semantic_debug',
        requestId: res.locals.requestId,
        details: {
          semantic: semanticSummary?.skippedReason,
          semanticHeadings: semanticHeadingsSummary?.skippedReason,
          semanticPromoteHeadings: semanticPromoteHeadingsSummary?.skippedReason,
          semanticUntaggedHeadings: semanticUntaggedHeadingsSummary?.skippedReason,
        },
      });
    }

    recordRemediation(Date.now() - routeStarted);
    if (progressJobId) {
      completeRemediationProgress(progressJobId, 'Your fixed PDF is ready.');
    }
    res.json(toApiRemediationResult(body));
  } catch (err: unknown) {
    const e = err as Error & { statusCode?: number };
    if (progressJobId) {
      failRemediationProgress(progressJobId, e.message || 'Remediation failed.');
    }
    if (remediationSignal.aborted || e.name === 'AbortError') {
      sendApiError(
        res,
        504,
        'REQUEST_TIMEOUT',
        'Remediation exceeded the per-PDF timeout budget.',
      );
      return;
    }
    if (e.statusCode === 429) {
      sendApiError(
        res,
        429,
        'SERVER_AT_CAPACITY',
        'Server is at capacity. Try again shortly.',
      );
      return;
    }
    logError({
      message: 'remediate_failed',
      requestId: res.locals.requestId,
      filename,
      error: e.message,
    });
    sendApiError(res, 500, 'INTERNAL_ERROR', 'Remediation failed. Check server logs.');
  } finally {
    req.removeListener('close', onClientClose);
    for (const db of transientLearningDbs.splice(0)) {
      try {
        db.close();
      } catch {
        // best-effort per-request in-memory store cleanup
      }
    }
    unlink(tempPath).catch(() => { /* temp file cleanup */ });
  }
});
