'use client';

import type { ReactNode } from 'react';
import { MoreIcon } from '../common/AppIcons';
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

function formatFileAvailability(job: QueueJob): string {
  switch (job.fileStatus) {
    case 'available':
      return 'Ready to download';
    case 'expired':
      return 'Expired';
    case 'quota_deleted':
      return 'Deleted for storage limit';
    case 'failed':
      return 'Not available';
    default:
      return job.hasServerSource ? 'Saved for fixing' : 'Not saved';
  }
}

export function hasUnavailableSemanticHelp(
  semanticSummaries: Array<{ label: string; summary: SemanticSummary }>,
): boolean {
  return semanticSummaries.some(({ summary }) => summary.skippedReason === 'no_llm_config');
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="surface-strong p-3">
      <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
      <div className="mt-2">{children}</div>
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
    <details className="surface-strong p-3" open={defaultOpen}>
      <summary className="flex cursor-pointer items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
          <p className="text-xs leading-5 text-[var(--muted)]">{subtitle}</p>
        </div>
        <MoreIcon className="h-4 w-4 text-[var(--muted)]" />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function QueueDetailDrawer({ job }: { job: QueueJob }) {
  const closeDetail = useQueueStore((state) => state.closeDetail);

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
  const semanticHelpUnavailable = hasUnavailableSemanticHelp(semanticSummaries);

  return (
    <div className="mt-4 overflow-hidden rounded-[24px] border border-[color:var(--surface-border)] bg-[#f8fafc]">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--surface-border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-1.5 w-10 rounded-full bg-[var(--surface-border)]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--foreground)]">More info</p>
            <p className="text-xs leading-5 text-[var(--muted)]">
              Scroll or expand sections below.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="h-9 w-9 p-0 text-base"
          onClick={() => closeDetail()}
          title="Close details"
          aria-label="Close details"
        >
          X
        </Button>
      </div>

      <div className="max-h-[26rem] space-y-3 overflow-y-auto p-3 md:max-h-[28rem]">
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
            <div>
              <dt className="text-[var(--muted)]">Download</dt>
              <dd className="mt-1 font-semibold text-[var(--foreground)]">{formatFileAvailability(job)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Keeps until</dt>
              <dd className="mt-1 font-semibold text-[var(--foreground)]">
                {job.expiresAt ? formatJobTimestamp(job.expiresAt) : 'Not saved'}
              </dd>
            </div>
          </dl>
        </DetailSection>

        {job.errorMessage ? (
          <section className="rounded-[22px] border border-[color:rgba(220,38,38,0.18)] bg-[color:rgba(220,38,38,0.08)] p-4">
            <p className="text-sm font-semibold text-[var(--danger)]">Last problem</p>
            <p className="mt-1 text-sm leading-6 text-[var(--danger)]">{job.errorMessage}</p>
          </section>
        ) : null}

        {job.fileStatus === 'expired' ? (
          <section className="rounded-[22px] border border-[color:rgba(183,121,31,0.18)] bg-[color:rgba(183,121,31,0.08)] p-4">
            <p className="text-sm font-semibold text-[var(--warning)]">Saved file expired</p>
            <p className="mt-1 text-sm leading-6 text-[var(--warning)]">
              The fixed PDF was removed after 24 hours. The results stay here, but the download is gone.
            </p>
          </section>
        ) : null}

        {job.fileStatus === 'quota_deleted' ? (
          <section className="rounded-[22px] border border-[color:rgba(220,38,38,0.18)] bg-[color:rgba(220,38,38,0.08)] p-4">
            <p className="text-sm font-semibold text-[var(--danger)]">Saved file deleted</p>
            <p className="mt-1 text-sm leading-6 text-[var(--danger)]">
              This fixed PDF was removed to keep your saved files under 1 GB.
            </p>
          </section>
        ) : null}

        {(remediation || result) ? (
          <ExpandSection title="Scores" subtitle="See the score and grade." defaultOpen>
            {remediation ? (
              <div className="grid gap-3 md:grid-cols-2">
                <article className="rounded-[18px] border border-[color:var(--surface-border)] bg-white px-3 py-3">
                  <p className="text-sm font-medium text-[var(--muted)]">Before</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
                    {formatScoreGrade(remediation.before.score, remediation.before.grade)}
                  </p>
                </article>
                <article className="rounded-[18px] border border-[color:var(--surface-border)] bg-white px-3 py-3">
                  <p className="text-sm font-medium text-[var(--muted)]">After</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
                    {formatScoreGrade(remediation.after.score, remediation.after.grade)}
                  </p>
                </article>
              </div>
            ) : result ? (
              <article className="rounded-[18px] border border-[color:var(--surface-border)] bg-white px-3 py-3">
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
                    className="rounded-[18px] border border-[color:var(--surface-border)] bg-white px-3 py-3"
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
              {semanticHelpUnavailable ? (
                <section className="rounded-[18px] border border-[color:rgba(183,121,31,0.18)] bg-[color:rgba(183,121,31,0.08)] px-3 py-3">
                  <p className="text-sm font-semibold text-[var(--warning)]">AI semantic fixes unavailable</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--warning)]">
                    AI semantic fixes were not available for this run. Deterministic fixes still ran.
                    Try again after the AI service is healthy.
                  </p>
                </section>
              ) : null}
              {semanticSummaries.map(({ label, summary }) => (
                <article
                  key={label}
                  className="rounded-[18px] border border-[color:var(--surface-border)] bg-white px-3 py-3"
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
                  className="rounded-[18px] border border-[color:var(--surface-border)] bg-white px-3 py-3"
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
                    className="rounded-[18px] border border-[color:var(--surface-border)] bg-white px-3 py-3"
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
  );
}
