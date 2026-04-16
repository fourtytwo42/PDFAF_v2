'use client';

import { Button } from '../common/Button';
import { SectionCard } from '../common/SectionCard';
import { StatusPill } from '../common/StatusPill';
import { formatFileSize, formatJobTimestamp } from '../../lib/format/formatters';
import { useQueueStore } from '../../stores/queue';
import type { JobRecord } from '../../types/queue';
import { BatchActionBar } from './BatchActionBar';

function getStatusTone(job: JobRecord): 'accent' | 'danger' {
  return job.status === 'failed' ? 'danger' : 'accent';
}

export function QueueTable() {
  const jobs = useQueueStore((state) => state.jobs);
  const selectedJobIds = useQueueStore((state) => state.selectedJobIds);
  const downloadOriginal = useQueueStore((state) => state.downloadOriginal);
  const removeJob = useQueueStore((state) => state.removeJob);
  const toggleSelection = useQueueStore((state) => state.toggleSelection);
  const toggleSelectAllVisible = useQueueStore((state) => state.toggleSelectAllVisible);

  const allSelected = jobs.length > 0 && selectedJobIds.length === jobs.length;

  return (
    <SectionCard
      title="Local Queue"
      description="Rows here exist only in this browser. Refresh-safe originals are stored in IndexedDB until you remove them."
      action={<StatusPill label={`${jobs.length} Files`} tone="accent" />}
    >
      <div className="space-y-4">
        <BatchActionBar />

        <div className="overflow-hidden rounded-[24px] border border-[color:var(--surface-border)] bg-white/55">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-[color:var(--surface-border)] bg-white/60">
                  <th className="px-4 py-3 text-left">
                    <input
                      aria-label="Select all files"
                      className="focus-ring h-4 w-4 rounded border-[color:var(--surface-border)]"
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => toggleSelectAllVisible()}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    File Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Size
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Local Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Added
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const isSelected = selectedJobIds.includes(job.id);

                  return (
                    <tr
                      key={job.id}
                      className="border-b border-[color:var(--surface-border)] last:border-b-0"
                    >
                      <td className="px-4 py-4 align-top">
                        <input
                          aria-label={`Select ${job.fileName}`}
                          className="focus-ring mt-1 h-4 w-4 rounded border-[color:var(--surface-border)]"
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(job.id)}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <p className="max-w-xl break-all text-sm font-semibold text-[var(--foreground)]">
                          {job.fileName}
                        </p>
                        {job.errorMessage ? (
                          <p className="mt-2 text-sm leading-6 text-[var(--danger)]">
                            {job.errorMessage}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--foreground)]">
                        {formatFileSize(job.fileSize)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusPill label={job.status} tone={getStatusTone(job)} />
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--foreground)]">
                        {formatJobTimestamp(job.createdAt)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            onClick={() => void downloadOriginal(job.id)}
                          >
                            Download Original
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => void removeJob(job.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
