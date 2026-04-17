import type { AnalyzeSummary, NormalizedFinding } from './analyze';
import type { RemediationSummary } from './remediation';
import type { JobMode, JobStatus } from './queue';

export type StoredFileStatus = 'none' | 'available' | 'expired' | 'quota_deleted' | 'failed';

export type StoredDeletionReason = 'expired' | 'quota' | null;

export interface StoredFileRecord {
  id: string;
  sessionId: string;
  fileName: string;
  storedFileName?: string | null;
  storagePath?: string | null;
  fileSize: number;
  storedSizeBytes?: number | null;
  mimeType: string;
  status: JobStatus;
  mode: JobMode;
  errorMessage?: string | null;
  fileStatus: StoredFileStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
  deletedAt?: string | null;
  deletionReason?: StoredDeletionReason;
  analyzeResult?: AnalyzeSummary;
  remediationResult?: RemediationSummary;
  findingSummaries?: NormalizedFinding[];
}

export interface StoredFileSummary extends Omit<StoredFileRecord, 'sessionId' | 'storagePath'> {}

export interface FileListResponse {
  files: StoredFileSummary[];
}

export interface FileMutationResponse {
  file: StoredFileSummary;
}
