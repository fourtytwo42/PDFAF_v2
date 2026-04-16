import { SectionCard } from '../common/SectionCard';

export function UploadPlaceholder() {
  return (
    <SectionCard
      title="Drop PDFs Here"
      description="The upload surface is intentionally visual-only in Milestone 1. Local queueing, file persistence, and batch actions land in the next milestones."
    >
      <div className="rounded-[28px] border border-dashed border-[color:var(--surface-border)] bg-white/40 px-6 py-12 text-center">
        <div className="mx-auto max-w-2xl">
          <p className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            Batch queueing arrives next
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)] md:text-base">
            This placeholder locks in the upload affordance, spacing, and tone. In
            Milestone 2, this becomes the browser-local dropzone backed by IndexedDB.
          </p>
          <div className="mt-6 inline-flex rounded-full bg-[var(--accent-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
            No files are stored anywhere yet
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

