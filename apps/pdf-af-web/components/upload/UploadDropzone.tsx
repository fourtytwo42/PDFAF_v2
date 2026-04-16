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
      title="Input"
      description="Add PDFs to the queue."
      action={<StatusPill label={`${jobs.length} Local Files`} tone="accent" />}
    >
      <div
        className={`border border-dashed px-3 py-3 transition ${
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

        <div className="grid gap-3 lg:grid-cols-[1fr_320px] lg:items-start">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
              Queue Intake
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={() => inputRef.current?.click()}
                disabled={isAddingFiles}
              >
                {isAddingFiles ? 'Adding...' : 'Choose Pdfs'}
              </Button>
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                pdf only · max {MAX_UPLOAD_SIZE_MB}mb · multi-select enabled
              </span>
            </div>
          </div>

          <div className="surface-strong p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
                  Auto-remediate on add
                </p>
              </div>
              <label className="relative inline-flex items-center">
                <input
                  type="checkbox"
                  checked={autoRemediateOnAdd}
                  onChange={(event) => setAutoRemediateOnAdd(event.target.checked)}
                  className="peer sr-only"
                />
                <span className="h-5 w-10 border border-[color:var(--surface-border)] bg-black transition peer-checked:bg-[var(--accent-soft)]" />
                <span className="absolute left-[2px] top-[2px] h-4 w-4 bg-[var(--muted)] transition peer-checked:translate-x-5 peer-checked:bg-[var(--accent)]" />
              </label>
            </div>
          </div>
        </div>

        {validationMessages.length ? (
          <div className="mt-3 grid gap-2">
            {validationMessages.slice(0, 6).map((item) => (
              <p
                key={item.id}
                className="border border-[color:rgba(255,224,102,0.28)] bg-[color:rgba(255,224,102,0.08)] px-2 py-2 text-xs leading-5 text-[var(--warning)]"
              >
                <span className="font-bold text-[var(--foreground)]">{item.fileName}</span>{' '}
                {item.message}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
