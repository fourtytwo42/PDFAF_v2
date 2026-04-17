'use client';

import {
  DownloadIcon,
  MagicIcon,
  TrashIcon,
} from '../common/AppIcons';
import { Button } from '../common/Button';
import { useQueueStore } from '../../stores/queue';

function canRemediate(job: ReturnType<typeof useQueueStore.getState>['jobs'][number]) {
  return Boolean(job.localFile) || (job.persisted && (job.fileStatus === 'available' || job.hasServerSource));
}

export function BatchActionBar() {
  const jobs = useQueueStore((state) => state.jobs);
  const selectedJobIds = useQueueStore((state) => state.selectedJobIds);
  const downloadSelectedRemediatedZip = useQueueStore(
    (state) => state.downloadSelectedRemediatedZip,
  );
  const removeSelected = useQueueStore((state) => state.removeSelected);
  const enqueueRemediate = useQueueStore((state) => state.enqueueRemediate);
  const toggleSelectAllVisible = useQueueStore((state) => state.toggleSelectAllVisible);

  const hasJobs = jobs.length > 0;
  const allVisibleSelected = hasJobs && selectedJobIds.length === jobs.length;
  const hasRemediatableSelection = jobs.some(
    (job) =>
      selectedJobIds.includes(job.id) &&
      (job.status === 'idle' || job.status === 'failed' || job.status === 'done') &&
      canRemediate(job),
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
