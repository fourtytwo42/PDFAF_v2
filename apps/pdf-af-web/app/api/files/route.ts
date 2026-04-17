import { NextResponse, type NextRequest } from 'next/server';
import {
  createAnalyzeRecord,
  createRemediationRecord,
  ensureServerStorageReady,
  listStoredFiles,
  wrapFileMutationResponse,
} from '../../../lib/server/fileStore';
import { resolveSession } from '../../../lib/server/session';

function badRequest(message: string) {
  return NextResponse.json({ error: message, code: 'BAD_REQUEST' }, { status: 400 });
}

async function parseFileUpload(request: NextRequest): Promise<File | null> {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    return file instanceof File ? file : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  await ensureServerStorageReady();
  const session = resolveSession(request);
  const files = await listStoredFiles(session.sessionId);
  const response = NextResponse.json({ files }, { status: 200 });
  session.apply(response);
  return response;
}

export async function POST(request: NextRequest) {
  await ensureServerStorageReady();
  const session = resolveSession(request);
  const action = request.nextUrl.searchParams.get('action');

  if (action !== 'analyze' && action !== 'remediate') {
    const response = badRequest('Expected ?action=analyze or ?action=remediate.');
    session.apply(response);
    return response;
  }

  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => null)) as { fileId?: string } | null;
    if (!body?.fileId || action !== 'remediate') {
      const response = badRequest('Only remediation supports a saved file id.');
      session.apply(response);
      return response;
    }

    const file = await createRemediationRecord({
      sessionId: session.sessionId,
      fileId: body.fileId,
    });

    const response = NextResponse.json(wrapFileMutationResponse(file), { status: 200 });
    session.apply(response);
    return response;
  }

  const file = await parseFileUpload(request);
  if (!file) {
    const response = badRequest('Expected multipart form upload with a PDF file.');
    session.apply(response);
    return response;
  }

  const result =
    action === 'analyze'
      ? await createAnalyzeRecord(session.sessionId, file)
      : await createRemediationRecord({ sessionId: session.sessionId, file });

  const response = NextResponse.json(wrapFileMutationResponse(result), { status: 200 });
  session.apply(response);
  return response;
}
