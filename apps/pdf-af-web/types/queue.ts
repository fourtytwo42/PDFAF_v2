import type { AnalyzeSummary, NormalizedFinding } from './analyze';

export type JobStatus =
  | 'idle'
  | 'queued_analyze'
  | 'uploading'
  | 'analyzing'
  | 'done'
  | 'failed';

export type JobMode = null | 'grade' | 'remediate';

export interface JobRecord {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  mode: JobMode;
  errorMessage?: string;
  originalBlobKey: string;
  analyzeResult?: AnalyzeSummary;
  remediationResult?: unknown;
  findingSummaries?: NormalizedFinding[];
}

export interface FileBlobRecord {
  blobKey: string;
  jobId: string;
  kind: 'original';
  fileName: string;
  mimeType: string;
  blob: Blob;
}

export interface FileValidationMessage {
  id: string;
  fileName: string;
  message: string;
}

export type QueueStorageState = 'ready' | 'loading' | 'unavailable' | 'error';
