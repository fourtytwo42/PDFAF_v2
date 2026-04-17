import { NextResponse, type NextRequest } from 'next/server';
import { proxyJsonGet } from '../../../pdfaf/_lib/upstream';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { error: 'Missing remediation progress job id.', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  return proxyJsonGet(request, `/v1/remediate/progress/${encodeURIComponent(id)}`);
}
