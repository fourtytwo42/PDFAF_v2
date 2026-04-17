'use client';

import { useEffect, useState } from 'react';
import {
  DownloadIcon,
  FileIcon,
  InfoIcon,
  MagicIcon,
  TrashIcon,
} from '../common/AppIcons';
import { Button } from '../common/Button';
import { SectionCard } from '../common/SectionCard';
import { StatusPill } from '../common/StatusPill';
import {
  formatFileSize,
  formatJobTimestamp,
  formatPdfClass,
  formatScoreGrade,
} from '../../lib/format/formatters';
import { useQueueStore } from '../../stores/queue';
import type { JobRecord } from '../../types/queue';
import { BatchActionBar } from './BatchActionBar';
import { QueueDetailDrawer } from './QueueDetailDrawer';

function formatFriendlyStatus(job: JobRecord): string {
  switch (job.status) {
    case 'idle':
      return 'Ready';
    case 'queued_analyze':
      return 'Waiting to check';
    case 'queued_remediate':
      return 'Waiting to fix';
    case 'uploading':
      return 'Sending file';
    case 'analyzing':
      return 'Checking file';
    case 'remediating':
      return 'Fixing file';
    case 'done':
      return job.remediationResult ? 'Fixed' : 'Checked';
    case 'failed':
      return 'Needs retry';
    default:
      return job.status;
  }
}

function formatFindingsSummary(job: JobRecord): string {
  if (!job.findingSummaries || job.findingSummaries.length === 0) {
    return job.analyzeResult ? 'No big problems found' : 'No results yet';
  }

  return job.findingSummaries
    .slice(0, 2)
    .map((finding) => finding.title)
    .join(' · ');
}

function getDisplaySummary(job: JobRecord) {
  return job.remediationResult?.after ?? job.analyzeResult;
}

function getPrimaryDownloadAction(job: JobRecord) {
  return job.fileStatus === 'available' ? 'fixed' : 'none';
}

function getGradeTone(grade: string) {
  switch (grade) {
    case 'A':
      return 'border-[color:rgba(22,163,74,0.18)] bg-[color:rgba(22,163,74,0.1)] text-[var(--success)]';
    case 'B':
      return 'border-[color:rgba(34,197,94,0.18)] bg-[color:rgba(34,197,94,0.08)] text-[#15803d]';
    case 'C':
      return 'border-[color:rgba(234,179,8,0.18)] bg-[color:rgba(234,179,8,0.08)] text-[#a16207]';
    case 'D':
      return 'border-[color:rgba(249,115,22,0.18)] bg-[color:rgba(249,115,22,0.08)] text-[#c2410c]';
    case 'F':
    default:
      return 'border-[color:rgba(220,38,38,0.18)] bg-[color:rgba(220,38,38,0.08)] text-[var(--danger)]';
  }
}

function GradeBadge({ score, grade }: { score: number; grade: string }) {
  return (
    <div className={`rounded-2xl border px-3 py-2 ${getGradeTone(grade)}`}>
      <p className="text-lg font-semibold leading-none">{grade}</p>
      <p className="mt-1 text-xs font-medium">{score}</p>
    </div>
  );
}

function isProcessing(job: JobRecord): boolean {
  return (
    job.status === 'queued_analyze' ||
    job.status === 'queued_remediate' ||
    job.status === 'uploading' ||
    job.status === 'analyzing' ||
    job.status === 'remediating'
  );
}

function formatElapsed(valueMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function ProcessingTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return null;

  return <span>{formatElapsed(now - start)}</span>;
}

function RemediationProgressBar({
  percent,
  label,
  detail,
}: {
  percent: number;
  label: string;
  detail?: string;
}) {
  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className="mt-3 rounded-2xl border border-[color:var(--surface-border)] bg-white px-3 py-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-[var(--foreground)]">{label}</span>
        <span className="font-semibold text-[var(--accent-strong)]">{clampedPercent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--accent-soft)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{detail}</p>
      ) : null}
    </div>
  );
}

function getCompletedDuration(job: JobRecord): string | null {
  if (job.remediationResult?.remediationDurationMs) {
    return formatElapsed(job.remediationResult.remediationDurationMs);
  }

  if (job.analyzeResult?.analysisDurationMs) {
    return formatElapsed(job.analyzeResult.analysisDurationMs);
  }

  if (job.status !== 'done' || !job.processingStartedAt) {
    return null;
  }

  const startedAt = new Date(job.processingStartedAt).getTime();
  const finishedAt = new Date(job.updatedAt).getTime();

  if (Number.isNaN(startedAt) || Number.isNaN(finishedAt) || finishedAt < startedAt) {
    return null;
  }

  return formatElapsed(finishedAt - startedAt);
}

function timeRemainingLabel(expiresAt?: string | null): string | null {
  if (!expiresAt) return null;

  const expiresAtMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) return null;

  const remainingMs = expiresAtMs - Date.now();
  if (remainingMs <= 0) return 'Expires soon';

  const totalMinutes = Math.floor(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m left`;
  }

  return `${hours}h ${minutes}m left`;
}

function getRetentionWarning(job: JobRecord): { tone: 'warning' | 'danger'; message: string } | null {
  if (job.fileStatus === 'quota_deleted') {
    return {
      tone: 'danger',
      message: 'Deleted from the server because your saved fixed files went over 1 GB.',
    };
  }

  if (job.fileStatus === 'expired') {
    return {
      tone: 'warning',
      message: 'This fixed PDF expired after 24 hours and is no longer available to download.',
    };
  }

  if (job.fileStatus === 'available' && job.expiresAt) {
    const expiresAtMs = new Date(job.expiresAt).getTime();
    const remainingMs = expiresAtMs - Date.now();

    if (remainingMs <= 6 * 60 * 60 * 1000) {
      return {
        tone: remainingMs <= 60 * 60 * 1000 ? 'danger' : 'warning',
        message: `Download soon. Saved fixed PDFs are removed after 24 hours${timeRemainingLabel(job.expiresAt) ? ` (${timeRemainingLabel(job.expiresAt)})` : ''}.`,
      };
    }
  }

  return null;
}

function needsReuploadToFix(job: JobRecord): boolean {
  return Boolean(
    job.persisted &&
      !job.localFile &&
      !job.hasServerSource &&
      job.fileStatus !== 'available' &&
      job.analyzeResult &&
      !job.remediationResult,
  );
}

export function QueueTable() {
  const jobs = useQueueStore((state) => state.jobs);
  const selectedJobIds = useQueueStore((state) => state.selectedJobIds);
  const detailJobId = useQueueStore((state) => state.detailJobId);
  const closeDetail = useQueueStore((state) => state.closeDetail);
  const downloadRemediated = useQueueStore((state) => state.downloadRemediated);
  const enqueueRemediate = useQueueStore((state) => state.enqueueRemediate);
  const openDetail = useQueueStore((state) => state.openDetail);
  const removeJob = useQueueStore((state) => state.removeJob);
  const toggleSelection = useQueueStore((state) => state.toggleSelection);
  const sortedJobs = [...jobs].sort((left, right) => {
    const leftCreatedAt = new Date(left.createdAt).getTime();
    const rightCreatedAt = new Date(right.createdAt).getTime();

    if (Number.isNaN(leftCreatedAt) || Number.isNaN(rightCreatedAt)) {
      return right.id.localeCompare(left.id);
    }

    return rightCreatedAt - leftCreatedAt;
  });

  return (
    <SectionCard
      title="Your files"
      description="Tap a file for more info."
      action={<StatusPill label={`${jobs.length} files`} tone="accent" />}
    >
      <div className="space-y-3">
        <BatchActionBar />

        <div className="grid gap-3">
          {sortedJobs.map((job) => {
            const isSelected = selectedJobIds.includes(job.id);
            const displaySummary = getDisplaySummary(job);
            const completedDuration = getCompletedDuration(job);
            const canRun = ['idle', 'failed', 'done'].includes(job.status);
            const fixLabel = job.remediationResult ? 'Fix Again' : 'Fix';
            const downloadAction = getPrimaryDownloadAction(job);
            const retentionWarning = getRetentionWarning(job);
            const requiresReupload = needsReuploadToFix(job);
            const showProcessingState = isProcessing(job) && Boolean(job.processingStartedAt);
            const processingLabel =
              job.progressLabel ??
              (job.status === 'queued_analyze'
                ? 'Waiting to check'
                : job.status === 'queued_remediate'
                  ? 'Waiting to fix'
                  : job.status === 'uploading'
                    ? 'Sending'
                    : job.status === 'analyzing'
                      ? 'Checking'
                      : 'Fixing');

            return (
              <article key={job.id} className="surface-strong p-4">
                <div className="flex items-start gap-3">
                  <input
                    aria-label={`Select ${job.fileName}`}
                    className="focus-ring mt-1 h-4 w-4 rounded border-[color:var(--surface-border)]"
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection(job.id)}
                  />
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-[var(--accent-soft)] text-[var(--accent)]">
                    <FileIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          className={`truncate text-left text-base font-semibold underline-offset-2 ${
                            downloadAction === 'none'
                              ? 'cursor-default text-[var(--foreground)]'
                              : 'text-[var(--foreground)] hover:text-[var(--accent-strong)] hover:underline'
                          }`}
                          onClick={() =>
                            void (
                              downloadAction === 'fixed'
                                ? downloadRemediated(job.id)
                                : Promise.resolve()
                            )
                          }
                          title={
                            downloadAction === 'fixed'
                              ? 'Download fixed PDF'
                              : 'No downloadable file is available'
                          }
                        >
                          {job.fileName}
                        </button>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                          <span
                            className={
                              job.status === 'failed'
                                ? 'text-[var(--danger)]'
                                : job.status === 'done'
                                  ? 'text-[var(--muted)]'
                                  : 'text-[var(--accent-strong)]'
                            }
                          >
                            {formatFriendlyStatus(job)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          className="h-10 w-10 shrink-0 p-0"
                          onClick={() =>
                            void (
                              downloadAction === 'fixed'
                                ? downloadRemediated(job.id)
                                : Promise.resolve()
                            )
                          }
                          disabled={downloadAction === 'none'}
                          title={
                            downloadAction === 'fixed'
                              ? 'Download PDF'
                              : 'No downloadable file is available'
                          }
                          aria-label={`Download ${job.fileName}`}
                        >
                          <DownloadIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-10 w-10 shrink-0 p-0"
                          onClick={() => (detailJobId === job.id ? closeDetail() : openDetail(job.id))}
                          title={detailJobId === job.id ? 'Close details' : 'See details'}
                          aria-label={`See details for ${job.fileName}`}
                        >
                          <InfoIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-10 w-10 shrink-0 p-0"
                          onClick={() => void removeJob(job.id)}
                          disabled={
                            job.status === 'uploading' ||
                            job.status === 'analyzing' ||
                            job.status === 'remediating'
                          }
                          title="Remove file"
                          aria-label={`Remove ${job.fileName}`}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        {job.remediationResult ? (
                          <>
                            <GradeBadge
                              score={job.remediationResult.before.score}
                              grade={job.remediationResult.before.grade}
                            />
                            <div className="pt-3 text-sm text-[var(--muted)]">→</div>
                            <GradeBadge
                              score={job.remediationResult.after.score}
                              grade={job.remediationResult.after.grade}
                            />
                          </>
                        ) : displaySummary ? (
                          <GradeBadge score={displaySummary.score} grade={displaySummary.grade} />
                        ) : (
                          <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[#f8fafc] px-3 py-2 text-sm font-medium text-[var(--muted)]">
                            Waiting
                          </div>
                        )}
                        <div className="min-w-0 pt-1">
                          <p className="text-sm text-[var(--muted)]">
                            {displaySummary ? formatPdfClass(displaySummary.pdfClass) : 'Not checked yet'}
                          </p>
                          <p className="mt-1 text-sm text-[var(--muted)]">
                            {formatFileSize(job.fileSize)} · {formatJobTimestamp(job.updatedAt)}
                          </p>
                          {completedDuration ? (
                            <p className="mt-1 text-sm text-[var(--muted)]">Took {completedDuration}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="max-w-sm pt-1 text-sm leading-6 text-[var(--foreground)] md:text-right">
                        {formatFindingsSummary(job)}
                      </div>
                    </div>
                    {job.errorMessage ? (
                      <p className="mt-2 text-sm leading-6 text-[var(--danger)]">{job.errorMessage}</p>
                    ) : null}
                    {requiresReupload ? (
                      <p className="mt-2 text-sm leading-6 text-[var(--warning)]">
                        This row only kept the check result. Add the PDF again if you want to fix it.
                      </p>
                    ) : null}
                    {retentionWarning ? (
                      <p
                        className={`mt-2 text-sm leading-6 ${
                          retentionWarning.tone === 'danger'
                            ? 'text-[var(--danger)]'
                            : 'text-[var(--warning)]'
                        }`}
                      >
                        {retentionWarning.message}
                      </p>
                    ) : null}
                    {showProcessingState && job.processingStartedAt ? (
                      <div className="mt-3 flex items-center gap-2 text-sm font-medium text-[var(--accent-strong)]">
                        <span>{processingLabel}</span>
                        <span>•</span>
                        <ProcessingTimer startedAt={job.processingStartedAt} />
                      </div>
                    ) : null}
                    {job.mode === 'remediate' &&
                    (job.status === 'queued_remediate' ||
                      job.status === 'uploading' ||
                      job.status === 'remediating') ? (
                      <RemediationProgressBar
                        percent={job.progressPercent ?? (job.status === 'queued_remediate' ? 0 : 8)}
                        label={job.progressLabel ?? processingLabel}
                        detail={job.progressDetail}
                      />
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => void enqueueRemediate([job.id])}
                        disabled={
                          !canRun ||
                          (job.persisted &&
                            !job.localFile &&
                            job.fileStatus !== 'available' &&
                            !job.hasServerSource)
                        }
                        title={
                          requiresReupload
                            ? 'Add this PDF again to fix it'
                            : job.remediationResult
                              ? 'Fix this PDF again'
                              : 'Fix this PDF'
                        }
                      >
                        <MagicIcon className="h-4 w-4" />
                        {job.status === 'queued_remediate' || job.status === 'uploading' || job.status === 'remediating'
                          ? 'Fixing...'
                          : fixLabel}
                      </Button>
                    </div>

                    {detailJobId === job.id ? <QueueDetailDrawer job={job} /> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}
