import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-black hover:bg-[var(--accent-strong)] border border-[var(--accent)]',
  secondary:
    'bg-[var(--surface-strong)] text-[var(--foreground)] hover:bg-[var(--accent-soft)] border border-[color:var(--surface-border)]',
  ghost:
    'bg-transparent text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)] border border-[color:var(--surface-border)]',
};

export function Button({
  children,
  className = '',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`focus-ring inline-flex items-center justify-center px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] transition ${variantClasses[variant]} disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
