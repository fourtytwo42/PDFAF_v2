'use client';

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

  if (!job.findingSummaries || job.findingSummaries.length === 0) {
    return job.analyzeResult ? 'No actionable findings surfaced in the stored summary.' : 'Not analyzed yet.';
  }

  return job.findingSummaries.map((finding) => finding.title).join(' · ');
}

function formatFindingsSummary(job: JobRecord): string {
  if (!job.findingSummaries || job.findingSummaries.length === 0) {
    return job.analyzeResult ? 'none' : 'n/a';
  }

  return job.findingSummaries.slice(0, 3).map((finding) => finding.title).join(' · ');
}

function getDisplaySummary(job: JobRecord) {
  return job.remediationResult?.after ?? job.analyzeResult;
}

export function QueueTable() {
  const jobs = useQueueStore((state) => state.jobs);
  const selectedJobIds = useQueueStore((state) => state.selectedJobIds);
  const downloadOriginal = useQueueStore((state) => state.downloadOriginal);
  const downloadRemediated = useQueueStore((state) => state.downloadRemediated);
  const enqueueAnalyze = useQueueStore((state) => state.enqueueAnalyze);
  const enqueueRemediate = useQueueStore((state) => state.enqueueRemediate);
  const openDetail = useQueueStore((state) => state.openDetail);
  const removeJob = useQueueStore((state) => state.removeJob);
  const retryJob = useQueueStore((state) => state.retryJob);
  const toggleSelection = useQueueStore((state) => state.toggleSelection);
  const toggleSelectAllVisible = useQueueStore((state) => state.toggleSelectAllVisible);

  const allSelected = jobs.length > 0 && selectedJobIds.length === jobs.length;

  return (
    <SectionCard
      title="Local Queue"
      description="Queue"
      action={<StatusPill label={`${jobs.length} Files`} tone="accent" />}
    >
      <div className="space-y-2">
        <BatchActionBar />

        <div className="overflow-hidden border border-[color:var(--surface-border)] bg-[var(--surface-strong)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-[color:var(--surface-border)] bg-black">
                  <th className="px-2 py-2 text-left">
                    <input
                      aria-label="Select all files"
                      className="focus-ring h-3.5 w-3.5 border-[color:var(--surface-border)] bg-black"
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => toggleSelectAllVisible()}
                    />
                  </th>
                  <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    File Name
                  </th>
                  <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Size
                  </th>
                  <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Status
                  </th>
                  <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Result
                  </th>
                  <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    PDF Class
                  </th>
                  <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Findings
                  </th>
                  <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Updated
                  </th>
                  <th className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const isSelected = selectedJobIds.includes(job.id);
                  const displaySummary = getDisplaySummary(job);

                  return (
                    <tr
                      key={job.id}
                      className="border-b border-[color:var(--surface-border)] align-top last:border-b-0"
                    >
                      <td className="px-2 py-2 align-top">
                        <input
                          aria-label={`Select ${job.fileName}`}
                          className="focus-ring mt-0.5 h-3.5 w-3.5 border-[color:var(--surface-border)] bg-black"
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(job.id)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <p className="max-w-xl break-all text-xs font-bold text-[var(--foreground)]">
                        {job.fileName}
                        </p>
                        {job.errorMessage ? (
                          <p className="mt-1 text-[11px] leading-5 text-[var(--danger)]">
                            {job.errorMessage}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-xs text-[var(--foreground)]">
                        {formatFileSize(job.fileSize)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusPill label={job.status} tone={getStatusTone(job)} />
                          {job.status === 'queued_analyze' || job.status === 'queued_remediate' ? (
                            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                              waiting
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-xs text-[var(--foreground)]">
                        <div className="flex flex-col gap-1">
                          <span>{formatResultSummary(job)}</span>
                          {job.remediationResult?.improved ? (
                            <StatusPill label="Improved" tone="success" />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-xs text-[var(--foreground)]">
                        {displaySummary ? formatPdfClass(displaySummary.pdfClass) : 'Not analyzed'}
                      </td>
                      <td className="max-w-sm px-2 py-2 text-xs leading-5 text-[var(--foreground)]">
                        {formatFindingsSummary(job)}
                      </td>
                      <td className="px-2 py-2 text-xs text-[var(--foreground)]">
                        {formatJobTimestamp(job.updatedAt)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            variant="primary"
                            onClick={() => void enqueueAnalyze([job.id])}
                            disabled={
                              !['idle', 'failed', 'done'].includes(job.status)
                            }
                          >
                            Grade
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => void enqueueRemediate([job.id])}
                            disabled={!['idle', 'failed', 'done'].includes(job.status)}
                          >
                            Remediate
                          </Button>
                          {job.status === 'failed' ? (
                            <Button
                              variant="ghost"
                              onClick={() => void retryJob(job.id)}
                            >
                              Retry
                            </Button>
                          ) : null}
                          {job.analyzeResult || job.remediationResult ? (
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
                          {job.remediatedBlobKey ? (
                            <Button
                              variant="ghost"
                              onClick={() => void downloadRemediated(job.id)}
                            >
                              Download Remediated
                            </Button>
                          ) : null}
                          <Button
                            variant="secondary"
                            onClick={() => void removeJob(job.id)}
                            disabled={
                              job.status === 'uploading' ||
                              job.status === 'analyzing' ||
                              job.status === 'remediating'
                            }
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
