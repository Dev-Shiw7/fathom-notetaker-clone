'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SearchModal from '@/components/SearchModal';
import { OPEN_SEARCH_EVENT } from './SearchField';
import { requestSeek } from '@/lib/events';

/**
 * The search dialog, mounted once for the whole app.
 *
 * It lives in the root layout rather than on the library page because ⌘K has
 * to work from a call, from Settings, and from a shared clip — anywhere the
 * app bar is visible, which is everywhere.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const navigate = useCallback(
    (meetingId: string, startMs: number) => {
      // Two messages, because two cases have to work. Navigating covers "that
      // hit is in another call"; the seek event covers "that hit is in the call
      // already open", where pushing the same route would be a no-op and the
      // playhead would never move.
      router.push(`/calls/${meetingId}?t=${Math.round(startMs)}`);
      requestSeek({ meetingId, ms: startMs });
    },
    [router],
  );

  return (
    <SearchModal
      open={open}
      onClose={() => setOpen(false)}
      onNavigate={navigate}
    />
  );
}
