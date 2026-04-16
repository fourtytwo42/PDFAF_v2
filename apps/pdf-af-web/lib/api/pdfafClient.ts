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

