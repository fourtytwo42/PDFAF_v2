import type { ReactNode } from 'react';
import type {
  EditorIssue,
  EditorReadinessSummary,
  EditorShellModeConfig,
  EditorShellSlots,
} from '../../types/editor';
import { EditorInspector } from './EditorInspector';
import { EditorIssueList } from './EditorIssueList';
import { EditorRail } from './EditorRail';
import { EditorStatusStrip } from './EditorStatusStrip';
import { EditorToolbar } from './EditorToolbar';

interface EditorShellProps {
  config: EditorShellModeConfig;
  issues: EditorIssue[];
  readiness: EditorReadinessSummary;
  selectedIssueId?: string | null;
  onSelectIssue?: (issueId: string) => void;
  beforeToolbar?: ReactNode;
  slots?: EditorShellSlots;
  toolbarActions?: ReactNode;
  pageLabel?: string;
  saveStateLabel?: string;
  children?: ReactNode;
}

export function EditorShell({
  config,
  issues,
  readiness,
  selectedIssueId = null,
  onSelectIssue,
  beforeToolbar,
  slots = {},
  toolbarActions,
  pageLabel,
  saveStateLabel,
  children,
}: EditorShellProps) {
  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-3 px-3 py-4 md:px-4 md:py-6">
        {beforeToolbar}
        {slots.toolbar ?? (
          <EditorToolbar config={config} actions={toolbarActions}>
            {children ?? (
              <div className="hidden rounded-full border border-[color:var(--surface-border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] md:block">
                Shared editor prototype
              </div>
            )}
          </EditorToolbar>
        )}
        <div className="grid min-h-[min(760px,calc(100vh-9rem))] grid-cols-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
          {slots.leftRail ?? (
            <EditorRail>
              <EditorIssueList
                issues={issues}
                selectedIssueId={selectedIssueId}
                onSelectIssue={onSelectIssue}
              />
            </EditorRail>
          )}
          <section className="surface-strong min-h-[420px] overflow-hidden p-3">
            {slots.workspace ?? (
              <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-[color:var(--surface-border)] p-6 text-center">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">
                    {config.emptyTitle}
                  </h2>
                  {config.emptyDescription ? (
                    <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
                      {config.emptyDescription}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </section>
          {slots.inspector ?? (
            <EditorInspector title="Issues">
              <EditorIssueList
                issues={issues}
                selectedIssueId={selectedIssueId}
                onSelectIssue={onSelectIssue}
              />
            </EditorInspector>
          )}
        </div>
        {slots.statusStrip ?? (
          <EditorStatusStrip
            readiness={readiness}
            pageLabel={pageLabel}
            saveStateLabel={saveStateLabel}
          />
        )}
      </div>
    </main>
  );
}
