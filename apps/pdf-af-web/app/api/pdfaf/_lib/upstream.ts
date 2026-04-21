import { NextResponse, type NextRequest } from 'next/server';

const BASE_URL_HEADER = 'x-pdfaf-base-url';
const FALLBACK_API_BASE_URL = 'http://localhost:6200';

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message, code: 'BAD_REQUEST' }, { status: 400 });
}

function configuredApiBaseUrl(): string | null {
  return (
    process.env.PDFAF_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_PDFAF_API_BASE_URL?.trim() ||
    FALLBACK_API_BASE_URL
  );
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function configuredNonLoopbackBaseUrl(): string | null {
  const configured = configuredApiBaseUrl();
  if (!configured) return null;

  try {
    const parsed = new URL(configured);
    return isLoopbackHost(parsed.hostname) ? null : parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function resolveUpstreamBaseUrl(request: NextRequest): string | NextResponse {
  const baseUrl = request.headers.get(BASE_URL_HEADER)?.trim() || configuredApiBaseUrl();
  if (!baseUrl) {
    return badRequest('Missing PDFAF API base URL.');
  }

  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return badRequest('PDFAF API base URL must use http or https.');
    }

    const configuredNonLoopback = configuredNonLoopbackBaseUrl();
    if (configuredNonLoopback && isLoopbackHost(parsed.hostname)) {
      return configuredNonLoopback;
    }

    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return badRequest('Invalid PDFAF API base URL.');
  }
}

export async function proxyJsonGet(request: NextRequest, path: string): Promise<NextResponse> {
  const baseUrl = resolveUpstreamBaseUrl(request);
  if (baseUrl instanceof NextResponse) {
    return baseUrl;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach the PDFAF API from the web server.', code: 'UPSTREAM_UNREACHABLE' },
      { status: 502 },
    );
  }

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
      'X-Request-Id': upstream.headers.get('x-request-id') ?? '',
      'Cache-Control': 'no-store',
    },
  });
}

export async function proxyMultipartPost(
  request: NextRequest,
  path: string,
): Promise<NextResponse> {
  const baseUrl = resolveUpstreamBaseUrl(request);
  if (baseUrl instanceof NextResponse) {
    return baseUrl;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return badRequest('Invalid multipart form data.');
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      body: formData,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach the PDFAF API from the web server.', code: 'UPSTREAM_UNREACHABLE' },
      { status: 502 },
    );
  }

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
      'X-Request-Id': upstream.headers.get('x-request-id') ?? '',
      'Cache-Control': 'no-store',
    },
  });
}
