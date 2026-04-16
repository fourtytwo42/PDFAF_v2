'use client';

import { Button } from '../common/Button';
import { StatusPill } from '../common/StatusPill';
import { useAppSettingsStore } from '../../stores/settings';

export function BrandBar() {
  const openSettings = useAppSettingsStore((state) => state.openSettings);

  return (
    <header className="surface rounded-[32px] px-6 py-6 md:px-8 md:py-7">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <div className="mb-4 flex items-center gap-3">
            <StatusPill label="Milestone 3" tone="accent" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Batch grading and linked finding review
            </span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--foreground)] md:text-6xl">
            PDF AF
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">
            Grade PDFs. Fix PDFs. Download results. The app now supports a persistent
            browser-local queue plus analyze flow with readable results and linked findings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => void openSettings()}>
            API Settings
          </Button>
        </div>
      </div>
    </header>
  );
}
