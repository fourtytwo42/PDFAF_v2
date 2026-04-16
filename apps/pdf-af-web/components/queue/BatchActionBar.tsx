'use client';

import { Button } from '../common/Button';
import { StatusPill } from '../common/StatusPill';
import { useQueueStore } from '../../stores/queue';

export function BatchActionBar() {
  const jobs = useQueueStore((state) => state.jobs);
  const selectedJobIds = useQueueStore((state) => state.selectedJobIds);
  const clearSelection = useQueueStore((state) => state.clearSelection);
  const removeSelected = useQueueStore((state) => state.removeSelected);
  const enqueueAnalyze = useQueueStore((state) => state.enqueueAnalyze);
  const enqueueRemediate = useQueueStore((state) => state.enqueueRemediate);
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

  return (
    <div className="flex flex-col gap-3 rounded-[24px] border border-[color:var(--surface-border)] bg-white/45 px-4 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill label={`${selectedJobIds.length} Selected`} tone="accent" />
        <p className="text-sm leading-6 text-[var(--muted)]">
          Analyze or remediate selected files from this local queue. ZIP actions arrive in later milestones.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => toggleSelectAllVisible()} disabled={!hasJobs}>
          {allVisibleSelected ? 'Unselect All' : 'Select All'}
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
