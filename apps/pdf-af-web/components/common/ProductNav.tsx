'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  {
    href: '/',
    label: 'Fix PDFs',
  },
  {
    href: '/create',
    label: 'Create PDF',
  },
  {
    href: '/edit',
    label: 'Edit PDF',
  },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ProductNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="PDF workflow"
      className="surface-strong flex flex-wrap items-center gap-1 p-1"
    >
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`focus-ring rounded-full px-3 py-2 text-sm font-semibold transition ${
              active
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)]'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
