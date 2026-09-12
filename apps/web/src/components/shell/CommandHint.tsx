'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Global search affordance.
 *
 * `/` jumps to search from anywhere, which is the shortcut people already have
 * muscle memory for. The visible button exists because a keyboard-only
 * affordance is invisible to anyone who doesn't already know it's there.
 */
export function CommandHint() {
  const router = useRouter();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '/') return;
      const target = event.target as HTMLElement | null;
      // Never hijack the key while someone is actually typing.
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      router.push('/search');
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <button
      type="button"
      onClick={() => router.push('/search')}
      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="hidden sm:inline">Search meetings</span>
      <kbd className="hidden rounded border border-[var(--border)] px-1.5 font-sans text-[11px] text-[var(--text-faint)] sm:inline">
        /
      </kbd>
    </button>
  );
}
