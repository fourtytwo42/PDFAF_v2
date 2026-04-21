import type { StoredFileSummary } from '../../types/files';
import type { RemediationProgress } from '../../types/progress';

function errorMessage(message: string): Error {
  return new Error(message);
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!payload) {
    throw errorMessage('The server returned an invalid response.');
  }
  return payload;
}

async function parseError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return errorMessage(payload?.error || `Request failed with HTTP ${response.status}.`);
}

export async function listFiles(): Promise<StoredFileSummary[]> {
  const response = await fetch('/api/files', { cache: 'no-store' });
  if (!response.ok) {
    throw await parseError(response);
  }

  const payload = await parseJson<{ files: StoredFileSummary[] }>(response);
  return payload.files;
}

export async function uploadForAnalyze(file: File): Promise<StoredFileSummary> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch('/api/files?action=analyze', {
    method: 'POST',
    body: formData,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const payload = await parseJson<{ file: StoredFileSummary }>(response);
  return payload.file;
}

export async function uploadForRemediation(
  file: File,
  progressJobId?: string,
): Promise<StoredFileSummary> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch('/api/files?action=remediate', {
    method: 'POST',
    body: formData,
    headers: progressJobId ? { 'x-pdfaf-progress-job-id': progressJobId } : undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const payload = await parseJson<{ file: StoredFileSummary }>(response);
  return payload.file;
}

export async function remediateStoredFile(
  fileId: string,
  progressJobId?: string,
): Promise<StoredFileSummary> {
  const response = await fetch('/api/files?action=remediate', {
    method: 'POST',
    body: JSON.stringify({ fileId }),
    headers: {
      'Content-Type': 'application/json',
      ...(progressJobId ? { 'x-pdfaf-progress-job-id': progressJobId } : {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const payload = await parseJson<{ file: StoredFileSummary }>(response);
  return payload.file;
}

export async function getRemediationProgress(jobId: string): Promise<RemediationProgress | null> {
  const response = await fetch(`/api/files/progress/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  return await parseJson<RemediationProgress>(response);
}

export async function deleteFile(fileId: string): Promise<void> {
  const response = await fetch(`/api/files/${fileId}`, {
    method: 'DELETE',
    cache: 'no-store',
  });

  if (response.status === 204) return;
  throw await parseError(response);
}

export async function downloadFile(fileId: string): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(`/api/files/${fileId}/download`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/i);
  const fileName = match?.[1] || 'download.pdf';
  const blob = await response.blob();
  return { blob, fileName };
}

export async function downloadSourceFile(fileId: string): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(`/api/files/${fileId}/source`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/i);
  const fileName = match?.[1] || 'source.pdf';
  const blob = await response.blob();
  return { blob, fileName };
}
