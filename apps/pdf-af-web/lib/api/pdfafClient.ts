import { normalizeAnalyzeResponse } from '../findings/normalize';
import type { AnalyzeSummary, RawAnalyzeResponse } from '../../types/analyze';
import type { ApiErrorShape, HealthSummary, RawHealthResponse } from '../../types/health';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
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

export async function fetchHealthSummary(baseUrl: string): Promise<HealthSummary> {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  let response: Response;
  try {
    response = await fetch(`${normalizedBaseUrl}/v1/health`, {
      headers: { Accept: 'application/json' },
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
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  const formData = new FormData();
  formData.append('file', file, fileName);

  let response: Response;
  try {
    response = await fetch(`${normalizedBaseUrl}/v1/analyze`, {
      method: 'POST',
      body: formData,
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
