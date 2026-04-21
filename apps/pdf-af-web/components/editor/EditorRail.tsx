import type { ReactNode } from 'react';

interface EditorRailProps {
  title?: string;
  children?: ReactNode;
}

export function EditorRail({ title = 'Pages', children }: EditorRailProps) {
  return (
    <aside className="surface-strong flex min-h-0 flex-col overflow-hidden p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {title}
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </aside>
  );
}
