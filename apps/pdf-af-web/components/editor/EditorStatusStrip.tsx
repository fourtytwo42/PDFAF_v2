import type { EditorReadinessSummary } from '../../types/editor';

interface EditorStatusStripProps {
  readiness: EditorReadinessSummary;
  pageLabel?: string;
  saveStateLabel?: string;
}

const readinessLabels: Record<EditorReadinessSummary['status'], string> = {
  ready: 'Ready',
  needs_attention: 'Needs attention',
  blocked: 'Blocked',
};

const readinessClasses: Record<EditorReadinessSummary['status'], string> = {
  ready: 'text-[var(--success)]',
  needs_attention: 'text-[var(--warning)]',
  blocked: 'text-[var(--danger)]',
};

export function EditorStatusStrip({
  readiness,
  pageLabel = 'No pages',
  saveStateLabel = 'Not saved',
}: EditorStatusStripProps) {
  return (
    <footer className="surface-strong flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-xs text-[var(--muted)]">
      <div className="flex items-center gap-3">
        <span className={`font-semibold ${readinessClasses[readiness.status]}`}>
          {readinessLabels[readiness.status]}
        </span>
        <span>{readiness.unresolvedIssues} unresolved</span>
        <span>{readiness.fixedCount} fixed</span>
      </div>
      <div className="flex items-center gap-3">
        <span>{pageLabel}</span>
        <span>{saveStateLabel}</span>
      </div>
    </footer>
  );
}
