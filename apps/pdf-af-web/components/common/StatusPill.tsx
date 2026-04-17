interface StatusPillProps {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}

const toneClasses: Record<StatusPillProps['tone'], string> = {
  neutral: 'border border-[color:var(--surface-border)] bg-[#f8fafc] text-[var(--muted)]',
  success: 'border border-[color:rgba(22,163,74,0.2)] bg-[color:rgba(22,163,74,0.08)] text-[var(--success)]',
  warning: 'border border-[color:rgba(183,121,31,0.2)] bg-[color:rgba(183,121,31,0.08)] text-[var(--warning)]',
  danger: 'border border-[color:rgba(220,38,38,0.18)] bg-[color:rgba(220,38,38,0.08)] text-[var(--danger)]',
  accent: 'border border-[color:rgba(21,112,239,0.18)] bg-[var(--accent-soft)] text-[var(--accent-strong)]',
};

export function StatusPill({ label, tone }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
