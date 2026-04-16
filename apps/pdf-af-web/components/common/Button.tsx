import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] border border-[var(--accent-strong)]',
  secondary:
    'bg-white/80 text-[var(--foreground)] hover:bg-white border border-[color:var(--surface-border)]',
  ghost:
    'bg-transparent text-[var(--foreground)] hover:bg-[var(--accent-soft)] border border-transparent',
};

export function Button({
  children,
  className = '',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`focus-ring inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${variantClasses[variant]} disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

