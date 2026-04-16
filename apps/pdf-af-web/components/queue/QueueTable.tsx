'use client';

import { Button } from '../common/Button';
import { SectionCard } from '../common/SectionCard';
import { StatusPill } from '../common/StatusPill';
import { formatFileSize, formatJobTimestamp, formatPdfClass } from '../../lib/format/formatters';
import { useQueueStore } from '../../stores/queue';
import type { JobRecord } from '../../types/queue';
import { BatchActionBar } from './BatchActionBar';

function getStatusTone(job: JobRecord): 'accent' | 'danger' | 'success' {
  if (job.status === 'failed') return 'danger';
  if (job.status === 'done') return 'success';
  return 'accent';
}

function formatResultSummary(job: JobRecord): string {
  if (!job.findingSummaries || job.findingSummaries.length === 0) {
    return job.analyzeResult ? 'No actionable findings surfaced in the stored summary.' : 'Not analyzed yet.';
  }

  return job.findingSummaries.map((finding) => finding.title).join(' · ');
}

export function QueueTable() {
  const jobs = useQueueStore((state) => state.jobs);
  const selectedJobIds = useQueueStore((state) => state.selectedJobIds);
  const downloadOriginal = useQueueStore((state) => state.downloadOriginal);
  const enqueueAnalyze = useQueueStore((state) => state.enqueueAnalyze);
  const openDetail = useQueueStore((state) => state.openDetail);
  const removeJob = useQueueStore((state) => state.removeJob);
  const retryJob = useQueueStore((state) => state.retryJob);
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
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Score / Grade
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    PDF Class
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Top Findings
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Updated
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
                        {job.analyzeResult ? `${job.analyzeResult.score} / ${job.analyzeResult.grade}` : 'Not analyzed'}
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--foreground)]">
                        {job.analyzeResult ? formatPdfClass(job.analyzeResult.pdfClass) : 'Not analyzed'}
                      </td>
                      <td className="max-w-sm px-4 py-4 text-sm leading-6 text-[var(--foreground)]">
                        {formatResultSummary(job)}
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--foreground)]">
                        {formatJobTimestamp(job.updatedAt)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="primary"
                            onClick={() => void enqueueAnalyze([job.id])}
                            disabled={
                              !['idle', 'failed', 'done'].includes(job.status)
                            }
                          >
                            Grade
                          </Button>
                          {job.status === 'failed' ? (
                            <Button
                              variant="ghost"
                              onClick={() => void retryJob(job.id)}
                            >
                              Retry
                            </Button>
                          ) : null}
                          {job.analyzeResult ? (
                            <Button
                              variant="ghost"
                              onClick={() => openDetail(job.id)}
                            >
                              View Details
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            onClick={() => void downloadOriginal(job.id)}
                          >
                            Download Original
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => void removeJob(job.id)}
                            disabled={job.status === 'uploading' || job.status === 'analyzing'}
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
