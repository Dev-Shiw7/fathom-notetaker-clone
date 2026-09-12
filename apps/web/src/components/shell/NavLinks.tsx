'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/meetings', label: 'Meetings' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/ask', label: 'Ask' },
  { href: '/settings', label: 'Settings' },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="-mx-1 flex min-w-0 items-center gap-0.5 overflow-x-auto">
      {LINKS.map((link) => {
        const active =
          link.href === '/'
            ? pathname === '/'
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              active
                ? 'bg-[var(--bg-hover)] font-medium text-[var(--text)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
