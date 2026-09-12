'use client';

import { useEffect } from 'react';

/**
 * Global search affordance.
 *
 * Opens the in-app search modal rather than navigating. It used to push to
 * `/search`, a route that does not exist — so the visible search button 404'd.
 * The modal already lives in AppShell and is bound to ⌘K, so this dispatches
 * the same event instead of duplicating it.
 */
export const OPEN_SEARCH_EVENT = 'cadence:open-search';

export function CommandHint() {
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
      window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))}
      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path
          d="m20 20-3.5-3.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className="hidden sm:inline">Search meetings</span>
      <kbd className="hidden rounded border border-[var(--border)] px-1.5 font-sans text-[11px] text-[var(--text-faint)] sm:inline">
        /
      </kbd>
    </button>
  );
}
