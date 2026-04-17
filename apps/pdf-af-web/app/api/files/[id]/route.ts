import { NextResponse, type NextRequest } from 'next/server';
import {
  deleteStoredFile,
  ensureServerStorageReady,
  getStoredFile,
} from '../../../../lib/server/fileStore';
import { resolveSession } from '../../../../lib/server/session';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  await ensureServerStorageReady();
  const session = resolveSession(request);
  const { id } = await context.params;
  const file = await getStoredFile(session.sessionId, id);

  const response = file
    ? NextResponse.json({ file }, { status: 200 })
    : NextResponse.json({ error: 'File not found.', code: 'NOT_FOUND' }, { status: 404 });

  session.apply(response);
  return response;
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  await ensureServerStorageReady();
  const session = resolveSession(request);
  const { id } = await context.params;
  const deleted = await deleteStoredFile(session.sessionId, id);

  const response = deleted
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json({ error: 'File not found.', code: 'NOT_FOUND' }, { status: 404 });

  session.apply(response);
  return response;
}
