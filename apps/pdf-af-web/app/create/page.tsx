import type { ReactNode } from 'react';
import { ProductNav } from '../../components/common/ProductNav';
import { AddIcon, DownloadIcon, FileIcon, RetryIcon } from '../../components/common/AppIcons';
import { EditorShell } from '../../components/editor/EditorShell';
import type { EditorReadinessSummary, EditorShellModeConfig } from '../../types/editor';

const config: EditorShellModeConfig = {
  mode: 'create',
  title: 'Untitled PDF',
  subtitle: 'Build an accessible PDF from structured content.',
  emptyTitle: 'Create PDF workspace',
  emptyDescription: 'Stage 1 shell only. Authoring tools begin in Stage 2.',
};

const readiness: EditorReadinessSummary = {
  status: 'ready',
  totalIssues: 0,
  unresolvedIssues: 0,
  blockerCount: 0,
  warningCount: 0,
  infoCount: 0,
  fixedCount: 0,
};

function PlaceholderTool({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled
      className="inline-flex size-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[var(--surface)] text-[var(--muted)] opacity-50"
    >
      {children}
    </button>
  );
}

function ToolbarPlaceholders() {
  return (
    <>
      <PlaceholderTool label="Add object">
        <AddIcon className="size-4" />
      </PlaceholderTool>
      <PlaceholderTool label="Select object">
        <FileIcon className="size-4" />
      </PlaceholderTool>
      <PlaceholderTool label="Undo">
        <RetryIcon className="size-4 -scale-x-100" />
      </PlaceholderTool>
      <PlaceholderTool label="Redo">
        <RetryIcon className="size-4" />
      </PlaceholderTool>
      <PlaceholderTool label="Export PDF">
        <DownloadIcon className="size-4" />
      </PlaceholderTool>
    </>
  );
}

export default function CreatePage() {
  return (
    <EditorShell
      config={config}
      issues={[]}
      readiness={readiness}
      beforeToolbar={<ProductNav />}
      pageLabel="0 pages"
      saveStateLabel="Not saved"
    >
      <ToolbarPlaceholders />
    </EditorShell>
  );
}
