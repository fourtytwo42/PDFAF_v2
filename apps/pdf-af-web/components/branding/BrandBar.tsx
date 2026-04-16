'use client';

import { Button } from '../common/Button';
import { StatusPill } from '../common/StatusPill';
import { useAppSettingsStore } from '../../stores/settings';

export function BrandBar() {
  const openSettings = useAppSettingsStore((state) => state.openSettings);

  return (
    <header className="surface px-3 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
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
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--muted)]">
            Dense local queue. Browser storage only. Click details for the full report.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => void openSettings()}>
            Api Settings
          </Button>
        </div>
      </div>
    </header>
  );
}
