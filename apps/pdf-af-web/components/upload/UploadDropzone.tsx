'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AddIcon, MagicIcon } from '../common/AppIcons';
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
  const autoRemediateOnAdd = useQueueStore((state) => state.autoRemediateOnAdd);
  const isAddingFiles = useQueueStore((state) => state.isAddingFiles);
  const setAutoRemediateOnAdd = useQueueStore((state) => state.setAutoRemediateOnAdd);
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
      title="Add files"
      description="Pick PDFs to check or fix."
      action={<StatusPill label={`${jobs.length} files`} tone="accent" />}
    >
      <div
        className={`rounded-[24px] border border-dashed px-4 py-4 transition ${
          isDragging
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
            : 'border-[color:var(--surface-border)] bg-[var(--surface-strong)]'
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

        <div className="grid gap-4 lg:grid-cols-[1fr_260px] lg:items-center">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[var(--accent-soft)] text-[var(--accent)]">
              <AddIcon className="h-7 w-7" />
            </div>
            <div>
              <p className="text-lg font-semibold text-[var(--foreground)]">Add PDFs</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Up to {MAX_UPLOAD_SIZE_MB} MB each.</p>
            </div>
            <div className="sm:ml-auto">
              <Button
                variant="primary"
                onClick={() => inputRef.current?.click()}
                disabled={isAddingFiles}
                title="Add PDF files"
              >
                <AddIcon className="h-4 w-4" />
                {isAddingFiles ? 'Adding...' : 'Add files'}
              </Button>
            </div>
          </div>

          <div className="surface-strong p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                  <MagicIcon className="h-4 w-4 text-[var(--accent)]" />
                  Auto-fix new files
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">Fix right after adding.</p>
              </div>
              <label className="relative inline-flex items-center">
                <input
                  type="checkbox"
                  checked={autoRemediateOnAdd}
                  onChange={(event) => setAutoRemediateOnAdd(event.target.checked)}
                  className="peer sr-only"
                />
                <span className="h-7 w-12 rounded-full border border-[color:var(--surface-border)] bg-[#e2e8f0] transition peer-checked:bg-[var(--accent-soft)]" />
                <span className="absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5 peer-checked:bg-[var(--accent)]" />
              </label>
            </div>
          </div>
        </div>

        {validationMessages.length ? (
          <div className="mt-3 grid gap-2">
            {validationMessages.slice(0, 6).map((item) => (
              <p
                key={item.id}
                className="rounded-2xl border border-[color:rgba(183,121,31,0.2)] bg-[color:rgba(183,121,31,0.08)] px-3 py-2 text-sm leading-6 text-[var(--warning)]"
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
