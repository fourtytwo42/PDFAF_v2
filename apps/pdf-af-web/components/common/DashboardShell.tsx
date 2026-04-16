'use client';

import { useEffect } from 'react';
import { BrandBar } from '../branding/BrandBar';
import { EmptyWorkspace } from './EmptyWorkspace';
import { ConnectionStatusCard } from '../settings/ConnectionStatusCard';
import { SettingsDialog } from '../settings/SettingsDialog';
import { UploadPlaceholder } from '../upload/UploadPlaceholder';
import { useAppSettingsStore } from '../../stores/settings';

interface DashboardShellProps {
  defaultApiBaseUrl: string;
}

export function DashboardShell({ defaultApiBaseUrl }: DashboardShellProps) {
  const initialize = useAppSettingsStore((state) => state.initialize);

  useEffect(() => {
    void initialize(defaultApiBaseUrl);
  }, [defaultApiBaseUrl, initialize]);

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
        <BrandBar />
        <UploadPlaceholder />
        <ConnectionStatusCard />
        <EmptyWorkspace />
      </div>
      <SettingsDialog defaultApiBaseUrl={defaultApiBaseUrl} />
    </main>
  );
}

