'use client';

import {
  CheckIcon,
  FileIcon,
  MagicIcon,
  MoreIcon,
  RetryIcon,
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

function getStatusTone(job: JobRecord): 'accent' | 'danger' | 'success' {
  if (job.status === 'failed') return 'danger';
  if (job.status === 'done') return 'success';
  return 'accent';
}

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

function formatResultSummary(job: JobRecord): string {
  if (job.remediationResult) {
    return `${formatScoreGrade(
      job.remediationResult.before.score,
      job.remediationResult.before.grade,
    )} -> ${formatScoreGrade(
      job.remediationResult.after.score,
      job.remediationResult.after.grade,
    )}`;
  }

  if (job.analyzeResult) {
    return formatScoreGrade(job.analyzeResult.score, job.analyzeResult.grade);
  }

  return 'Ready to check';
}

function formatFindingsSummary(job: JobRecord): string {
  if (!job.findingSummaries || job.findingSummaries.length === 0) {
    return job.analyzeResult ? 'No big problems found' : 'No results yet';
  }

  return job.findingSummaries.length === 1
    ? '1 thing to look at'
    : `${job.findingSummaries.length} things to look at`;
}

function getDisplaySummary(job: JobRecord) {
  return job.remediationResult?.after ?? job.analyzeResult;
}

export function QueueTable() {
  const jobs = useQueueStore((state) => state.jobs);
  const selectedJobIds = useQueueStore((state) => state.selectedJobIds);
  const enqueueAnalyze = useQueueStore((state) => state.enqueueAnalyze);
  const enqueueRemediate = useQueueStore((state) => state.enqueueRemediate);
  const openDetail = useQueueStore((state) => state.openDetail);
  const retryJob = useQueueStore((state) => state.retryJob);
  const toggleSelection = useQueueStore((state) => state.toggleSelection);

  return (
    <SectionCard
      title="Your files"
      description="Tap a file for more info."
      action={<StatusPill label={`${jobs.length} files`} tone="accent" />}
    >
      <div className="space-y-3">
        <BatchActionBar />

        <div className="grid gap-3">
          {jobs.map((job) => {
            const isSelected = selectedJobIds.includes(job.id);
            const displaySummary = getDisplaySummary(job);
            const canRun = ['idle', 'failed', 'done'].includes(job.status);

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
                        <p className="truncate text-base font-semibold text-[var(--foreground)]">
                          {job.fileName}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <StatusPill label={formatFriendlyStatus(job)} tone={getStatusTone(job)} />
                          {job.remediationResult?.improved ? (
                            <StatusPill label="Better now" tone="success" />
                          ) : null}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        className="h-10 w-10 shrink-0 p-0"
                        onClick={() => openDetail(job.id)}
                        title="See more info"
                        aria-label={`See more info for ${job.fileName}`}
                      >
                        <MoreIcon className="h-4 w-4" />
                      </Button>
                    </div>

                    <p className="mt-3 text-lg font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                      {formatResultSummary(job)}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {displaySummary ? formatPdfClass(displaySummary.pdfClass) : 'Not checked yet'} ·{' '}
                      {formatFileSize(job.fileSize)} · {formatJobTimestamp(job.updatedAt)}
                    </p>
                    <p className="mt-2 text-sm text-[var(--muted)]">{formatFindingsSummary(job)}</p>
                    {job.errorMessage ? (
                      <p className="mt-2 text-sm leading-6 text-[var(--danger)]">{job.errorMessage}</p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        onClick={() => void enqueueAnalyze([job.id])}
                        disabled={!canRun}
                        title="Check this PDF"
                      >
                        <CheckIcon className="h-4 w-4" />
                        Check
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void enqueueRemediate([job.id])}
                        disabled={!canRun}
                        title="Fix this PDF"
                      >
                        <MagicIcon className="h-4 w-4" />
                        Fix
                      </Button>
                      {job.status === 'failed' ? (
                        <Button
                          variant="ghost"
                          onClick={() => void retryJob(job.id)}
                          title="Try this file again"
                        >
                          <RetryIcon className="h-4 w-4" />
                          Retry
                        </Button>
                      ) : null}
                    </div>
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
