'use client';

import type { ReactNode } from 'react';
import {
  CheckIcon,
  DownloadIcon,
  FileIcon,
  MagicIcon,
  MoreIcon,
  RetryIcon,
  TrashIcon,
} from '../common/AppIcons';
import { Button } from '../common/Button';
import { StatusPill } from '../common/StatusPill';
import {
  formatDurationMs,
  formatFileSize,
  formatJobTimestamp,
  formatPdfClass,
  formatScoreGrade,
} from '../../lib/format/formatters';
import { useQueueStore } from '../../stores/queue';
import type { SemanticSummary } from '../../types/remediation';

type QueueJob = ReturnType<typeof useQueueStore.getState>['jobs'][number];

function getStatusTone(status: string): 'accent' | 'success' | 'danger' {
  if (status === 'done') return 'success';
  if (status === 'failed') return 'danger';
  return 'accent';
}

function getDisplayedResult(job: QueueJob) {
  return job.remediationResult?.after ?? job.analyzeResult;
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="surface-strong p-4">
      <p className="text-base font-semibold text-[var(--foreground)]">{title}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ExpandSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="surface-strong p-4" open={defaultOpen}>
      <summary className="flex cursor-pointer items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-[var(--foreground)]">{title}</p>
          <p className="text-sm text-[var(--muted)]">{subtitle}</p>
        </div>
        <MoreIcon className="h-4 w-4 text-[var(--muted)]" />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

export function QueueDetailDrawer() {
  const detailJobId = useQueueStore((state) => state.detailJobId);
  const jobs = useQueueStore((state) => state.jobs);
  const closeDetail = useQueueStore((state) => state.closeDetail);
  const downloadOriginal = useQueueStore((state) => state.downloadOriginal);
  const downloadRemediated = useQueueStore((state) => state.downloadRemediated);
  const enqueueAnalyze = useQueueStore((state) => state.enqueueAnalyze);
  const enqueueRemediate = useQueueStore((state) => state.enqueueRemediate);
  const removeJob = useQueueStore((state) => state.removeJob);
  const retryJob = useQueueStore((state) => state.retryJob);

  const job = jobs.find((candidate) => candidate.id === detailJobId);
  if (!job) return null;

  const result = getDisplayedResult(job);
  const remediation = job.remediationResult;
  const semanticSummaries: Array<{ label: string; summary: SemanticSummary }> = remediation
    ? [
        remediation.semantic ? { label: 'Figures', summary: remediation.semantic } : null,
        remediation.semanticHeadings
          ? { label: 'Headings', summary: remediation.semanticHeadings }
          : null,
        remediation.semanticPromoteHeadings
          ? { label: 'Promote', summary: remediation.semanticPromoteHeadings }
          : null,
        remediation.semanticUntaggedHeadings
          ? { label: 'Untagged', summary: remediation.semanticUntaggedHeadings }
          : null,
      ].filter(Boolean) as Array<{ label: string; summary: SemanticSummary }>
    : [];

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(15,23,42,0.3)] p-3 md:items-center">
      <div className="surface flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-4 py-4 md:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[var(--accent-soft)] text-[var(--accent)]">
                <FileIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="break-all text-lg font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                  {job.fileName}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">More info and downloads.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill label={job.status} tone={getStatusTone(job.status)} />
              {remediation ? (
                <>
                  <StatusPill
                    label={`${remediation.before.grade} ${remediation.before.score}`}
                    tone="accent"
                  />
                  <StatusPill
                    label={`${remediation.after.grade} ${remediation.after.score}`}
                    tone="success"
                  />
                </>
              ) : result ? (
                <StatusPill label={`${result.grade} ${result.score}`} tone="success" />
              ) : null}
            </div>
          </div>
          <Button variant="ghost" onClick={() => closeDetail()} title="Close details">
            Close
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4 md:px-5 md:pb-5">
          <DetailSection title="Quick actions">
            <div className="flex flex-wrap gap-2">
              {!job.analyzeResult && !job.remediationResult ? (
                <Button variant="primary" onClick={() => void enqueueAnalyze([job.id])} title="Check this file">
                  <CheckIcon className="h-4 w-4" />
                  Check
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => void enqueueRemediate([job.id])} title="Fix this file">
                <MagicIcon className="h-4 w-4" />
                {job.remediationResult ? 'Fix Again' : 'Fix'}
              </Button>
              {!job.remediatedBlobKey && !job.remediationResult ? (
                <Button variant="ghost" onClick={() => void downloadOriginal(job.id)} title="Download the original file">
                  <DownloadIcon className="h-4 w-4" />
                  Original
                </Button>
              ) : null}
              {job.remediatedBlobKey ? (
                <Button variant="ghost" onClick={() => void downloadRemediated(job.id)} title="Download the fixed file">
                  <DownloadIcon className="h-4 w-4" />
                  Fixed
                </Button>
              ) : null}
              {job.status === 'failed' && (job.mode === 'grade' || job.mode === 'remediate') ? (
                <Button variant="ghost" onClick={() => void retryJob(job.id)} title="Try again">
                  <RetryIcon className="h-4 w-4" />
                  Retry
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={() => void removeJob(job.id)}
                disabled={
                  job.status === 'uploading' || job.status === 'analyzing' || job.status === 'remediating'
                }
                title="Remove this file"
              >
                <TrashIcon className="h-4 w-4" />
                Remove
              </Button>
            </div>
          </DetailSection>

          <DetailSection title="At a glance">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-[var(--muted)]">Size</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">{formatFileSize(job.fileSize)}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Updated</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">{formatJobTimestamp(job.updatedAt)}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">File type</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {result ? formatPdfClass(result.pdfClass) : 'Not checked yet'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Pages</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {result ? result.pageCount : 'Not checked yet'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Time</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">
                  {remediation
                    ? formatDurationMs(remediation.remediationDurationMs)
                    : result
                      ? formatDurationMs(result.analysisDurationMs)
                      : 'Not checked yet'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Mode</dt>
                <dd className="mt-1 font-semibold text-[var(--foreground)]">{job.mode ?? 'Not picked'}</dd>
              </div>
            </dl>
          </DetailSection>

          {job.errorMessage ? (
            <section className="rounded-[22px] border border-[color:rgba(220,38,38,0.18)] bg-[color:rgba(220,38,38,0.08)] p-4">
              <p className="text-sm font-semibold text-[var(--danger)]">Last problem</p>
              <p className="mt-1 text-sm leading-6 text-[var(--danger)]">{job.errorMessage}</p>
            </section>
          ) : null}

          {(remediation || result) ? (
            <ExpandSection title="Scores" subtitle="See the score and grade." defaultOpen>
              {remediation ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <article className="rounded-[18px] border border-[color:var(--surface-border)] bg-[#f8fafc] px-3 py-3">
                    <p className="text-sm font-medium text-[var(--muted)]">Before</p>
                    <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
                      {formatScoreGrade(remediation.before.score, remediation.before.grade)}
                    </p>
                  </article>
                  <article className="rounded-[18px] border border-[color:var(--surface-border)] bg-[#f8fafc] px-3 py-3">
                    <p className="text-sm font-medium text-[var(--muted)]">After</p>
                    <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
                      {formatScoreGrade(remediation.after.score, remediation.after.grade)}
                    </p>
                  </article>
                </div>
              ) : result ? (
                <article className="rounded-[18px] border border-[color:var(--surface-border)] bg-[#f8fafc] px-3 py-3">
                  <p className="text-sm font-medium text-[var(--muted)]">Current score</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
                    {formatScoreGrade(result.score, result.grade)}
                  </p>
                </article>
              ) : null}
              {remediation?.remediatedPdfTooLarge ? (
                <p className="mt-3 text-sm leading-6 text-[var(--warning)]">
                  The fixed file was too large to download from the API response.
                </p>
              ) : null}
            </ExpandSection>
          ) : null}

          {remediation ? (
            <ExpandSection title="What changed" subtitle="See the tools used to fix the file.">
              <div className="grid gap-2">
                {remediation.appliedTools.length > 0 ? (
                  remediation.appliedTools.map((tool, index) => (
                    <article
                      key={`${tool.toolName}-${tool.round}-${index}`}
                      className="rounded-[18px] border border-[color:var(--surface-border)] bg-[#f8fafc] px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[var(--foreground)]">{tool.toolName}</p>
                        <StatusPill
                          label={tool.outcome}
                          tone={
                            tool.outcome === 'applied'
                              ? 'success'
                              : tool.outcome === 'failed'
                                ? 'danger'
                                : 'accent'
                          }
                        />
                      </div>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        Round {tool.round} · {tool.scoreBefore} to {tool.scoreAfter}
                      </p>
                      {tool.details ? (
                        <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{tool.details}</p>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-[var(--muted)]">No tool notes were saved for this run.</p>
                )}
              </div>
            </ExpandSection>
          ) : null}

          {remediation ? (
            <ExpandSection title="AI help" subtitle="See what the AI part did.">
              <div className="grid gap-2">
                {semanticSummaries.map(({ label, summary }) => (
                  <article
                    key={label}
                    className="rounded-[18px] border border-[color:var(--surface-border)] bg-[#f8fafc] px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--foreground)]">{label}</p>
                      <StatusPill label={summary.skippedReason} tone="accent" />
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Accepted {summary.proposalsAccepted} · Rejected {summary.proposalsRejected} ·
                      Batches {summary.batches.length}
                    </p>
                    {summary.errorMessage ? (
                      <p className="mt-2 text-sm leading-6 text-[var(--danger)]">{summary.errorMessage}</p>
                    ) : null}
                  </article>
                ))}
                {semanticSummaries.length === 0 ? (
                  <p className="text-sm leading-6 text-[var(--muted)]">No AI notes were returned for this run.</p>
                ) : null}
              </div>
            </ExpandSection>
          ) : null}

          {remediation?.ocrPipeline ? (
            <section className="rounded-[22px] border border-[color:rgba(183,121,31,0.18)] bg-[color:rgba(183,121,31,0.08)] p-4">
              <p className="text-sm font-semibold text-[var(--warning)]">OCR note</p>
              <p className="mt-1 text-sm leading-6 text-[var(--warning)]">{remediation.ocrPipeline.guidance}</p>
            </section>
          ) : null}

          {result ? (
            <ExpandSection title="Score by area" subtitle="See how each part did.">
              <div className="grid gap-2">
                {result.categories.map((category) => (
                  <article
                    key={category.key}
                    className="rounded-[18px] border border-[color:var(--surface-border)] bg-[#f8fafc] px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">{category.label}</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {category.findingCount} finding{category.findingCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[var(--foreground)]">{category.score}</p>
                        <p className="text-sm text-[var(--muted)]">{category.severity}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </ExpandSection>
          ) : null}

          {result ? (
            <ExpandSection title="Problems found" subtitle="Open for the full list." defaultOpen>
              <div className="grid gap-2">
                {result.findings.length > 0 ? (
                  result.findings.map((finding) => (
                    <article
                      key={finding.id}
                      className="rounded-[18px] border border-[color:var(--surface-border)] bg-[#f8fafc] px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusPill
                          label={finding.severity}
                          tone={
                            finding.severity === 'critical' || finding.severity === 'moderate'
                              ? 'danger'
                              : finding.severity === 'minor'
                                ? 'warning'
                                : 'success'
                          }
                        />
                        <p className="text-sm font-semibold text-[var(--foreground)]">{finding.title}</p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{finding.summary}</p>
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        {finding.category}
                        {finding.page ? ` · page ${finding.page}` : ''}
                        {finding.count ? ` · count ${finding.count}` : ''}
                      </p>
                      {finding.references.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {finding.references.map((reference) => (
                            <a
                              key={reference.href}
                              href={reference.href}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-medium text-[var(--accent-strong)] underline-offset-2 hover:underline"
                            >
                              {reference.label}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-[var(--muted)]">No findings were saved in the result.</p>
                )}
              </div>
            </ExpandSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}
