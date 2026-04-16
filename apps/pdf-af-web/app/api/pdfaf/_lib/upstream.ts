import { NextResponse, type NextRequest } from 'next/server';

const BASE_URL_HEADER = 'x-pdfaf-base-url';

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message, code: 'BAD_REQUEST' }, { status: 400 });
}

export function resolveUpstreamBaseUrl(request: NextRequest): string | NextResponse {
  const baseUrl = request.headers.get(BASE_URL_HEADER)?.trim();
  if (!baseUrl) {
    return badRequest('Missing PDFAF API base URL.');
  }

  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return badRequest('PDFAF API base URL must use http or https.');
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
