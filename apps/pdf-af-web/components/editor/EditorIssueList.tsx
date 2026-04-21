import type { EditorIssue } from '../../types/editor';

interface EditorIssueListProps {
  issues: EditorIssue[];
  selectedIssueId?: string | null;
  onSelectIssue?: (issueId: string) => void;
}

const severityClasses: Record<EditorIssue['severity'], string> = {
  blocker: 'border-[color:rgba(220,38,38,0.24)] bg-[color:rgba(220,38,38,0.06)]',
  warning: 'border-[color:rgba(183,121,31,0.24)] bg-[color:rgba(183,121,31,0.06)]',
  info: 'border-[color:var(--surface-border)] bg-[#f8fafc]',
};

export function EditorIssueList({
  issues,
  selectedIssueId = null,
  onSelectIssue,
}: EditorIssueListProps) {
  if (issues.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--surface-border)] p-4 text-sm text-[var(--muted)]">
        No issues to show.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {issues.map((issue) => {
        const selected = issue.id === selectedIssueId;
        const content = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                {issue.category.replaceAll('_', ' ')}
              </span>
              {issue.page ? (
                <span className="text-[11px] text-[var(--muted)]">Page {issue.page}</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm font-medium text-[var(--foreground)]">{issue.message}</p>
            <p className="mt-1 text-xs capitalize text-[var(--muted)]">
              {issue.severity} · {issue.fixState.replace('-', ' ')}
            </p>
          </>
        );

        if (!onSelectIssue) {
          return (
            <article
              key={issue.id}
              className={`rounded-2xl border p-3 ${severityClasses[issue.severity]} ${
                selected ? 'ring-2 ring-[var(--accent)]' : ''
              }`}
            >
              {content}
            </article>
          );
        }

        return (
          <button
            key={issue.id}
            type="button"
            className={`focus-ring rounded-2xl border p-3 text-left transition ${
              severityClasses[issue.severity]
            } ${selected ? 'ring-2 ring-[var(--accent)]' : 'hover:border-[var(--accent)]'}`}
            onClick={() => onSelectIssue(issue.id)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
