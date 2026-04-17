import { Router, type IRouter } from 'express';
import multer from 'multer';
import { unlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  getDefaultRemediateSemanticOptions,
  getOpenAiCompatBaseUrl,
  MAX_FILE_SIZE_MB,
  REMEDIATION_MAX_BASE64_MB,
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
import { applyPostRemediationAltRepair } from '../services/remediation/altStructureRepair.js';
import { applySemanticRepairs } from '../services/semantic/semanticService.js';
import { applySemanticHeadingRepairs } from '../services/semantic/headingSemantic.js';
import { applySemanticPromoteHeadingRepairs } from '../services/semantic/promoteHeadingSemantic.js';
import { applySemanticUntaggedHeadingRepairs } from '../services/semantic/untaggedHeadingSemantic.js';
import { remediateOptionsSchema, type ParsedRemediateOptions } from '../schemas/remediateOptions.js';
import { generateHtmlReport } from '../services/reporter/htmlReport.js';
import type { RemediationResult, SemanticRemediationSummary } from '../types.js';

/** Merge per-pass semantic summaries (same buffer evolved); `scoreBefore` is the block start score. */
export function mergeSequentialSemanticSummaries(
  scoreBeforeBlock: number,
  parts: SemanticRemediationSummary[],
): SemanticRemediationSummary {
  if (parts.length === 0) {
    return {
      skippedReason: 'completed_no_changes',
      durationMs: 0,
      proposalsAccepted: 0,
      proposalsRejected: 0,
      scoreBefore: scoreBeforeBlock,
      scoreAfter: scoreBeforeBlock,
      batches: [],
    };
  }
  const fatal = parts.find(p =>
    ['error', 'llm_timeout', 'regression_reverted', 'unsupported_pdf'].includes(p.skippedReason),
  );
  const last = parts[parts.length - 1]!;
  const skippedReason = fatal?.skippedReason ?? last.skippedReason;
  return {
    skippedReason,
    durationMs: parts.reduce((s, p) => s + p.durationMs, 0),
    proposalsAccepted: parts.reduce((s, p) => s + p.proposalsAccepted, 0),
    proposalsRejected: parts.reduce((s, p) => s + p.proposalsRejected, 0),
    scoreBefore: scoreBeforeBlock,
    scoreAfter: last.scoreAfter,
    batches: parts.flatMap(p => p.batches),
    ...(fatal?.errorMessage ? { errorMessage: fatal.errorMessage } : {}),
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
    startRemediationProgress(progressJobId, 'Uploading file', 4, filename);
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
    ...parsedOptions,
  };

  const semanticAbort = new AbortController();
  const onClientClose = () => semanticAbort.abort();
  req.on('close', onClientClose);

  const routeStarted = Date.now();

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
        targetScore: parsedOptions.targetScore ?? null,
        maxRounds: parsedOptions.maxRounds ?? null,
        llmConfigured: Boolean(getOpenAiCompatBaseUrl()),
      },
    });

    await reportProgress(10, 'Analyzing source PDF', filename);
    const { result, snapshot } = await analyzePdf(tempPath, filename);
    const buffer = await readFile(tempPath);
    await reportProgress(18, 'Planning fixes');
    const { remediation, buffer: detBuffer, snapshot: detSnapshot } = await remediatePdf(
      buffer,
      filename,
      result,
      snapshot,
      {
        targetScore: parsedOptions.targetScore,
        maxRounds: parsedOptions.maxRounds,
        onProgress: update => reportProgress(update.percent, update.stage, update.detail),
      },
    );

    let outBuffer = detBuffer;
    let outAfter = remediation.after;
    let outSnapshot = detSnapshot;
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
      await reportProgress(92, 'Running figure AI');
      const scoreRef = remediation.after.score;
      if (!getOpenAiCompatBaseUrl()) {
        semanticSummary = {
          skippedReason: 'no_llm_config',
          durationMs: 0,
          proposalsAccepted: 0,
          proposalsRejected: 0,
          scoreBefore: scoreRef,
          scoreAfter: scoreRef,
          batches: [],
        };
      } else {
        const figureParts: SemanticRemediationSummary[] = [];
        for (let pass = 0; pass < SEMANTIC_REMEDIATE_FIGURE_PASSES; pass++) {
          await reportProgress(
            92 + (((pass + 0.2) / Math.max(1, SEMANTIC_REMEDIATE_FIGURE_PASSES)) * 2),
            'Running figure AI',
            `Pass ${pass + 1} of ${SEMANTIC_REMEDIATE_FIGURE_PASSES}`,
          );
          const sem = await applySemanticRepairs({
            buffer: outBuffer,
            filename,
            analysis: outAfter,
            snapshot: outSnapshot,
            options: {
              timeoutMs: figureTimeout,
              signal: semanticAbort.signal,
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
      await reportProgress(94, 'Running heading AI');
      const scoreRef = outAfter.score;
      if (!getOpenAiCompatBaseUrl()) {
        semanticPromoteHeadingsSummary = {
          skippedReason: 'no_llm_config',
          durationMs: 0,
          proposalsAccepted: 0,
          proposalsRejected: 0,
          scoreBefore: scoreRef,
          scoreAfter: scoreRef,
          batches: [],
        };
      } else {
        const promoteParts: SemanticRemediationSummary[] = [];
        for (let pass = 0; pass < SEMANTIC_REMEDIATE_PROMOTE_PASSES; pass++) {
          await reportProgress(
            94 + (((pass + 0.2) / Math.max(1, SEMANTIC_REMEDIATE_PROMOTE_PASSES)) * 1.5),
            'Running heading AI',
            `Promote pass ${pass + 1} of ${SEMANTIC_REMEDIATE_PROMOTE_PASSES}`,
          );
          const promote = await applySemanticPromoteHeadingRepairs({
            buffer: outBuffer,
            filename,
            analysis: outAfter,
            snapshot: outSnapshot,
            options: { timeoutMs: promoteTimeout, signal: semanticAbort.signal },
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
      await reportProgress(95.5, 'Tuning heading levels');
      const scoreRef = outAfter.score;
      if (!getOpenAiCompatBaseUrl()) {
        semanticHeadingsSummary = {
          skippedReason: 'no_llm_config',
          durationMs: 0,
          proposalsAccepted: 0,
          proposalsRejected: 0,
          scoreBefore: scoreRef,
          scoreAfter: scoreRef,
          batches: [],
        };
      } else {
        const head = await applySemanticHeadingRepairs({
          buffer: outBuffer,
          filename,
          analysis: outAfter,
          snapshot: outSnapshot,
          options: { timeoutMs: headingTimeout, signal: semanticAbort.signal },
        });
        outBuffer = head.buffer;
        outAfter = head.analysis;
        outSnapshot = head.snapshot;
        semanticHeadingsSummary = head.summary;
      }
    }

    if (semanticUntaggedHeadingsRequested) {
      await reportProgress(96.5, 'Tagging missing headings');
      const scoreRef = outAfter.score;
      if (!getOpenAiCompatBaseUrl()) {
        semanticUntaggedHeadingsSummary = {
          skippedReason: 'no_llm_config',
          durationMs: 0,
          proposalsAccepted: 0,
          proposalsRejected: 0,
          scoreBefore: scoreRef,
          scoreAfter: scoreRef,
          batches: [],
        };
      } else {
        const untag = await applySemanticUntaggedHeadingRepairs({
          buffer: outBuffer,
          filename,
          analysis: outAfter,
          snapshot: outSnapshot,
          options: { timeoutMs: untaggedTimeout, signal: semanticAbort.signal },
        });
        outBuffer = untag.buffer;
        outAfter = untag.analysis;
        outSnapshot = untag.snapshot;
        semanticUntaggedHeadingsSummary = untag.summary;
      }
    }

    let appliedToolsOut = remediation.appliedTools;
    if (outSnapshot.isTagged) {
      const scoreBeforeAltFix = outAfter.score;
      const ar = await applyPostRemediationAltRepair(outBuffer, filename, outAfter, outSnapshot, {
        signal: semanticAbort.signal,
      });
      if (!ar.buffer.equals(outBuffer)) {
        outBuffer = ar.buffer;
        outAfter = ar.analysis;
        outSnapshot = ar.snapshot;
        appliedToolsOut = [
          ...remediation.appliedTools,
          {
            toolName: 'repair_alt_text_structure',
            stage: 9,
            round: remediation.rounds[remediation.rounds.length - 1]?.round ?? 1,
            scoreBefore: scoreBeforeAltFix,
            scoreAfter: outAfter.score,
            delta: outAfter.score - scoreBeforeAltFix,
            outcome: 'applied' as const,
            details: 'nested_alt_cleanup_post_semantic',
          },
        ];
      }
    }

    const enc = encodePdfBase64(outBuffer);
    await reportProgress(98, 'Saving fixed PDF');
    const totalDuration =
      remediation.remediationDurationMs +
      (semanticSummary?.durationMs ?? 0) +
      (semanticHeadingsSummary?.durationMs ?? 0) +
      (semanticPromoteHeadingsSummary?.durationMs ?? 0) +
      (semanticUntaggedHeadingsSummary?.durationMs ?? 0);

    const body: RemediationResult = {
      ...remediation,
      appliedTools: appliedToolsOut,
      after: outAfter,
      remediatedPdfBase64: enc.remediatedPdfBase64,
      remediatedPdfTooLarge: enc.remediatedPdfTooLarge,
      remediationDurationMs: totalDuration,
      improved: outAfter.score > remediation.before.score,
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
    };

    logInfo({
      message: 'remediate_path_summary',
      requestId: res.locals.requestId,
      filename,
      score: outAfter.score,
      grade: outAfter.grade,
      details: {
        beforeScore: remediation.before.score,
        deterministicScoreAfter: remediation.after.score,
        finalScoreAfter: outAfter.score,
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
      completeRemediationProgress(progressJobId, 'Fixed PDF is ready.');
    }
    res.json(body);
  } catch (err: unknown) {
    const e = err as Error & { statusCode?: number };
    if (progressJobId) {
      failRemediationProgress(progressJobId, e.message || 'Remediation failed.');
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
    unlink(tempPath).catch(() => { /* temp file cleanup */ });
  }
});
