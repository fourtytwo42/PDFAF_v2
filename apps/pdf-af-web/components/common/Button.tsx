import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm hover:bg-[var(--accent-strong)]',
  secondary:
    'border border-[color:var(--surface-border)] bg-[var(--surface-strong)] text-[var(--foreground)] shadow-sm hover:bg-[var(--accent-soft)]',
  ghost:
    'border border-[color:var(--surface-border)] bg-transparent text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)]',
};

export function Button({
  children,
  className = '',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`focus-ring inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${variantClasses[variant]} disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
