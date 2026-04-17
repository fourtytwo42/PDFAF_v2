'use client';

import { SectionCard } from '../common/SectionCard';
import { useQueueStore } from '../../stores/queue';
import { QueueTable } from './QueueTable';

function StorageStateMessage() {
  const storageState = useQueueStore((state) => state.storageState);
  const validationMessages = useQueueStore((state) => state.validationMessages);

  if (storageState !== 'error') {
    return null;
  }

  const latestMessage = validationMessages[0]?.message;

  return (
    <p className="border border-[color:rgba(255,114,114,0.28)] bg-[color:rgba(255,114,114,0.08)] px-2 py-2 text-xs leading-5 text-[var(--danger)]">
      {latestMessage ??
        'The web app could not load your saved files right now.'}
    </p>
  );
}

function RetentionBanner() {
  return (
    <p className="border border-[color:rgba(183,121,31,0.2)] bg-[color:rgba(183,121,31,0.08)] px-3 py-2 text-xs leading-5 text-[var(--warning)]">
      Fixed PDFs stay on this server for 24 hours. Saved fixed files may be deleted sooner if your total goes over 1 GB, so download anything you want to keep.
    </p>
  );
}

export function QueueWorkspace() {
  const jobs = useQueueStore((state) => state.jobs);
  const hydrated = useQueueStore((state) => state.hydrated);
  const storageState = useQueueStore((state) => state.storageState);

  if (!hydrated || storageState === 'loading') {
    return (
      <SectionCard title="Your files" description="Loading your file list.">
        <div className="surface-strong px-4 py-8">
          <p className="text-sm leading-6 text-[var(--muted)]">Loading...</p>
        </div>
      </SectionCard>
    );
  }

  if (jobs.length === 0) {
    return (
      <>
        <SectionCard
          title="Your files"
          description="Nothing here yet."
        >
          <div className="grid gap-4">
            <RetentionBanner />
            <StorageStateMessage />
            <div className="surface-strong p-4">
              <p className="text-sm leading-6 text-[var(--muted)]">Add a PDF to get started.</p>
            </div>
          </div>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <RetentionBanner />
        <StorageStateMessage />
        <QueueTable />
      </div>
    </>
  );
}
