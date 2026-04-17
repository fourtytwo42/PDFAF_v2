import type { AnalyzeSummary, NormalizedFinding } from './analyze';
import type { StoredDeletionReason, StoredFileStatus } from './files';
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
  analyzeResult?: AnalyzeSummary;
  remediationResult?: RemediationSummary;
  findingSummaries?: NormalizedFinding[];
  fileStatus: StoredFileStatus;
  storedFileName?: string | null;
  storedSizeBytes?: number | null;
  hasServerSource: boolean;
  expiresAt?: string | null;
  deletedAt?: string | null;
  deletionReason?: StoredDeletionReason;
  localFile?: File;
  persisted: boolean;
}

export interface FileValidationMessage {
  id: string;
  fileName: string;
  message: string;
}

export type QueueStorageState = 'ready' | 'loading' | 'error';
