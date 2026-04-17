'use client';

import { useEffect } from 'react';
import { BrandBar } from '../branding/BrandBar';
import { QueueWorkspace } from '../queue/QueueWorkspace';
import { ConnectionStatusCard } from '../settings/ConnectionStatusCard';
import { SettingsDialog } from '../settings/SettingsDialog';
import { UploadDropzone } from '../upload/UploadDropzone';
import { useQueueStore } from '../../stores/queue';
import { useAppSettingsStore } from '../../stores/settings';

interface DashboardShellProps {
  defaultApiBaseUrl: string;
}

export function DashboardShell({ defaultApiBaseUrl }: DashboardShellProps) {
  const hydrateFromStorage = useQueueStore((state) => state.hydrateFromStorage);
  const initializeSettings = useAppSettingsStore((state) => state.initialize);

  useEffect(() => {
    void hydrateFromStorage();
    void initializeSettings(defaultApiBaseUrl);
  }, [defaultApiBaseUrl, hydrateFromStorage, initializeSettings]);

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-3 px-3 py-4 md:px-4 md:py-6">
        <BrandBar />
        <ConnectionStatusCard />
        <UploadDropzone />
        <QueueWorkspace />
        <SettingsDialog defaultApiBaseUrl={defaultApiBaseUrl} />
      </div>
    </main>
  );
}
