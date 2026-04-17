export type RemediationProgressStatus = 'running' | 'completed' | 'failed';

export interface RemediationProgress {
  jobId: string;
  status: RemediationProgressStatus;
  percent: number;
  stage: string;
  detail?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
}
