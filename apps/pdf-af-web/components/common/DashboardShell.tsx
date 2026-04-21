'use client';

import { useEffect } from 'react';
import { BrandBar } from '../branding/BrandBar';
import { ProductNav } from './ProductNav';
import { QueueWorkspace } from '../queue/QueueWorkspace';
import { UploadDropzone } from '../upload/UploadDropzone';
import { useQueueStore } from '../../stores/queue';

interface DashboardShellProps {
  defaultApiBaseUrl: string;
}

export function DashboardShell({ defaultApiBaseUrl }: DashboardShellProps) {
  const hydrateFromStorage = useQueueStore((state) => state.hydrateFromStorage);

  useEffect(() => {
    void hydrateFromStorage();
  }, [defaultApiBaseUrl, hydrateFromStorage]);

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-3 px-3 py-4 md:px-4 md:py-6">
        <BrandBar />
        <ProductNav />
        <UploadDropzone />
        <QueueWorkspace />
      </div>
    </main>
  );
}
