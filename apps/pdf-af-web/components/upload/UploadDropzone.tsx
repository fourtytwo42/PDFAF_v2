'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Button } from '../common/Button';
import { SectionCard } from '../common/SectionCard';
import { StatusPill } from '../common/StatusPill';
import { MAX_UPLOAD_SIZE_MB } from '../../lib/constants/uploads';
import { useQueueStore } from '../../stores/queue';

function stopEvent(event: DragEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
}

export function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = useQueueStore((state) => state.addFiles);
  const isAddingFiles = useQueueStore((state) => state.isAddingFiles);
  const validationMessages = useQueueStore((state) => state.validationMessages);
  const jobs = useQueueStore((state) => state.jobs);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    await addFiles(Array.from(files));
  };

  const handleInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    await handleFiles(event.target.files);
    event.target.value = '';
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    stopEvent(event);
    setIsDragging(false);
    await handleFiles(event.dataTransfer.files);
  };

  return (
    <SectionCard
      title="Drop PDFs Here"
      description="Add one file or a whole batch. Files stay in this browser only until you remove them."
      action={<StatusPill label={`${jobs.length} Local Files`} tone="accent" />}
    >
      <div
        className={`rounded-[28px] border border-dashed px-6 py-8 transition md:px-8 md:py-10 ${
          isDragging
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
            : 'border-[color:var(--surface-border)] bg-white/40'
        }`}
        onDragEnter={(event) => {
          stopEvent(event);
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          stopEvent(event);
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          stopEvent(event);
          setIsDragging(false);
        }}
        onDrop={(event) => void handleDrop(event)}
      >
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={(event) => void handleInputChange(event)}
        />

        <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div>
            <p className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
              Build a local batch queue in seconds
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] md:text-base">
              Drag PDFs into the workspace or pick files manually. Originals stay in
              IndexedDB so they survive refresh without touching the server, and selected
              files can now be graded from the queue.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={() => inputRef.current?.click()}
                disabled={isAddingFiles}
              >
                {isAddingFiles ? 'Adding Files...' : 'Choose PDFs'}
              </Button>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                PDF only · up to {MAX_UPLOAD_SIZE_MB} MB each
              </span>
            </div>
          </div>

          <div className="surface-strong rounded-[24px] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Auto-remediate on add
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Visible now so the flow stays familiar later, but queue automation starts
                  in Milestone 4.
                </p>
              </div>
              <label className="relative inline-flex cursor-not-allowed items-center opacity-60">
                <input type="checkbox" disabled className="peer sr-only" />
                <span className="h-7 w-12 rounded-full bg-black/10 transition peer-checked:bg-[var(--accent)]" />
                <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
              </label>
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
              Coming in Milestone 4
            </p>
          </div>
        </div>

        {validationMessages.length ? (
          <div className="mt-6 grid gap-3">
            {validationMessages.slice(0, 6).map((item) => (
              <p
                key={item.id}
                className="rounded-2xl bg-[color:rgba(149,95,17,0.10)] px-4 py-3 text-sm leading-6 text-[var(--warning)]"
              >
                <span className="font-semibold text-[var(--foreground)]">{item.fileName}</span>{' '}
                {item.message}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
