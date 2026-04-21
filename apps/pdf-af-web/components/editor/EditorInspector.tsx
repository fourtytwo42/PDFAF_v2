import type { ReactNode } from 'react';

interface EditorInspectorProps {
  title?: string;
  children?: ReactNode;
}

export function EditorInspector({ title = 'Inspector', children }: EditorInspectorProps) {
  return (
    <aside className="surface-strong flex min-h-0 flex-col overflow-hidden p-3">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {title}
      </h2>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </aside>
  );
}
