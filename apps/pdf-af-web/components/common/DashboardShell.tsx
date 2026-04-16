'use client';

import { useEffect } from 'react';
import { BrandBar } from '../branding/BrandBar';
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
  const apiBaseUrl = useAppSettingsStore((state) => state.apiBaseUrl);
  const hydrateFromStorage = useQueueStore((state) => state.hydrateFromStorage);
  const runScheduler = useQueueStore((state) => state.runScheduler);

  useEffect(() => {
    void (async () => {
      await initialize(defaultApiBaseUrl);
      await hydrateFromStorage();
    })();
  }, [defaultApiBaseUrl, hydrateFromStorage, initialize]);

  useEffect(() => {
    void runScheduler();
  }, [apiBaseUrl, runScheduler]);

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-2 px-2 py-2 md:px-3 md:py-3">
        <BrandBar />
        <UploadDropzone />
        <QueueWorkspace />
      </div>
      <SettingsDialog defaultApiBaseUrl={defaultApiBaseUrl} />
    </main>
  );
}
