import type { AnalyzeSummary, NormalizedFinding } from './analyze';
import type { RemediationSummary } from './remediation';

export type JobStatus =
  | 'idle'
  | 'queued_analyze'
  | 'queued_remediate'
  | 'uploading'
  | 'analyzing'
  | 'remediating'
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
  processingStartedAt?: string;
  status: JobStatus;
  mode: JobMode;
  errorMessage?: string;
  originalBlobKey: string;
  remediatedBlobKey?: string;
  analyzeResult?: AnalyzeSummary;
  remediationResult?: RemediationSummary;
  findingSummaries?: NormalizedFinding[];
}

export interface FileBlobRecord {
  blobKey: string;
  jobId: string;
  kind: 'original' | 'remediated';
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
