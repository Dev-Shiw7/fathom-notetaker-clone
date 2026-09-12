'use client';

import { useEffect, useState } from 'react';
import { SearchIcon } from '@/components/ui/Icon';

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
  // The shortcut is ⌘K on a Mac and Ctrl+K everywhere else, and showing the
  // wrong one is worse than showing none. The server cannot know, so the hint
  // resolves after mount.
  const [isMac, setIsMac] = useState<boolean | null>(null);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
  }, []);

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
      title="Search across every meeting"
      className="group flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition duration-150 hover:-translate-y-px hover:border-[var(--border-strong)] hover:text-[var(--text)] hover:shadow-[var(--shadow-md)] active:translate-y-0 active:scale-[0.98]"
    >
      <SearchIcon
        size={14}
        className="transition-transform duration-200 group-hover:scale-110"
      />
      <span className="hidden font-medium sm:inline">Search meetings</span>
      <kbd
        suppressHydrationWarning
        className="hidden rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-px font-sans text-[11px] text-[var(--text-faint)] transition-colors group-hover:border-[var(--border-strong)] group-hover:text-[var(--text-muted)] sm:inline"
      >
        {isMac === null ? '  ' : isMac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}
