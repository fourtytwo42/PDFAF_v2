interface StatusPillProps {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}

const toneClasses: Record<StatusPillProps['tone'], string> = {
  neutral: 'bg-black/5 text-[var(--foreground)]',
  success: 'bg-[color:rgba(19,111,79,0.12)] text-[var(--success)]',
  warning: 'bg-[color:rgba(149,95,17,0.14)] text-[var(--warning)]',
  danger: 'bg-[color:rgba(161,50,50,0.14)] text-[var(--danger)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
};

export function StatusPill({ label, tone }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

