'use client';

import type { ReactNode } from 'react';
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

function getStatusTone(status: string): 'accent' | 'success' | 'danger' {
  if (status === 'done') return 'success';
  if (status === 'failed') return 'danger';
  return 'accent';
}

function getDisplayedResult(job: ReturnType<typeof useQueueStore.getState>['jobs'][number]) {
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
    <section className="surface-strong p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function QueueDetailDrawer() {
  const detailJobId = useQueueStore((state) => state.detailJobId);
  const jobs = useQueueStore((state) => state.jobs);
  const closeDetail = useQueueStore((state) => state.closeDetail);
  const downloadOriginal = useQueueStore((state) => state.downloadOriginal);
  const downloadRemediated = useQueueStore((state) => state.downloadRemediated);
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
    <div className="fixed inset-0 z-40 flex justify-end bg-black/80">
      <div className="surface flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-[color:var(--surface-border)]">
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--surface-border)] px-3 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
              Details
            </p>
            <h2 className="mt-1 break-all text-sm font-bold uppercase tracking-[0.08em] text-[var(--accent-strong)]">
              {job.fileName}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-1">
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
          <Button variant="ghost" onClick={() => closeDetail()}>
            Close
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
          <DetailSection title="Summary">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-[var(--muted)]">Size</dt>
                <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                  {formatFileSize(job.fileSize)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Updated</dt>
                <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                  {formatJobTimestamp(job.updatedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Pdf Class</dt>
                <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                  {result ? formatPdfClass(result.pdfClass) : 'Not analyzed'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Pages</dt>
                <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                  {result ? result.pageCount : 'Not analyzed'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Elapsed</dt>
                <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                  {remediation
                    ? formatDurationMs(remediation.remediationDurationMs)
                    : result
                      ? formatDurationMs(result.analysisDurationMs)
                      : 'Not analyzed'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Mode</dt>
                <dd className="mt-0.5 font-bold text-[var(--foreground)]">
                  {job.mode ?? 'Not queued'}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-1">
              <Button variant="secondary" onClick={() => void downloadOriginal(job.id)}>
                Download Original
              </Button>
              {job.remediatedBlobKey ? (
                <Button variant="secondary" onClick={() => void downloadRemediated(job.id)}>
                  Download Remediated
                </Button>
              ) : null}
              {job.status === 'failed' && (job.mode === 'grade' || job.mode === 'remediate') ? (
                <Button variant="secondary" onClick={() => void retryJob(job.id)}>
                  Retry
                </Button>
              ) : null}
            </div>
          </DetailSection>

          {remediation ? (
            <DetailSection title="Before / After">
              <div className="grid gap-2 md:grid-cols-2">
                <article className="border border-[color:var(--surface-border)] bg-black/30 px-2 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Before
                  </p>
                  <p className="mt-1 text-xs font-bold text-[var(--foreground)]">
                    {formatScoreGrade(remediation.before.score, remediation.before.grade)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {formatPdfClass(remediation.before.pdfClass)} · {remediation.before.pageCount} pages
                  </p>
                </article>
                <article className="border border-[color:var(--surface-border)] bg-black/30 px-2 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                    After
                  </p>
                  <p className="mt-1 text-xs font-bold text-[var(--foreground)]">
                    {formatScoreGrade(remediation.after.score, remediation.after.grade)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {formatPdfClass(remediation.after.pdfClass)} · {remediation.after.pageCount} pages
                  </p>
                </article>
              </div>
              {remediation.remediatedPdfTooLarge ? (
                <p className="mt-2 border border-[color:rgba(255,224,102,0.28)] bg-[color:rgba(255,224,102,0.08)] px-2 py-2 text-xs leading-5 text-[var(--warning)]">
                  Remediated output was too large for inline download from the API response.
                </p>
              ) : null}
            </DetailSection>
          ) : null}

          {job.errorMessage ? (
            <section className="border border-[color:rgba(255,114,114,0.28)] bg-[color:rgba(255,114,114,0.08)] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--danger)]">
                Last Error
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--danger)]">{job.errorMessage}</p>
            </section>
          ) : null}

          {remediation ? (
            <DetailSection title="Applied Tools">
              <div className="grid gap-2">
                {remediation.appliedTools.length > 0 ? (
                  remediation.appliedTools.map((tool, index) => (
                    <article
                      key={`${tool.toolName}-${tool.round}-${index}`}
                      className="border border-[color:var(--surface-border)] bg-black/30 px-2 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-[var(--foreground)]">{tool.toolName}</p>
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
                      <p className="mt-1 text-[11px] text-[var(--muted)]">
                        stage {tool.stage} · round {tool.round} · {tool.scoreBefore} to{' '}
                        {tool.scoreAfter}
                      </p>
                      {tool.details ? (
                        <p className="mt-1 text-xs leading-5 text-[var(--foreground)]">
                          {tool.details}
                        </p>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    No applied tool details were surfaced in the stored remediation summary.
                  </p>
                )}
              </div>
            </DetailSection>
          ) : null}

          {remediation ? (
            <DetailSection title="Semantic">
              <div className="grid gap-2">
                {semanticSummaries.map(({ label, summary }) => (
                  <article
                    key={label}
                    className="border border-[color:var(--surface-border)] bg-black/30 px-2 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[var(--foreground)]">{label}</p>
                      <StatusPill label={summary.skippedReason} tone="accent" />
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      accepted {summary.proposalsAccepted} · rejected {summary.proposalsRejected} ·
                      batches {summary.batches.length}
                    </p>
                    {summary.errorMessage ? (
                      <p className="mt-1 text-xs leading-5 text-[var(--danger)]">
                        {summary.errorMessage}
                      </p>
                    ) : null}
                  </article>
                ))}
                {semanticSummaries.length === 0 ? (
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    No semantic-pass summaries were returned for this remediation run.
                  </p>
                ) : null}
              </div>
            </DetailSection>
          ) : null}

          {remediation?.ocrPipeline ? (
            <section className="border border-[color:rgba(255,224,102,0.28)] bg-[color:rgba(255,224,102,0.08)] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--warning)]">
                Ocr Pipeline
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--warning)]">
                {remediation.ocrPipeline.guidance}
              </p>
            </section>
          ) : null}

          {result ? (
            <DetailSection title="Categories">
              <div className="grid gap-2">
                {result.categories.map((category) => (
                  <article
                    key={category.key}
                    className="border border-[color:var(--surface-border)] bg-black/30 px-2 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-[var(--foreground)]">
                          {category.label}
                        </p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                          {category.findingCount} finding{category.findingCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-[var(--foreground)]">
                          {category.score}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                          {category.severity}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </DetailSection>
          ) : null}

          {result ? (
            <DetailSection title="Findings">
              <div className="grid gap-2">
                {result.findings.length > 0 ? (
                  result.findings.map((finding) => (
                    <article
                      key={finding.id}
                      className="border border-[color:var(--surface-border)] bg-black/30 px-2 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusPill
                          label={finding.severity}
                          tone={
                            finding.severity === 'critical' || finding.severity === 'moderate'
                              ? 'danger'
                              : 'warning'
                          }
                        />
                        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                          {finding.category}
                        </span>
                        {finding.page ? (
                          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                            page {finding.page}
                          </span>
                        ) : null}
                        {finding.count ? (
                          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                            count {finding.count}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs font-bold text-[var(--foreground)]">
                        {finding.title}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--foreground)]">
                        {finding.summary}
                      </p>
                      {finding.references.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {finding.references.map((reference) => (
                            <a
                              key={`${finding.id}-${reference.href}`}
                              href={reference.href}
                              target="_blank"
                              rel="noreferrer"
                              className="focus-ring inline-flex items-center border border-[color:var(--surface-border)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]"
                            >
                              {reference.label}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="text-xs leading-5 text-[var(--muted)]">
                    No actionable findings were surfaced in the stored analysis summary.
                  </p>
                )}
              </div>
            </DetailSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}
