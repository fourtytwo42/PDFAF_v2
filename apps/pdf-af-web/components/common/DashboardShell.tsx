'use client';

import { useEffect } from 'react';
import { BrandBar } from '../branding/BrandBar';
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
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-3 px-3 py-4 md:px-4 md:py-6">
        <BrandBar />
        <UploadDropzone />
        <QueueWorkspace />
      </div>
    </main>
  );
}
