import { NextResponse, type NextRequest } from 'next/server';
import {
  ensureServerStorageReady,
  readSourceFile,
} from '../../../../../lib/server/fileStore';
import { resolveSession } from '../../../../../lib/server/session';

function quotedFileName(value: string): string {
  return value.replace(/"/g, '');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  await ensureServerStorageReady();
  const session = resolveSession(request);
  const { id } = await context.params;
  const source = await readSourceFile(session.sessionId, id);

  const response = source
    ? new NextResponse(new Uint8Array(source.bytes), {
        status: 200,
        headers: {
          'Content-Type': source.mimeType || 'application/pdf',
          'Content-Disposition': `attachment; filename="${quotedFileName(source.fileName)}"`,
          'Cache-Control': 'no-store',
        },
      })
    : NextResponse.json(
        { error: 'Source PDF is no longer available for editing.', code: 'NOT_AVAILABLE' },
        { status: 404 },
      );

  session.apply(response);
  return response;
}
