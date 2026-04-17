'use client';

import {
  CheckIcon,
  DownloadIcon,
  MagicIcon,
  PauseIcon,
  PlayIcon,
  RetryIcon,
  TrashIcon,
  ZipIcon,
} from '../common/AppIcons';
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
    <div className="surface-strong flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill label={`${selectedJobIds.length} selected`} tone="accent" />
        <StatusPill label={`${activeCount} working`} tone={activeCount > 0 ? 'success' : 'neutral'} />
        <StatusPill label={`${queuedCount} waiting`} tone={queuedCount > 0 ? 'warning' : 'neutral'} />
        <StatusPill label={queuePaused ? 'paused' : 'ready'} tone={queuePaused ? 'warning' : 'success'} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          onClick={() => toggleSelectAllVisible()}
          disabled={!hasJobs}
          title={allVisibleSelected ? 'Unselect all files' : 'Select all files'}
        >
          {allVisibleSelected ? 'Unselect' : 'Select all'}
        </Button>
        <label className="flex items-center gap-2 rounded-full border border-[color:var(--surface-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)] shadow-sm">
          <span>Speed</span>
          <select
            className="bg-transparent text-[var(--foreground)] outline-none"
            value={preferredQueueConcurrency}
            onChange={(event) => setPreferredQueueConcurrency(Number(event.target.value))}
            title="How many files to process at once"
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
          title={queuePaused ? 'Start the queue again' : 'Pause new work'}
        >
          {queuePaused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
          {queuePaused ? 'Resume' : 'Pause'}
        </Button>
        <Button
          variant="primary"
          onClick={() => void enqueueAnalyze()}
          disabled={!hasGradeableSelection}
          title="Check the selected files"
        >
          <CheckIcon className="h-4 w-4" />
          Check
        </Button>
        <Button
          variant="secondary"
          onClick={() => void enqueueRemediate()}
          disabled={!hasRemediatableSelection}
          title="Fix the selected files"
        >
          <MagicIcon className="h-4 w-4" />
          Fix
        </Button>
        <Button
          variant="ghost"
          onClick={() => void retryFailed()}
          disabled={!hasRetryableFailedSelection}
          title="Try failed files again"
        >
          <RetryIcon className="h-4 w-4" />
          Retry
        </Button>
        <Button
          variant="ghost"
          onClick={() => void downloadSelectedRemediatedZip()}
          disabled={!hasSelectedRemediatedOutputs}
          title="Download fixed files as a ZIP"
        >
          <ZipIcon className="h-4 w-4" />
          ZIP
        </Button>
        <Button
          variant="ghost"
          onClick={() => void clearCompleted()}
          disabled={!hasCompletedRows}
          title="Remove finished files"
        >
          <DownloadIcon className="h-4 w-4" />
          Clear done
        </Button>
        <Button
          variant="ghost"
          onClick={() => clearSelection()}
          disabled={selectedJobIds.length === 0}
          title="Clear the current selection"
        >
          Clear
        </Button>
        <Button
          variant="secondary"
          onClick={() => void removeSelected()}
          disabled={selectedJobIds.length === 0}
          title="Remove selected files"
        >
          <TrashIcon className="h-4 w-4" />
          Remove
        </Button>
      </div>
    </div>
  );
}
