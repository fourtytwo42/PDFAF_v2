interface StatusPillProps {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}

const toneClasses: Record<StatusPillProps['tone'], string> = {
  neutral: 'bg-transparent text-[var(--muted)] border border-[color:var(--surface-border)]',
  success: 'bg-[color:rgba(109,255,114,0.08)] text-[var(--success)] border border-[color:rgba(109,255,114,0.28)]',
  warning: 'bg-[color:rgba(255,224,102,0.08)] text-[var(--warning)] border border-[color:rgba(255,224,102,0.28)]',
  danger: 'bg-[color:rgba(255,114,114,0.08)] text-[var(--danger)] border border-[color:rgba(255,114,114,0.28)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent-strong)] border border-[color:rgba(109,255,114,0.28)]',
};

export function StatusPill({ label, tone }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
