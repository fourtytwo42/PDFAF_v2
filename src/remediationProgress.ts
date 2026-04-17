type ProgressStatus = 'running' | 'completed' | 'failed';

export interface RemediationProgressSnapshot {
  jobId: string;
  status: ProgressStatus;
  percent: number;
  stage: string;
  detail?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

interface ProgressRecord extends RemediationProgressSnapshot {
  expiresAtMs: number;
}

const PROGRESS_TTL_MS = 10 * 60 * 1000;
const progressByJobId = new Map<string, ProgressRecord>();

function nowIso(): string {
  return new Date().toISOString();
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function purgeExpired() {
  const now = Date.now();
  for (const [jobId, record] of progressByJobId.entries()) {
    if (record.expiresAtMs <= now) {
      progressByJobId.delete(jobId);
    }
  }
}

function toSnapshot(record: ProgressRecord): RemediationProgressSnapshot {
  const { expiresAtMs: _expiresAtMs, ...snapshot } = record;
  return snapshot;
}

export function startRemediationProgress(jobId: string, stage: string, percent: number, detail?: string) {
  purgeExpired();
  const timestamp = nowIso();
  progressByJobId.set(jobId, {
    jobId,
    status: 'running',
    percent: clampPercent(percent),
    stage,
    detail,
    startedAt: timestamp,
    updatedAt: timestamp,
    expiresAtMs: Date.now() + PROGRESS_TTL_MS,
  });
}

export function updateRemediationProgress(jobId: string, stage: string, percent: number, detail?: string) {
  purgeExpired();
  const existing = progressByJobId.get(jobId);
  if (!existing) {
    startRemediationProgress(jobId, stage, percent, detail);
    return;
  }

  const timestamp = nowIso();
  progressByJobId.set(jobId, {
    ...existing,
    status: 'running',
    percent: Math.max(existing.percent, clampPercent(percent)),
    stage,
    detail,
    updatedAt: timestamp,
    completedAt: undefined,
    errorMessage: undefined,
    expiresAtMs: Date.now() + PROGRESS_TTL_MS,
  });
}

export function completeRemediationProgress(jobId: string, detail?: string) {
  purgeExpired();
  const existing = progressByJobId.get(jobId);
  const timestamp = nowIso();
  progressByJobId.set(jobId, {
    jobId,
    status: 'completed',
    percent: 100,
    stage: 'Ready',
    detail,
    startedAt: existing?.startedAt ?? timestamp,
    updatedAt: timestamp,
    completedAt: timestamp,
    expiresAtMs: Date.now() + PROGRESS_TTL_MS,
  });
}

export function failRemediationProgress(jobId: string, errorMessage: string) {
  purgeExpired();
  const existing = progressByJobId.get(jobId);
  const timestamp = nowIso();
  progressByJobId.set(jobId, {
    jobId,
    status: 'failed',
    percent: existing?.percent ?? 0,
    stage: 'Failed',
    detail: existing?.detail,
    startedAt: existing?.startedAt ?? timestamp,
    updatedAt: timestamp,
    completedAt: timestamp,
    errorMessage,
    expiresAtMs: Date.now() + PROGRESS_TTL_MS,
  });
}

export function getRemediationProgress(jobId: string): RemediationProgressSnapshot | null {
  purgeExpired();
  const record = progressByJobId.get(jobId);
  return record ? toSnapshot(record) : null;
}
