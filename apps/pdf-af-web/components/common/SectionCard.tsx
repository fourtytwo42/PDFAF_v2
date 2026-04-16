import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}

export function SectionCard({
  title,
  description,
  children,
  action,
}: SectionCardProps) {
  return (
    <section className="surface p-3 md:p-4">
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-[color:var(--surface-border)] pb-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--muted)]">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
