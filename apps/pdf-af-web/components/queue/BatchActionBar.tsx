'use client';

import {
  CheckIcon,
  DownloadIcon,
  MagicIcon,
  TrashIcon,
} from '../common/AppIcons';
import { Button } from '../common/Button';
import { useQueueStore } from '../../stores/queue';

export function BatchActionBar() {
  const jobs = useQueueStore((state) => state.jobs);
  const selectedJobIds = useQueueStore((state) => state.selectedJobIds);
  const downloadSelectedRemediatedZip = useQueueStore(
    (state) => state.downloadSelectedRemediatedZip,
  );
  const removeSelected = useQueueStore((state) => state.removeSelected);
  const enqueueAnalyze = useQueueStore((state) => state.enqueueAnalyze);
  const enqueueRemediate = useQueueStore((state) => state.enqueueRemediate);
  const preferredQueueConcurrency = useQueueStore((state) => state.preferredQueueConcurrency);
  const setPreferredQueueConcurrency = useQueueStore(
    (state) => state.setPreferredQueueConcurrency,
  );
  const toggleSelectAllVisible = useQueueStore((state) => state.toggleSelectAllVisible);

  const hasJobs = jobs.length > 0;
  const allVisibleSelected = hasJobs && selectedJobIds.length === jobs.length;
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
  const hasSelectedRemediatedOutputs = jobs.some(
    (job) => selectedJobIds.includes(job.id) && job.fileStatus === 'available',
  );

  return (
    <div className="surface-strong flex flex-col gap-3 p-3">
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
          onClick={() => void downloadSelectedRemediatedZip()}
          disabled={!hasSelectedRemediatedOutputs}
          title="Download fixed files"
        >
          <DownloadIcon className="h-4 w-4" />
          Download
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
