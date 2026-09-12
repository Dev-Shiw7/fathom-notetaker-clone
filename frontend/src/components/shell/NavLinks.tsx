'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Only routes that actually exist are listed here.
 *
 * This previously advertised /meetings, /analytics, /ask and /settings, none of
 * which were built — so a visitor's first click on the live link landed on a
 * 404. A short honest nav beats a long nav that lies.
 */
const LINKS = [
  { href: '/', label: 'Meetings' },
  { href: '/settings', label: 'Calendar & bot' },
  { href: '/design', label: 'Design system' },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="-mx-1 flex min-w-0 items-center gap-0.5 overflow-x-auto">
      {LINKS.map((link) => {
        const active =
          link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`relative shrink-0 rounded-lg px-3 py-1.5 text-sm transition duration-150 ${
              active
                ? 'bg-[var(--accent-soft)] font-bold text-[var(--accent)]'
                : 'font-medium text-[var(--text-muted)] hover:scale-105 hover:bg-[var(--bg-hover)] hover:text-[var(--text)] hover:[text-shadow:0_0_0.4px_currentColor]'
            } active:scale-95`}
          >
            {link.label}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[var(--accent)]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
