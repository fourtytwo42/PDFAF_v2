import { StatusPill } from '../common/StatusPill';

export function BrandBar() {
  return (
    <header className="surface px-3 py-3">
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusPill label="PDF AF" tone="accent" />
            <StatusPill label="batch terminal" tone="neutral" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
              grade / remediate / export
            </span>
          </div>
          <h1 className="text-xl font-bold uppercase tracking-[0.28em] text-[var(--accent-strong)] md:text-2xl">
            PDF AUTO FIXER
          </h1>
        </div>
      </div>
    </header>
  );
}
