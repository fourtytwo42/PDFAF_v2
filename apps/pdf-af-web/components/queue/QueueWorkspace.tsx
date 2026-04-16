'use client';

import { SectionCard } from '../common/SectionCard';
import { useQueueStore } from '../../stores/queue';
import { QueueTable } from './QueueTable';

function StorageStateMessage() {
  const storageState = useQueueStore((state) => state.storageState);
  const validationMessages = useQueueStore((state) => state.validationMessages);

  if (storageState !== 'error' && storageState !== 'unavailable') {
    return null;
  }

  const latestMessage = validationMessages[0]?.message;

  return (
    <p className="rounded-2xl bg-[color:rgba(161,50,50,0.08)] px-4 py-3 text-sm leading-6 text-[var(--danger)]">
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
      <SectionCard
        title="Workspace"
        description="Preparing the browser-local queue and restoring any previously added files."
      >
        <div className="rounded-[24px] border border-[color:var(--surface-border)] bg-white/45 px-6 py-10">
          <p className="text-sm leading-6 text-[var(--muted)]">Loading local queue...</p>
        </div>
      </SectionCard>
    );
  }

  if (jobs.length === 0) {
    return (
      <SectionCard
        title="Workspace"
        description="Your queue starts empty. Add PDFs above to create local rows that survive refresh in this browser."
      >
        <div className="grid gap-4">
          <StorageStateMessage />
          <div className="grid gap-4 md:grid-cols-3">
            <article className="surface-strong rounded-3xl p-5">
              <p className="text-sm leading-6 text-[var(--foreground)]">
                Add one file or a batch and see each PDF appear immediately as its own local
                queue row.
              </p>
            </article>
            <article className="surface-strong rounded-3xl p-5">
              <p className="text-sm leading-6 text-[var(--foreground)]">
                Original PDFs remain downloadable after refresh because they live in
                IndexedDB, not on the server.
              </p>
            </article>
            <article className="surface-strong rounded-3xl p-5">
              <p className="text-sm leading-6 text-[var(--foreground)]">
                Analyze, remediate, and batch downloads layer onto this queue in later
                milestones.
              </p>
            </article>
          </div>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <StorageStateMessage />
      <QueueTable />
    </div>
  );
}
