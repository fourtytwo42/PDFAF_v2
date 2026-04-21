import type { ReactNode } from 'react';
import { ProductNav } from '../../components/common/ProductNav';
import { DownloadIcon, FileIcon, MagicIcon, RetryIcon } from '../../components/common/AppIcons';
import { EditorShell } from '../../components/editor/EditorShell';
import type { EditorReadinessSummary, EditorShellModeConfig } from '../../types/editor';

const config: EditorShellModeConfig = {
  mode: 'edit',
  title: 'No PDF selected',
  subtitle: 'Review and fix accessibility issues in an existing PDF.',
  emptyTitle: 'Edit PDF workspace',
  emptyDescription: 'Stage 1 shell only. Upload and analysis begin in Stage 4.',
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
      <PlaceholderTool label="Open PDF">
        <FileIcon className="size-4" />
      </PlaceholderTool>
      <PlaceholderTool label="Auto-fix">
        <MagicIcon className="size-4" />
      </PlaceholderTool>
      <PlaceholderTool label="Previous issue">
        <RetryIcon className="size-4 -scale-x-100" />
      </PlaceholderTool>
      <PlaceholderTool label="Next issue">
        <RetryIcon className="size-4" />
      </PlaceholderTool>
      <PlaceholderTool label="Export fixed PDF">
        <DownloadIcon className="size-4" />
      </PlaceholderTool>
    </>
  );
}

export default function EditPage() {
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
