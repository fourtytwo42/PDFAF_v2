import { SectionCard } from './SectionCard';

const milestones = [
  'Batch queueing and local file persistence land in the next milestone.',
  'Before/after scoring and remediation results will appear here.',
  'Client-side ZIP downloads and batch actions are planned after queueing.',
];

export function EmptyWorkspace() {
  return (
    <SectionCard
      title="Workspace"
      description="This is the Milestone 1 shell. The queue and file processing workflows are intentionally not active yet."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {milestones.map((item) => (
          <article key={item} className="surface-strong rounded-3xl p-5">
            <p className="text-sm leading-6 text-[var(--foreground)]">{item}</p>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}

