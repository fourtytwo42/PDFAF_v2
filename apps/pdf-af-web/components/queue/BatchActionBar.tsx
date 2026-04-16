'use client';

import { Button } from '../common/Button';
import { StatusPill } from '../common/StatusPill';
import { useQueueStore } from '../../stores/queue';

export function BatchActionBar() {
  const jobs = useQueueStore((state) => state.jobs);
  const selectedJobIds = useQueueStore((state) => state.selectedJobIds);
  const clearSelection = useQueueStore((state) => state.clearSelection);
  const clearCompleted = useQueueStore((state) => state.clearCompleted);
  const downloadSelectedRemediatedZip = useQueueStore(
    (state) => state.downloadSelectedRemediatedZip,
  );
  const removeSelected = useQueueStore((state) => state.removeSelected);
  const enqueueAnalyze = useQueueStore((state) => state.enqueueAnalyze);
  const enqueueRemediate = useQueueStore((state) => state.enqueueRemediate);
  const pauseQueue = useQueueStore((state) => state.pauseQueue);
  const preferredQueueConcurrency = useQueueStore((state) => state.preferredQueueConcurrency);
  const queuePaused = useQueueStore((state) => state.queuePaused);
  const resumeQueue = useQueueStore((state) => state.resumeQueue);
  const retryFailed = useQueueStore((state) => state.retryFailed);
  const setPreferredQueueConcurrency = useQueueStore(
    (state) => state.setPreferredQueueConcurrency,
  );
  const toggleSelectAllVisible = useQueueStore((state) => state.toggleSelectAllVisible);

  const hasJobs = jobs.length > 0;
  const allVisibleSelected = hasJobs && selectedJobIds.length === jobs.length;
  const activeCount = jobs.filter(
    (job) =>
      job.status === 'uploading' || job.status === 'analyzing' || job.status === 'remediating',
  ).length;
  const queuedCount = jobs.filter(
    (job) => job.status === 'queued_analyze' || job.status === 'queued_remediate',
  ).length;
  const hasCompletedRows = jobs.some((job) => job.status === 'done');
  const hasGradeableSelection = jobs.some(
    (job) =>
      selectedJobIds.includes(job.id) &&
      (job.status === 'idle' || job.status === 'failed' || job.status === 'done'),
  );
  const hasRemediatableSelection = jobs.some(
    (job) =>
      selectedJobIds.includes(job.id) &&
      (job.status === 'idle' || job.status === 'failed' || job.status === 'done'),
  );
  const hasRetryableFailedSelection = jobs.some(
    (job) =>
      selectedJobIds.includes(job.id) &&
      job.status === 'failed' &&
      (job.mode === 'grade' || job.mode === 'remediate'),
  );
  const hasSelectedRemediatedOutputs = jobs.some(
    (job) => selectedJobIds.includes(job.id) && Boolean(job.remediatedBlobKey),
  );

  return (
    <div className="flex flex-col gap-3 rounded-[24px] border border-[color:var(--surface-border)] bg-white/45 px-4 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill label={`${selectedJobIds.length} Selected`} tone="accent" />
        <StatusPill label={`${activeCount} Active`} tone={activeCount > 0 ? 'success' : 'neutral'} />
        <StatusPill label={`${queuedCount} Queued`} tone={queuedCount > 0 ? 'accent' : 'neutral'} />
        <StatusPill label={queuePaused ? 'Paused' : 'Running'} tone={queuePaused ? 'warning' : 'success'} />
        <p className="text-sm leading-6 text-[var(--muted)]">
          Analyze or remediate selected files, retry failures, and download selected remediated outputs as a ZIP.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => toggleSelectAllVisible()} disabled={!hasJobs}>
          {allVisibleSelected ? 'Unselect All' : 'Select All'}
        </Button>
        <label className="flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-white/80 px-3 py-2 text-sm font-semibold text-[var(--foreground)]">
          <span>Concurrency</span>
          <select
            className="bg-transparent outline-none"
            value={preferredQueueConcurrency}
            onChange={(event) => setPreferredQueueConcurrency(Number(event.target.value))}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <Button
          variant="ghost"
          onClick={() => (queuePaused ? resumeQueue() : pauseQueue())}
          disabled={queuePaused ? queuedCount === 0 : false}
        >
          {queuePaused ? 'Resume Queue' : 'Pause Queue'}
        </Button>
        <Button
          variant="primary"
          onClick={() => void enqueueAnalyze()}
          disabled={!hasGradeableSelection}
        >
          Grade Selected
        </Button>
        <Button
          variant="secondary"
          onClick={() => void enqueueRemediate()}
          disabled={!hasRemediatableSelection}
        >
          Remediate Selected
        </Button>
        <Button
          variant="ghost"
          onClick={() => void retryFailed()}
          disabled={!hasRetryableFailedSelection}
        >
          Retry Failed
        </Button>
        <Button
          variant="ghost"
          onClick={() => void downloadSelectedRemediatedZip()}
          disabled={!hasSelectedRemediatedOutputs}
        >
          Download ZIP
        </Button>
        <Button
          variant="ghost"
          onClick={() => void clearCompleted()}
          disabled={!hasCompletedRows}
        >
          Clear Completed
        </Button>
        <Button
          variant="ghost"
          onClick={() => clearSelection()}
          disabled={selectedJobIds.length === 0}
        >
          Clear Selection
        </Button>
        <Button
          variant="secondary"
          onClick={() => void removeSelected()}
          disabled={selectedJobIds.length === 0}
        >
          Remove Selected
        </Button>
      </div>
    </div>
  );
}
