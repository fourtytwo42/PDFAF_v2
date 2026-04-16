'use client';

import { SectionCard } from '../common/SectionCard';
import { useQueueStore } from '../../stores/queue';
import { QueueDetailDrawer } from './QueueDetailDrawer';
import { QueueTable } from './QueueTable';

function StorageStateMessage() {
  const storageState = useQueueStore((state) => state.storageState);
  const validationMessages = useQueueStore((state) => state.validationMessages);

  if (storageState !== 'error' && storageState !== 'unavailable') {
    return null;
  }

  const latestMessage = validationMessages[0]?.message;

  return (
    <p className="border border-[color:rgba(255,114,114,0.28)] bg-[color:rgba(255,114,114,0.08)] px-2 py-2 text-xs leading-5 text-[var(--danger)]">
      {latestMessage ??
        'Browser storage is not available, so the local queue cannot be used right now.'}
    </p>
  );
}

export function QueueWorkspace() {
  const jobs = useQueueStore((state) => state.jobs);
  const hydrated = useQueueStore((state) => state.hydrated);
  const storageState = useQueueStore((state) => state.storageState);

  if (!hydrated || storageState === 'loading') {
    return (
      <SectionCard title="Workspace" description="Loading queue.">
        <div className="border border-[color:var(--surface-border)] bg-[var(--surface-strong)] px-3 py-6">
          <p className="text-xs leading-5 text-[var(--muted)]">Loading local queue...</p>
        </div>
      </SectionCard>
    );
  }

  if (jobs.length === 0) {
    return (
      <>
        <SectionCard
          title="Workspace"
          description="Queue is empty."
        >
          <div className="grid gap-4">
            <StorageStateMessage />
            <div className="surface-strong p-3">
              <p className="text-xs leading-5 text-[var(--muted)]">Add PDFs to begin.</p>
            </div>
          </div>
        </SectionCard>
        <QueueDetailDrawer />
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <StorageStateMessage />
        <QueueTable />
      </div>
      <QueueDetailDrawer />
    </>
  );
}
