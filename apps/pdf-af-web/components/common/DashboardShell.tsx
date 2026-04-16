'use client';

import { useEffect } from 'react';
import { BrandBar } from '../branding/BrandBar';
import { ConnectionStatusCard } from '../settings/ConnectionStatusCard';
import { SettingsDialog } from '../settings/SettingsDialog';
import { QueueWorkspace } from '../queue/QueueWorkspace';
import { UploadDropzone } from '../upload/UploadDropzone';
import { useAppSettingsStore } from '../../stores/settings';
import { useQueueStore } from '../../stores/queue';

interface DashboardShellProps {
  defaultApiBaseUrl: string;
}

export function DashboardShell({ defaultApiBaseUrl }: DashboardShellProps) {
  const initialize = useAppSettingsStore((state) => state.initialize);
  const hydrateFromStorage = useQueueStore((state) => state.hydrateFromStorage);

  useEffect(() => {
    void (async () => {
      await initialize(defaultApiBaseUrl);
      await hydrateFromStorage();
    })();
  }, [defaultApiBaseUrl, hydrateFromStorage, initialize]);

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
        <BrandBar />
        <UploadDropzone />
        <ConnectionStatusCard />
        <QueueWorkspace />
      </div>
      <SettingsDialog defaultApiBaseUrl={defaultApiBaseUrl} />
    </main>
  );
}
