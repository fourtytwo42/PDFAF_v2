import { normalizeAnalyzePayload, normalizeAnalyzeResponse } from '../findings/normalize';
import type { AnalyzeSummary, RawAnalyzeResponse } from '../../types/analyze';
import type { RawRemediationResponse, RemediationSummary } from '../../types/remediation';
import type { ApiErrorShape, HealthSummary, RawHealthResponse } from '../../types/health';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function buildProxyHeaders(baseUrl: string): HeadersInit {
  return {
    'X-PDFAF-Base-Url': trimTrailingSlash(baseUrl),
  };
}

function mapHealthResponse(payload: RawHealthResponse): HealthSummary {
  return {
    status: payload.status,
    version: payload.version,
    port: payload.port,
    llmConfigured: Boolean(payload.dependencies?.llm?.configured),
    llmReachable: Boolean(payload.dependencies?.llm?.reachable),
    databaseOk: payload.dependencies?.database?.ok,
  };
}

async function parseError(response: Response): Promise<ApiErrorShape> {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return {
      message: `Request failed with HTTP ${response.status}.`,
      httpStatus: response.status,
    };
  }

  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    return {
      message:
        typeof record.error === 'string'
          ? record.error
          : `Request failed with HTTP ${response.status}.`,
      httpStatus: response.status,
      code: typeof record.code === 'string' ? record.code : undefined,
      requestId: typeof record.requestId === 'string' ? record.requestId : undefined,
    };
  }

  return {
    message: `Request failed with HTTP ${response.status}.`,
    httpStatus: response.status,
  };
}

function isSeverity(value: unknown): boolean {
  return value === 'critical' || value === 'moderate' || value === 'minor' || value === 'pass';
}

function isGrade(value: unknown): boolean {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D' || value === 'F';
}

function isPdfClass(value: unknown): boolean {
  return (
    value === 'native_tagged' ||
    value === 'native_untagged' ||
    value === 'scanned' ||
    value === 'mixed'
  );
}

function isRawAnalyzeResponse(payload: unknown): payload is RawAnalyzeResponse {
  if (!payload || typeof payload !== 'object') return false;

  const record = payload as Record<string, unknown>;

  return (
    typeof record.id === 'string' &&
    typeof record.timestamp === 'string' &&
    typeof record.filename === 'string' &&
    typeof record.pageCount === 'number' &&
    isPdfClass(record.pdfClass) &&
    typeof record.score === 'number' &&
    isGrade(record.grade) &&
    typeof record.analysisDurationMs === 'number' &&
    Array.isArray(record.categories) &&
    Array.isArray(record.findings) &&
    record.categories.every((category) => {
      if (!category || typeof category !== 'object') return false;
      const item = category as Record<string, unknown>;
      return (
        typeof item.key === 'string' &&
        typeof item.score === 'number' &&
        typeof item.weight === 'number' &&
        typeof item.applicable === 'boolean' &&
        isSeverity(item.severity) &&
        Array.isArray(item.findings)
      );
    }) &&
    record.findings.every((finding) => {
      if (!finding || typeof finding !== 'object') return false;
      const item = finding as Record<string, unknown>;
      return (
        typeof item.category === 'string' &&
        isSeverity(item.severity) &&
        typeof item.wcag === 'string' &&
        typeof item.message === 'string' &&
        (item.count === undefined || typeof item.count === 'number') &&
        (item.page === undefined || typeof item.page === 'number')
      );
    })
  );
}

function isAppliedToolArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((tool) => {
      if (!tool || typeof tool !== 'object') return false;
      const record = tool as Record<string, unknown>;
      return (
        typeof record.toolName === 'string' &&
        typeof record.stage === 'number' &&
        typeof record.round === 'number' &&
        typeof record.scoreBefore === 'number' &&
        typeof record.scoreAfter === 'number' &&
        typeof record.delta === 'number' &&
        (record.outcome === 'applied' ||
          record.outcome === 'no_effect' ||
          record.outcome === 'rejected' ||
          record.outcome === 'failed') &&
        (record.details === undefined || typeof record.details === 'string')
      );
    })
  );
}

function isRoundsArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((round) => {
      if (!round || typeof round !== 'object') return false;
      const record = round as Record<string, unknown>;
      return (
        typeof record.round === 'number' &&
        typeof record.scoreAfter === 'number' &&
        typeof record.improved === 'boolean' &&
        (record.source === undefined || record.source === 'planner' || record.source === 'playbook')
      );
    })
  );
}

function isSemanticSummary(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.skippedReason === 'string' &&
    typeof record.durationMs === 'number' &&
    typeof record.proposalsAccepted === 'number' &&
    typeof record.proposalsRejected === 'number' &&
    typeof record.scoreBefore === 'number' &&
    typeof record.scoreAfter === 'number' &&
    Array.isArray(record.batches)
  );
}

function isOcrPipelineSummary(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.applied === 'boolean' &&
    typeof record.attempted === 'boolean' &&
    typeof record.humanReviewRecommended === 'boolean' &&
    typeof record.guidance === 'string'
  );
}

function isRawRemediationResponse(payload: unknown): payload is RawRemediationResponse {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;

  return (
    isRawAnalyzeResponse(record.before) &&
    isRawAnalyzeResponse(record.after) &&
    (record.remediatedPdfBase64 === null || typeof record.remediatedPdfBase64 === 'string') &&
    typeof record.remediatedPdfTooLarge === 'boolean' &&
    isAppliedToolArray(record.appliedTools) &&
    isRoundsArray(record.rounds) &&
    typeof record.remediationDurationMs === 'number' &&
    typeof record.improved === 'boolean' &&
    (record.semantic === undefined || isSemanticSummary(record.semantic)) &&
    (record.semanticHeadings === undefined || isSemanticSummary(record.semanticHeadings)) &&
    (record.semanticPromoteHeadings === undefined || isSemanticSummary(record.semanticPromoteHeadings)) &&
    (record.semanticUntaggedHeadings === undefined || isSemanticSummary(record.semanticUntaggedHeadings)) &&
    (record.ocrPipeline === undefined || isOcrPipelineSummary(record.ocrPipeline))
  );
}

function normalizeRemediationResponse(payload: RawRemediationResponse): RemediationSummary {
  return {
    before: normalizeAnalyzePayload(payload.before as RawAnalyzeResponse),
    after: normalizeAnalyzePayload(payload.after as RawAnalyzeResponse),
    improved: payload.improved,
    appliedTools: payload.appliedTools,
    rounds: payload.rounds,
    remediationDurationMs: payload.remediationDurationMs,
    remediatedPdfTooLarge: payload.remediatedPdfTooLarge,
    ...(payload.semantic ? { semantic: payload.semantic } : {}),
    ...(payload.semanticHeadings ? { semanticHeadings: payload.semanticHeadings } : {}),
    ...(payload.semanticPromoteHeadings
      ? { semanticPromoteHeadings: payload.semanticPromoteHeadings }
      : {}),
    ...(payload.semanticUntaggedHeadings
      ? { semanticUntaggedHeadings: payload.semanticUntaggedHeadings }
      : {}),
    ...(payload.ocrPipeline ? { ocrPipeline: payload.ocrPipeline } : {}),
  };
}

export async function fetchHealthSummary(baseUrl: string): Promise<HealthSummary> {
  let response: Response;
  try {
    response = await fetch('/api/pdfaf/health', {
      headers: {
        Accept: 'application/json',
        ...buildProxyHeaders(baseUrl),
      },
      cache: 'no-store',
    });
  } catch {
    throw {
      message: 'Unable to reach the PDFAF API. Check the URL and server availability.',
    } satisfies ApiErrorShape;
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  let payload: RawHealthResponse;
  try {
    payload = (await response.json()) as RawHealthResponse;
  } catch {
    throw {
      message: 'The API returned an invalid health response.',
      httpStatus: response.status,
    } satisfies ApiErrorShape;
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.status !== 'string' ||
    typeof payload.version !== 'string' ||
    typeof payload.port !== 'number'
  ) {
    throw {
      message: 'The API returned a malformed health payload.',
      httpStatus: response.status,
    } satisfies ApiErrorShape;
  }

  return mapHealthResponse(payload);
}

export async function analyzePdf(
  baseUrl: string,
  file: File | Blob,
  fileName: string,
): Promise<AnalyzeSummary> {
  const formData = new FormData();
  formData.append('file', file, fileName);

  let response: Response;
  try {
    response = await fetch('/api/pdfaf/analyze', {
      method: 'POST',
      body: formData,
      headers: buildProxyHeaders(baseUrl),
      cache: 'no-store',
    });
  } catch {
    throw {
      message: 'Unable to reach the PDFAF API for analysis. Check the URL and server availability.',
    } satisfies ApiErrorShape;
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw {
      message: 'The API returned an invalid analysis response.',
      httpStatus: response.status,
    } satisfies ApiErrorShape;
  }

  if (!isRawAnalyzeResponse(payload)) {
    throw {
      message: 'The API returned a malformed analysis payload.',
      httpStatus: response.status,
    } satisfies ApiErrorShape;
  }

  return normalizeAnalyzeResponse(payload);
}

export async function remediatePdf(
  baseUrl: string,
  file: File | Blob,
  fileName: string,
): Promise<{ summary: RemediationSummary; remediatedPdfBase64: string | null }> {
  const formData = new FormData();
  formData.append('file', file, fileName);

  let response: Response;
  try {
    response = await fetch('/api/pdfaf/remediate', {
      method: 'POST',
      body: formData,
      headers: buildProxyHeaders(baseUrl),
      cache: 'no-store',
    });
  } catch {
    throw {
      message: 'Unable to reach the PDFAF API for remediation. Check the URL and server availability.',
    } satisfies ApiErrorShape;
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw {
      message: 'The API returned an invalid remediation response.',
      httpStatus: response.status,
    } satisfies ApiErrorShape;
  }

  if (!isRawRemediationResponse(payload)) {
    throw {
      message: 'The API returned a malformed remediation payload.',
      httpStatus: response.status,
    } satisfies ApiErrorShape;
  }

  return {
    summary: normalizeRemediationResponse(payload),
    remediatedPdfBase64: payload.remediatedPdfBase64,
  };
}
