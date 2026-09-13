'use client';

import { useEffect, useState } from 'react';
import { SparkleIcon } from '@/components/ui/Icon';

/**
 * The app bar's global search affordance.
 *
 * Deliberately a button styled as a field rather than a real input: it opens
 * the search dialog, and a second place to type the same query is a second
 * place for the query to get out of sync. It used to push to `/search`, a
 * route that does not exist — so the visible search control 404'd. The dialog
 * is mounted once in the root layout and bound to ⌘K, so this asks for it by
 * event rather than duplicating it.
 */
export const OPEN_SEARCH_EVENT = 'recap:open-search';

export function openSearch() {
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
}

export function SearchField() {
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
      openSearch();
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <button
      type="button"
      onClick={openSearch}
      title="Search across every call"
      className="searchfield"
    >
      <SparkleIcon size={15} className="sf-spark" />
      <span className="flex-1 truncate">Search with AI…</span>
      <kbd
        suppressHydrationWarning
        className="hidden shrink-0 rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-px font-sans text-[11px] text-[var(--text-faint)] sm:inline"
      >
        {isMac === null ? '  ' : isMac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}
