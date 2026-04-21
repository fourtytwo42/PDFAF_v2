'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import {
  AddIcon,
  DownloadIcon,
  FileIcon,
  MagicIcon,
  RetryIcon,
  SettingsIcon,
  TrashIcon,
} from '../../common/AppIcons';
import { ProductNav } from '../../common/ProductNav';
import {
  applyPendingFixStateToIssues,
  getEditIssueFixPromptMode,
  isAltTextIssueCategory,
  isMetadataIssueCategory,
} from '../../../lib/editor/editFixes';
import { computeReadinessSummary, filterEditorIssues, sortEditorIssues } from '../../../lib/editor/issues';
import { useEditEditorStore } from '../../../stores/editEditor';
import type { AnalyzeCategorySummary } from '../../../types/analyze';
import type { EditFixInstruction } from '../../../types/editEditor';
import type { EditorIssue, EditorIssueFilter, EditorShellModeConfig } from '../../../types/editor';
import { EditorInspector } from '../EditorInspector';
import { EditorIssueList } from '../EditorIssueList';
import { EditorRail } from '../EditorRail';
import { EditorShell } from '../EditorShell';
import { EditPdfViewer } from './EditPdfViewer';

const config: EditorShellModeConfig = {
  mode: 'edit',
  title: 'Edit PDF',
  subtitle: 'Review accessibility findings in one existing PDF.',
  emptyTitle: 'Edit PDF workspace',
  emptyDescription: 'Open one PDF to review analyzer findings.',
};

interface EditEditorWorkspaceProps {
  defaultApiBaseUrl: string;
}

const severityOptions: Array<{ label: string; value: NonNullable<EditorIssueFilter['severity']> }> = [
  { label: 'All', value: 'all' },
  { label: 'Blockers', value: 'blocker' },
  { label: 'Warnings', value: 'warning' },
  { label: 'Info', value: 'info' },
];

const fixStateOptions: Array<{ label: string; value: NonNullable<EditorIssueFilter['fixState']> }> = [
  { label: 'Open', value: 'needs-input' },
  { label: 'All', value: 'all' },
];

function stopEvent(event: DragEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function IconButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="focus-ring inline-flex size-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[var(--surface)] text-[var(--muted)] transition enabled:hover:border-[var(--accent)] enabled:hover:text-[var(--accent)] disabled:opacity-45"
    >
      {children}
    </button>
  );
}

function UploadPanel({
  onOpen,
  disabled,
}: {
  onOpen: (files: FileList | null) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOpen(event.target.files);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    stopEvent(event);
    setIsDragging(false);
    onOpen(event.dataTransfer.files);
  };

  return (
    <div
      className={`rounded-2xl border border-dashed p-4 transition ${
        isDragging
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
          : 'border-[color:var(--surface-border)] bg-[var(--surface)]'
      }`}
      onDragEnter={(event) => {
        stopEvent(event);
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        stopEvent(event);
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        stopEvent(event);
        setIsDragging(false);
      }}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleInputChange}
      />
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <FileIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--foreground)]">Open one PDF</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            The file stays browser-local except for transient analysis upload.
          </p>
        </div>
      </div>
      <button
        type="button"
        className="focus-ring mt-4 inline-flex h-9 w-full items-center justify-center rounded-full bg-[var(--foreground)] px-3 text-sm font-semibold text-[var(--background)] disabled:opacity-45"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {disabled ? 'Analyzing...' : 'Choose PDF'}
      </button>
    </div>
  );
}

function FilterButtons({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              className={`focus-ring rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                selected
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[color:var(--surface-border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]'
              }`}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategorySummaryList({ categories }: { categories: AnalyzeCategorySummary[] }) {
  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--surface-border)] p-4 text-sm text-[var(--muted)]">
        Category scores appear after analysis.
      </div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {categories.map((category) => (
        <article
          key={category.key}
          className="rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-[var(--foreground)]">{category.label}</p>
            <span className="text-sm font-semibold text-[var(--accent)]">{category.score}</span>
          </div>
          <p className="mt-1 text-xs capitalize text-[var(--muted)]">
            {category.applicable ? category.severity : 'not applicable'} · {category.findingCount} findings
          </p>
        </article>
      ))}
    </div>
  );
}

function DocumentFixPanel({
  disabled,
  onUpsertFix,
}: {
  disabled: boolean;
  onUpsertFix: (fix: EditFixInstruction) => void;
}) {
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('en-US');

  return (
    <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-3">
      <p className="text-sm font-semibold text-[var(--foreground)]">Document fixes</p>
      <div className="mt-3 grid gap-2">
        <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
          Title
          <input
            className="h-9 rounded-xl border border-[color:var(--surface-border)] bg-white px-3 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            value={title}
            disabled={disabled}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Accessible document title"
          />
        </label>
        <button
          type="button"
          disabled={disabled || title.trim().length === 0}
          className="focus-ring h-8 rounded-full bg-[var(--foreground)] px-3 text-xs font-semibold text-[var(--background)] disabled:opacity-45"
          onClick={() => onUpsertFix({ type: 'set_document_title', title })}
        >
          Queue title
        </button>
        <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
          Language
          <input
            className="h-9 rounded-xl border border-[color:var(--surface-border)] bg-white px-3 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            value={language}
            disabled={disabled}
            onChange={(event) => setLanguage(event.target.value)}
            placeholder="en-US"
          />
        </label>
        <button
          type="button"
          disabled={disabled || language.trim().length === 0}
          className="focus-ring h-8 rounded-full bg-[var(--foreground)] px-3 text-xs font-semibold text-[var(--background)] disabled:opacity-45"
          onClick={() => onUpsertFix({ type: 'set_document_language', language })}
        >
          Queue language
        </button>
      </div>
    </div>
  );
}

function PageList({
  pageCount,
  selectedPage,
  issues,
  onSelectPage,
}: {
  pageCount: number;
  selectedPage: number;
  issues: EditorIssue[];
  onSelectPage: (page: number) => void;
}) {
  if (pageCount <= 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--surface-border)] p-3 text-sm text-[var(--muted)]">
        Pages appear after analysis or PDF loading.
      </div>
    );
  }

  return (
    <div className="grid max-h-64 gap-1.5 overflow-auto pr-1">
      {Array.from({ length: pageCount }, (_, index) => {
        const page = index + 1;
        const pageIssueCount = issues.filter((issue) => issue.page === page).length;
        const selected = page === selectedPage;
        return (
          <button
            key={page}
            type="button"
            className={`focus-ring flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${
              selected
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[color:var(--surface-border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]'
            }`}
            onClick={() => onSelectPage(page)}
          >
            <span className="font-semibold">Page {page}</span>
            <span className="text-xs">{pageIssueCount}</span>
          </button>
        );
      })}
    </div>
  );
}

function RenderWorkspace({
  sourceBlob,
  result,
  selectedPage,
  zoom,
  issues,
  selectedIssueId,
  onSelectIssue,
  onSelectPage,
  onRenderStatusChange,
}: {
  sourceBlob: Blob | null;
  result: ReturnType<typeof useEditEditorStore.getState>['lastAnalyzeResult'];
  selectedPage: number;
  zoom: number;
  issues: EditorIssue[];
  selectedIssueId: string | null;
  onSelectIssue: (issueId: string) => void;
  onSelectPage: (page: number) => void;
  onRenderStatusChange: ReturnType<typeof useEditEditorStore.getState>['setRenderStatus'];
}) {
  return (
    <div className="grid gap-4">
      {result ? (
        <>
          <section className="rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                  Analysis
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                  {result.score}/100 · Grade {result.grade}
                </h2>
                <p className="mt-1 text-sm capitalize text-[var(--muted)]">
                  {result.pageCount} pages · {result.pdfClass.replaceAll('_', ' ')} ·{' '}
                  {Math.round(result.analysisDurationMs)} ms
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-right">
                <p className="text-xs font-semibold text-[var(--muted)]">Findings</p>
                <p className="text-xl font-semibold text-[var(--accent)]">{result.findings.length}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Category review</h3>
              <span className="text-xs text-[var(--muted)]">Overlay evidence appears on rendered pages</span>
            </div>
            <CategorySummaryList categories={result.categories} />
          </section>
        </>
      ) : null}

      <EditPdfViewer
        sourceBlob={sourceBlob}
        pageCount={result?.pageCount ?? 0}
        selectedPage={selectedPage}
        zoom={zoom}
        issues={issues}
        selectedIssueId={selectedIssueId}
        onSelectIssue={onSelectIssue}
        onSelectPage={onSelectPage}
        onRenderStatusChange={onRenderStatusChange}
      />
    </div>
  );
}

function IssueInspector({
  issue,
  result,
  error,
  pendingFixes,
  disabled,
  onUpsertFix,
}: {
  issue: EditorIssue | null;
  result: ReturnType<typeof useEditEditorStore.getState>['lastAnalyzeResult'];
  error: string | null;
  pendingFixes: EditFixInstruction[];
  disabled: boolean;
  onUpsertFix: (fix: EditFixInstruction) => void;
}) {
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [altText, setAltText] = useState('');
  const objectRef = issue?.target?.objectRef;
  const isAltIssue = issue ? isAltTextIssueCategory(issue.category) : false;
  const isMetadataIssue = issue ? isMetadataIssueCategory(issue.category) : false;
  const titleQueued = pendingFixes.some((fix) => fix.type === 'set_document_title');
  const languageQueued = pendingFixes.some((fix) => fix.type === 'set_document_language');

  return (
    <EditorInspector title="Review">
      {error ? (
        <div className="mb-3 rounded-2xl border border-[color:rgba(220,38,38,0.24)] bg-[color:rgba(220,38,38,0.06)] p-3 text-sm leading-6 text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mb-3 rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">Score</p>
          <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
            {result.score}/100 · {result.grade}
          </p>
        </div>
      ) : null}

      {!issue ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--surface-border)] p-4 text-sm leading-6 text-[var(--muted)]">
          Select an issue to review details and available fixes.
        </div>
      ) : (
        <article className="grid gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
              {issue.category.replaceAll('_', ' ')}
            </p>
            <h2 className="mt-1 text-base font-semibold text-[var(--foreground)]">{issue.message}</h2>
            <p className="mt-1 text-xs capitalize text-[var(--muted)]">
              {issue.severity} · {issue.fixState.replace('-', ' ')}
              {issue.page ? ` · Page ${issue.page}` : ''}
            </p>
          </div>

          {issue.whyItMatters ? (
            <p className="rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-3 text-sm leading-6 text-[var(--muted)]">
              {issue.whyItMatters}
            </p>
          ) : null}

          {issue.standardsLinks?.length ? (
            <div className="grid gap-2">
              <p className="text-xs font-semibold text-[var(--foreground)]">Standards</p>
              {issue.standardsLinks.map((link) => (
                <a
                  key={`${link.label}-${link.href}`}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-[var(--accent)] underline-offset-4 hover:underline"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}

          {isMetadataIssue ? (
            <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-3">
              <p className="text-sm font-semibold text-[var(--foreground)]">Metadata fixes</p>
              <div className="mt-3 grid gap-2">
                <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
                  Title
                  <input
                    className="h-9 rounded-xl border border-[color:var(--surface-border)] bg-white px-3 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                    value={title}
                    disabled={disabled}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Accessible document title"
                  />
                </label>
                <button
                  type="button"
                  disabled={disabled || title.trim().length === 0}
                  className="focus-ring h-9 rounded-full bg-[var(--foreground)] px-3 text-xs font-semibold text-[var(--background)] disabled:opacity-45"
                  onClick={() => onUpsertFix({ type: 'set_document_title', title })}
                >
                  Queue title fix
                </button>
                <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
                  Language
                  <input
                    className="h-9 rounded-xl border border-[color:var(--surface-border)] bg-white px-3 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                    value={language}
                    disabled={disabled}
                    onChange={(event) => setLanguage(event.target.value)}
                    placeholder="en-US"
                  />
                </label>
                <button
                  type="button"
                  disabled={disabled || language.trim().length === 0}
                  className="focus-ring h-9 rounded-full bg-[var(--foreground)] px-3 text-xs font-semibold text-[var(--background)] disabled:opacity-45"
                  onClick={() => onUpsertFix({ type: 'set_document_language', language })}
                >
                  Queue language fix
                </button>
                {titleQueued || languageQueued ? (
                  <p className="text-xs font-semibold text-[var(--accent)]">
                    {titleQueued && languageQueued
                      ? 'Title and language fixes queued.'
                      : titleQueued
                        ? 'Title fix queued.'
                        : 'Language fix queued.'}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {!isAltIssue && !isMetadataIssue ? (
            <button
              type="button"
              disabled
              className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--muted)] opacity-50"
            >
              Fix in later stage
            </button>
          ) : null}

          {isAltIssue ? (
            <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-3">
              <p className="text-sm font-semibold text-[var(--foreground)]">Alt text fix</p>
              {objectRef ? (
                <div className="mt-3 grid gap-2">
                  <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
                    Alt text
                    <textarea
                      className="min-h-20 rounded-xl border border-[color:var(--surface-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                      value={altText}
                      disabled={disabled}
                      onChange={(event) => setAltText(event.target.value)}
                      placeholder="Describe the meaningful image content."
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={disabled || altText.trim().length === 0}
                      className="focus-ring h-9 rounded-full bg-[var(--foreground)] px-3 text-xs font-semibold text-[var(--background)] disabled:opacity-45"
                      onClick={() =>
                        onUpsertFix({
                          type: 'set_figure_alt_text',
                          objectRef,
                          altText,
                        })
                      }
                    >
                      Queue alt
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      className="focus-ring h-9 rounded-full border border-[color:var(--surface-border)] px-3 text-xs font-semibold text-[var(--foreground)] disabled:opacity-45"
                      onClick={() =>
                        onUpsertFix({
                          type: 'mark_figure_decorative',
                          objectRef,
                        })
                      }
                    >
                      Decorative
                    </button>
                  </div>
                  {pendingFixes.some((fix) => 'objectRef' in fix && fix.objectRef === objectRef) ? (
                    <p className="text-xs font-semibold text-[var(--accent)]">Fix queued for this figure.</p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  This finding does not include a stable target reference yet, so targeted alt repair is unavailable.
                </p>
              )}
            </div>
          ) : null}
        </article>
      )}
    </EditorInspector>
  );
}

function IssueFixPrompt({
  issue,
  pendingFixes,
  disabled,
  applyDisabled,
  applyStatus,
  onClose,
  onUpsertFix,
  onApplyFixes,
}: {
  issue: EditorIssue | null;
  pendingFixes: EditFixInstruction[];
  disabled: boolean;
  applyDisabled: boolean;
  applyStatus: ReturnType<typeof useEditEditorStore.getState>['applyStatus'];
  onClose: () => void;
  onUpsertFix: (fix: EditFixInstruction) => void;
  onApplyFixes: () => void;
}) {
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [altText, setAltText] = useState('');

  useEffect(() => {
    if (!issue) return;
    setTitle('');
    setLanguage('en-US');
    setAltText('');
  }, [issue?.id]);

  if (!issue) return null;

  const promptMode = getEditIssueFixPromptMode(issue);
  const isMetadataIssue = promptMode === 'metadata';
  const isAltIssue = promptMode === 'alt-text';
  const objectRef = issue.target?.objectRef;
  const titleQueued = pendingFixes.some((fix) => fix.type === 'set_document_title');
  const languageQueued = pendingFixes.some((fix) => fix.type === 'set_document_language');
  const figureQueued = Boolean(
    objectRef && pendingFixes.some((fix) => 'objectRef' in fix && fix.objectRef === objectRef),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.42)] px-3 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-issue-fix-title"
      onMouseDown={onClose}
    >
      <section
        className="max-h-[min(720px,calc(100vh-3rem))] w-full max-w-lg overflow-auto rounded-2xl border border-[color:var(--surface-border)] bg-[var(--background)] p-4 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
              {issue.category.replaceAll('_', ' ')}
            </p>
            <h2 id="edit-issue-fix-title" className="mt-1 text-lg font-semibold text-[var(--foreground)]">
              {issue.message}
            </h2>
            <p className="mt-1 text-xs capitalize text-[var(--muted)]">
              {issue.severity} · {issue.fixState.replace('-', ' ')}
              {issue.page ? ` · Page ${issue.page}` : ''}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close fix prompt"
            title="Close"
            className="focus-ring inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            onClick={onClose}
          >
            <span className="text-lg leading-none">x</span>
          </button>
        </div>

        {issue.whyItMatters ? (
          <p className="mt-4 rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-3 text-sm leading-6 text-[var(--muted)]">
            {issue.whyItMatters}
          </p>
        ) : null}

        {isMetadataIssue ? (
          <div className="mt-4 grid gap-3 rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-3">
            <p className="text-sm font-semibold text-[var(--foreground)]">Fix document metadata</p>
            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
              Title
              <input
                className="h-10 rounded-xl border border-[color:var(--surface-border)] bg-white px-3 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                value={title}
                disabled={disabled}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Accessible document title"
              />
            </label>
            <button
              type="button"
              disabled={disabled || title.trim().length === 0}
              className="focus-ring h-9 rounded-full bg-[var(--foreground)] px-3 text-sm font-semibold text-[var(--background)] disabled:opacity-45"
              onClick={() => onUpsertFix({ type: 'set_document_title', title })}
            >
              Queue title fix
            </button>
            <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
              Language
              <input
                className="h-10 rounded-xl border border-[color:var(--surface-border)] bg-white px-3 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                value={language}
                disabled={disabled}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="en-US"
              />
            </label>
            <button
              type="button"
              disabled={disabled || language.trim().length === 0}
              className="focus-ring h-9 rounded-full bg-[var(--foreground)] px-3 text-sm font-semibold text-[var(--background)] disabled:opacity-45"
              onClick={() => onUpsertFix({ type: 'set_document_language', language })}
            >
              Queue language fix
            </button>
            {titleQueued || languageQueued ? (
              <p className="text-xs font-semibold text-[var(--accent)]">
                {titleQueued && languageQueued
                  ? 'Title and language fixes are queued.'
                  : titleQueued
                    ? 'Title fix is queued.'
                    : 'Language fix is queued.'}
              </p>
            ) : null}
          </div>
        ) : null}

        {isAltIssue ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-3">
            <p className="text-sm font-semibold text-[var(--foreground)]">Fix image description</p>
            {objectRef ? (
              <div className="mt-3 grid gap-3">
                <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">
                  Alt text
                  <textarea
                    className="min-h-24 rounded-xl border border-[color:var(--surface-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                    value={altText}
                    disabled={disabled}
                    onChange={(event) => setAltText(event.target.value)}
                    placeholder="Describe the meaningful image content."
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={disabled || altText.trim().length === 0}
                    className="focus-ring h-9 rounded-full bg-[var(--foreground)] px-3 text-xs font-semibold text-[var(--background)] disabled:opacity-45"
                    onClick={() => onUpsertFix({ type: 'set_figure_alt_text', objectRef, altText })}
                  >
                    Queue alt text
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    className="focus-ring h-9 rounded-full border border-[color:var(--surface-border)] px-3 text-xs font-semibold text-[var(--foreground)] disabled:opacity-45"
                    onClick={() => onUpsertFix({ type: 'mark_figure_decorative', objectRef })}
                  >
                    Mark decorative
                  </button>
                </div>
                {figureQueued ? (
                  <p className="text-xs font-semibold text-[var(--accent)]">A fix is queued for this figure.</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                This finding does not include a stable target reference yet, so targeted alt repair is unavailable.
              </p>
            )}
          </div>
        ) : null}

        {!isMetadataIssue && !isAltIssue ? (
          <div className="mt-4 grid gap-3 rounded-2xl border border-dashed border-[color:var(--surface-border)] p-4 text-sm leading-6 text-[var(--muted)]">
            <p>
              Guided repair is not available for this finding yet. You can still review the evidence here or run
              auto-fix from the editor toolbar for broad remediation.
            </p>
            {issue.standardsLinks?.length ? (
              <div className="grid gap-2">
                <p className="text-xs font-semibold text-[var(--foreground)]">Standards</p>
                {issue.standardsLinks.map((link) => (
                  <a
                    key={`${link.label}-${link.href}`}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-[var(--accent)] underline-offset-4 hover:underline"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            disabled={applyDisabled}
            className="focus-ring h-10 rounded-full bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] disabled:opacity-45"
            onClick={onApplyFixes}
          >
            {applyStatus === 'applying' ? 'Applying...' : 'Apply queued fixes'}
          </button>
          <button
            type="button"
            className="focus-ring h-10 rounded-full border border-[color:var(--surface-border)] px-4 text-sm font-semibold text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

export function EditEditorWorkspace({ defaultApiBaseUrl }: EditEditorWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [promptIssueId, setPromptIssueId] = useState<string | null>(null);
  const sourceFile = useEditEditorStore((state) => state.sourceFile);
  const sourceBlob = useEditEditorStore((state) => state.sourceBlob);
  const analyzeStatus = useEditEditorStore((state) => state.analyzeStatus);
  const analyzeError = useEditEditorStore((state) => state.analyzeError);
  const renderStatus = useEditEditorStore((state) => state.renderStatus);
  const renderError = useEditEditorStore((state) => state.renderError);
  const pendingFixes = useEditEditorStore((state) => state.pendingFixes);
  const applyStatus = useEditEditorStore((state) => state.applyStatus);
  const applyError = useEditEditorStore((state) => state.applyError);
  const fixedSourceBlob = useEditEditorStore((state) => state.fixedSourceBlob);
  const scoreDelta = useEditEditorStore((state) => state.scoreDelta);
  const selectedIssueId = useEditEditorStore((state) => state.selectedIssueId);
  const selectedPage = useEditEditorStore((state) => state.selectedPage);
  const zoom = useEditEditorStore((state) => state.zoom);
  const issueFilter = useEditEditorStore((state) => state.issueFilter);
  const lastAnalyzeResult = useEditEditorStore((state) => state.lastAnalyzeResult);
  const issues = useEditEditorStore((state) => state.issues);
  const validationMessage = useEditEditorStore((state) => state.validationMessage);
  const hydrate = useEditEditorStore((state) => state.hydrate);
  const openFile = useEditEditorStore((state) => state.openFile);
  const reanalyze = useEditEditorStore((state) => state.reanalyze);
  const clearDocument = useEditEditorStore((state) => state.clearDocument);
  const setIssueFilter = useEditEditorStore((state) => state.setIssueFilter);
  const selectIssue = useEditEditorStore((state) => state.selectIssue);
  const selectAdjacentIssue = useEditEditorStore((state) => state.selectAdjacentIssue);
  const selectPage = useEditEditorStore((state) => state.selectPage);
  const zoomIn = useEditEditorStore((state) => state.zoomIn);
  const zoomOut = useEditEditorStore((state) => state.zoomOut);
  const resetZoom = useEditEditorStore((state) => state.resetZoom);
  const setRenderStatus = useEditEditorStore((state) => state.setRenderStatus);
  const upsertPendingFix = useEditEditorStore((state) => state.upsertPendingFix);
  const clearPendingFixes = useEditEditorStore((state) => state.clearPendingFixes);
  const applyPendingFixes = useEditEditorStore((state) => state.applyPendingFixes);
  const autoFixCurrentPdf = useEditEditorStore((state) => state.autoFixCurrentPdf);
  const revertToOriginal = useEditEditorStore((state) => state.revertToOriginal);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const issuesWithPendingState = useMemo(
    () => applyPendingFixStateToIssues(issues, pendingFixes),
    [issues, pendingFixes],
  );
  const filteredIssues = useMemo(
    () => sortEditorIssues(filterEditorIssues(issuesWithPendingState, issueFilter)),
    [issuesWithPendingState, issueFilter],
  );
  const readiness = useMemo(() => computeReadinessSummary(filteredIssues), [filteredIssues]);
  const selectedIssue = useMemo(
    () => issuesWithPendingState.find((issue) => issue.id === selectedIssueId) ?? null,
    [issuesWithPendingState, selectedIssueId],
  );
  const promptIssue = useMemo(
    () => issuesWithPendingState.find((issue) => issue.id === promptIssueId) ?? null,
    [issuesWithPendingState, promptIssueId],
  );
  const isBusy = analyzeStatus === 'analyzing' || analyzeStatus === 'hydrating' || applyStatus === 'applying';
  const pageLabel = lastAnalyzeResult ? `${lastAnalyzeResult.pageCount} pages` : '0 pages';
  const saveStateLabel =
    renderStatus === 'failed'
      ? 'Render failed'
      : applyStatus === 'applying'
      ? 'Applying fixes'
      : applyStatus === 'complete'
      ? 'Fixed'
      : analyzeStatus === 'failed'
      ? 'Analyze failed'
      : analyzeStatus === 'complete'
        ? renderStatus === 'loading' || renderStatus === 'rendering'
          ? 'Rendering'
          : 'Analyzed'
        : analyzeStatus === 'analyzing'
          ? 'Analyzing'
          : sourceFile
            ? 'Ready'
            : 'No PDF';

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    void openFile(file, defaultApiBaseUrl);
  };

  const handleSelectIssue = (issueId: string) => {
    selectIssue(issueId);
    setPromptIssueId(issueId);
  };

  const handleApplyPromptFixes = () => {
    void applyPendingFixes(defaultApiBaseUrl);
  };

  const handleAutoFix = () => {
    void autoFixCurrentPdf(defaultApiBaseUrl);
  };

  return (
    <>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <EditorShell
        config={config}
        issues={filteredIssues}
        readiness={readiness}
        selectedIssueId={selectedIssueId}
        onSelectIssue={handleSelectIssue}
        beforeToolbar={<ProductNav />}
        pageLabel={pageLabel}
        saveStateLabel={saveStateLabel}
        toolbarActions={
          <>
            <IconButton label="Open PDF" disabled={isBusy} onClick={() => inputRef.current?.click()}>
              <FileIcon className="size-4" />
            </IconButton>
            <IconButton
              label="Previous page"
              disabled={!sourceBlob || selectedPage <= 1}
              onClick={() => selectPage(selectedPage - 1)}
            >
              <RetryIcon className="size-4 -scale-x-100" />
            </IconButton>
            <IconButton
              label="Next page"
              disabled={!sourceBlob || selectedPage >= (lastAnalyzeResult?.pageCount ?? 1)}
              onClick={() => selectPage(selectedPage + 1)}
            >
              <RetryIcon className="size-4" />
            </IconButton>
            <IconButton label="Zoom out" disabled={!sourceBlob} onClick={zoomOut}>
              <span className="text-lg leading-none">-</span>
            </IconButton>
            <IconButton label="Reset zoom" disabled={!sourceBlob} onClick={resetZoom}>
              <span className="text-xs font-semibold">{Math.round(zoom * 100)}%</span>
            </IconButton>
            <IconButton label="Zoom in" disabled={!sourceBlob} onClick={zoomIn}>
              <AddIcon className="size-4" />
            </IconButton>
            <IconButton
              label="Re-analyze PDF"
              disabled={isBusy || !sourceFile}
              onClick={() => void reanalyze(defaultApiBaseUrl)}
            >
              <RetryIcon className={`size-4 ${isBusy ? 'animate-spin' : ''}`} />
            </IconButton>
            <IconButton
              label="Auto-fix current PDF"
              disabled={isBusy || !sourceBlob}
              onClick={handleAutoFix}
            >
              <MagicIcon className="size-4" />
            </IconButton>
            <IconButton
              label="Previous issue"
              disabled={!filteredIssues.length}
              onClick={() => selectAdjacentIssue('previous')}
            >
              <RetryIcon className="size-4 -scale-x-100" />
            </IconButton>
            <IconButton
              label="Next issue"
              disabled={!filteredIssues.length}
              onClick={() => selectAdjacentIssue('next')}
            >
              <RetryIcon className="size-4" />
            </IconButton>
            <IconButton label="Export fixed PDF in later stage" disabled>
              <DownloadIcon className="size-4" />
            </IconButton>
          </>
        }
        slots={{
          leftRail: (
            <EditorRail>
              <div className="grid gap-3">
                <UploadPanel onOpen={handleFiles} disabled={isBusy} />
                {sourceFile ? (
                  <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                          {sourceFile.fileName}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {formatBytes(sourceFile.fileSize)}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Clear PDF"
                        title="Clear PDF"
                        className="focus-ring inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--surface-border)] text-[var(--muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
                        onClick={() => void clearDocument()}
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </div>
                  </div>
                ) : null}

                {validationMessage ? (
                  <p className="rounded-2xl border border-[color:rgba(183,121,31,0.2)] bg-[color:rgba(183,121,31,0.08)] px-3 py-2 text-sm leading-6 text-[var(--warning)]">
                    {validationMessage}
                  </p>
                ) : null}

                <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <SettingsIcon className="size-4 text-[var(--muted)]" />
                    <p className="text-sm font-semibold text-[var(--foreground)]">Filters</p>
                  </div>
                  <div className="grid gap-3">
                    <FilterButtons
                      label="Severity"
                      options={severityOptions}
                      value={issueFilter.severity ?? 'all'}
                      onChange={(value) =>
                        setIssueFilter({ severity: value as NonNullable<EditorIssueFilter['severity']> })
                      }
                    />
                    <FilterButtons
                      label="State"
                      options={fixStateOptions}
                      value={issueFilter.fixState ?? 'needs-input'}
                      onChange={(value) =>
                        setIssueFilter({ fixState: value as NonNullable<EditorIssueFilter['fixState']> })
                      }
                    />
                  </div>
                </div>

                <DocumentFixPanel disabled={isBusy || !sourceFile} onUpsertFix={upsertPendingFix} />

                <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">Pending fixes</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{pendingFixes.length} queued</p>
                    </div>
                    {scoreDelta !== null ? (
                      <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
                        {scoreDelta >= 0 ? '+' : ''}
                        {scoreDelta}
                      </span>
                    ) : null}
                  </div>
                  {applyError ? (
                    <p className="mt-2 rounded-xl border border-[color:rgba(220,38,38,0.24)] bg-[color:rgba(220,38,38,0.06)] px-3 py-2 text-xs text-[var(--danger)]">
                      {applyError}
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-2">
                    <button
                      type="button"
                      disabled={isBusy || pendingFixes.length === 0}
                      className="focus-ring h-9 rounded-full bg-[var(--foreground)] px-3 text-sm font-semibold text-[var(--background)] disabled:opacity-45"
                      onClick={() => void applyPendingFixes(defaultApiBaseUrl)}
                    >
                      {applyStatus === 'applying' ? 'Applying...' : 'Apply fixes'}
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isBusy || pendingFixes.length === 0}
                        className="focus-ring h-8 rounded-full border border-[color:var(--surface-border)] px-3 text-xs font-semibold text-[var(--muted)] disabled:opacity-45"
                        onClick={clearPendingFixes}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || !fixedSourceBlob}
                        className="focus-ring h-8 rounded-full border border-[color:var(--surface-border)] px-3 text-xs font-semibold text-[var(--muted)] disabled:opacity-45"
                        onClick={revertToOriginal}
                      >
                        Revert
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-[var(--foreground)]">Pages</p>
                  <PageList
                    pageCount={lastAnalyzeResult?.pageCount ?? 0}
                    selectedPage={selectedPage}
                    issues={issuesWithPendingState}
                    onSelectPage={selectPage}
                  />
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-[var(--foreground)]">Issues</p>
                  <EditorIssueList
                    issues={filteredIssues}
                    selectedIssueId={selectedIssueId}
                    onSelectIssue={handleSelectIssue}
                  />
                </div>
              </div>
            </EditorRail>
          ),
          workspace: (
            <RenderWorkspace
              sourceBlob={sourceBlob}
              result={lastAnalyzeResult}
              selectedPage={selectedPage}
              zoom={zoom}
              issues={filteredIssues}
              selectedIssueId={selectedIssueId}
              onSelectIssue={handleSelectIssue}
              onSelectPage={selectPage}
              onRenderStatusChange={setRenderStatus}
            />
          ),
          inspector: (
            <IssueInspector
              issue={selectedIssue}
              result={lastAnalyzeResult}
              error={analyzeError ?? renderError}
              pendingFixes={pendingFixes}
              disabled={isBusy}
              onUpsertFix={upsertPendingFix}
            />
          ),
        }}
      />
      <IssueFixPrompt
        issue={promptIssue}
        pendingFixes={pendingFixes}
        disabled={isBusy}
        applyDisabled={isBusy || pendingFixes.length === 0}
        applyStatus={applyStatus}
        onClose={() => setPromptIssueId(null)}
        onUpsertFix={upsertPendingFix}
        onApplyFixes={handleApplyPromptFixes}
      />
    </>
  );
}
