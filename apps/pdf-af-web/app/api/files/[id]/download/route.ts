import { NextResponse, type NextRequest } from 'next/server';
import {
  ensureServerStorageReady,
  readDownloadFile,
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
  const download = await readDownloadFile(session.sessionId, id);

  const response = download
    ? new NextResponse(new Uint8Array(download.bytes), {
        status: 200,
        headers: {
          'Content-Type': download.mimeType || 'application/pdf',
          'Content-Disposition': `attachment; filename="${quotedFileName(download.fileName)}"`,
          'Cache-Control': 'no-store',
        },
      })
    : NextResponse.json(
        { error: 'File is no longer available for download.', code: 'NOT_AVAILABLE' },
        { status: 404 },
      );

  session.apply(response);
  return response;
}
