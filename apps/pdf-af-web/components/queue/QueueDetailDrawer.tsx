'use client';

import { Button } from '../common/Button';
import { StatusPill } from '../common/StatusPill';
import {
  formatDurationMs,
  formatFileSize,
  formatJobTimestamp,
  formatPdfClass,
} from '../../lib/format/formatters';
import { useQueueStore } from '../../stores/queue';

function getStatusTone(status: string): 'accent' | 'success' | 'danger' {
  if (status === 'done') return 'success';
  if (status === 'failed') return 'danger';
  return 'accent';
}

export function QueueDetailDrawer() {
  const detailJobId = useQueueStore((state) => state.detailJobId);
  const jobs = useQueueStore((state) => state.jobs);
  const closeDetail = useQueueStore((state) => state.closeDetail);
  const downloadOriginal = useQueueStore((state) => state.downloadOriginal);

  const job = jobs.find((candidate) => candidate.id === detailJobId);

  if (!job) return null;

  const result = job.analyzeResult;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20 p-3 md:p-5">
      <div className="surface flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-[32px]">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--surface-border)] px-6 py-5 md:px-8">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              File Details
            </p>
            <h2 className="mt-2 break-all text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              {job.fileName}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill label={job.status} tone={getStatusTone(job.status)} />
              {result ? <StatusPill label={`${result.grade} · ${result.score}`} tone="success" /> : null}
            </div>
          </div>
          <Button variant="ghost" onClick={() => closeDetail()}>
            Close
          </Button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 md:px-8">
          <section className="surface-strong rounded-[24px] p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              File Summary
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              <div>
                <dt className="text-[var(--muted)]">Size</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {formatFileSize(job.fileSize)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Updated</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {formatJobTimestamp(job.updatedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">PDF Class</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {result ? formatPdfClass(result.pdfClass) : 'Not analyzed'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Page Count</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {result ? result.pageCount : 'Not analyzed'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Analysis Time</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {result ? formatDurationMs(result.analysisDurationMs) : 'Not analyzed'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Mode</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {job.mode ?? 'Not queued'}
                </dd>
              </div>
            </dl>
            <div className="mt-5">
              <Button variant="secondary" onClick={() => void downloadOriginal(job.id)}>
                Download Original
              </Button>
            </div>
          </section>

          {job.errorMessage ? (
            <section className="rounded-[24px] bg-[color:rgba(161,50,50,0.08)] p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--danger)]">
                Last Error
              </p>
              <p className="mt-3 text-sm leading-6 text-[var(--danger)]">{job.errorMessage}</p>
            </section>
          ) : null}

          {result ? (
            <section className="surface-strong rounded-[24px] p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                Category Breakdown
              </p>
              <div className="mt-4 grid gap-3">
                {result.categories.map((category) => (
                  <article
                    key={category.key}
                    className="rounded-2xl border border-[color:var(--surface-border)] bg-white/65 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">
                          {category.label}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                          {category.findingCount} actionable finding{category.findingCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-[var(--foreground)]">
                          {category.score}
                        </p>
                        <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                          {category.severity}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {result ? (
            <section className="surface-strong rounded-[24px] p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                Top Findings
              </p>
              <div className="mt-4 grid gap-4">
                {result.findings.length > 0 ? (
                  result.findings.map((finding) => (
                    <article
                      key={finding.id}
                      className="rounded-2xl border border-[color:var(--surface-border)] bg-white/65 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill
                          label={finding.severity}
                          tone={finding.severity === 'critical' || finding.severity === 'moderate' ? 'danger' : 'warning'}
                        />
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                          {finding.category}
                        </span>
                        {finding.page ? (
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                            Page {finding.page}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-base font-semibold text-[var(--foreground)]">
                        {finding.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">
                        {finding.summary}
                      </p>
                      {finding.references.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {finding.references.map((reference) => (
                            <a
                              key={`${finding.id}-${reference.href}`}
                              href={reference.href}
                              target="_blank"
                              rel="noreferrer"
                              className="focus-ring inline-flex items-center rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]"
                            >
                              {reference.label}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-[var(--muted)]">
                    No actionable findings were surfaced in the stored analysis summary.
                  </p>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
