import type { ReactNode } from 'react';
import type { EditorShellModeConfig } from '../../types/editor';

interface EditorToolbarProps {
  config: EditorShellModeConfig;
  children?: ReactNode;
  actions?: ReactNode;
}

export function EditorToolbar({ config, children, actions }: EditorToolbarProps) {
  return (
    <header className="surface-strong flex min-h-16 items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {config.mode === 'create' ? 'Create PDF' : 'Edit PDF'}
        </p>
        <h1 className="truncate text-base font-semibold text-[var(--foreground)]">
          {config.title}
        </h1>
        {config.subtitle ? (
          <p className="truncate text-xs text-[var(--muted)]">{config.subtitle}</p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">{children}</div>
      <div className="flex items-center gap-2">{actions}</div>
    </header>
  );
}
