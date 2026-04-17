'use client';

import { SettingsIcon } from '../common/AppIcons';
import { Button } from '../common/Button';
import { useAppSettingsStore } from '../../stores/settings';

export function BrandBar() {
  const openSettings = useAppSettingsStore((state) => state.openSettings);

  return (
    <header className="surface px-4 py-4 md:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)] md:text-3xl">
            PDF Auto Fixer
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Add a file. Tap Check or Fix.</p>
        </div>
        <Button
          variant="ghost"
          className="h-11 w-11 p-0"
          title="Open settings"
          aria-label="Open settings"
          onClick={() => void openSettings()}
        >
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
