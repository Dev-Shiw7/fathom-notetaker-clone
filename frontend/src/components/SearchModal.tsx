'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { SearchHit } from '@/lib/types';
import { formatTimestamp, formatMeetingDate } from '@/lib/analytics';
import { SearchIcon, SpinnerIcon } from '@/components/ui/Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (meetingId: string, startMs: number) => void;
}

export default function SearchModal({ open, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  /** Keyboard cursor into the result list. */
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      // Remember what had focus so Escape can hand it back, rather than
      // dropping the user at the top of the document.
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(timer);
    }
    setQuery('');
    setHits([]);
    setCursor(0);
    restoreFocusRef.current?.focus?.();
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setHits(data.hits ?? []);
      setCursor(0);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 250);
  };

  // Clear any in-flight debounce when the modal goes away.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const choose = useCallback(
    (hit: SearchHit) => {
      onNavigate(hit.meetingId, hit.startMs);
      onClose();
    },
    [onNavigate, onClose],
  );

  /** Arrow keys move the cursor; Enter opens. Typing stays in the input. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (!hits.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (c + 1) % hits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (c - 1 + hits.length) % hits.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = hits[cursor];
      if (hit) choose(hit);
    }
  };

  // Keep the highlighted row on screen as the cursor moves.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${cursor}"]`,
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  return (
    <div
      className="overlay-enter fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-[2px]"
      // mousedown, not click: a click fires on the element the pointer is
      // released over, so selecting text inside the panel and releasing on the
      // backdrop used to close the dialog mid-selection.
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search across all meetings"
        onKeyDown={onKeyDown}
        className="dialog-enter w-full max-w-2xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-raised)] shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <span className="shrink-0 text-[var(--text-faint)]">
            {loading ? <SpinnerIcon size={18} /> : <SearchIcon size={18} />}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Search across all meetings…"
            aria-label="Search query"
            className="flex-1 bg-transparent text-base text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
          <kbd className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 font-sans text-[11px] text-[var(--text-faint)]">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto">
          {hits.map((hit, i) => (
            <button
              key={`${hit.meetingId}-${hit.turnId}-${i}`}
              data-index={i}
              type="button"
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(hit)}
              className={`block w-full border-b border-[var(--border)] px-5 py-3 text-left transition-colors last:border-b-0 ${
                i === cursor ? 'bg-[var(--accent-soft)]' : ''
              }`}
            >
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-bold text-[var(--text)]">
                  {hit.meetingTitle}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-faint)]">
                  {formatMeetingDate(hit.startedAt)} · {formatTimestamp(hit.startMs)}
                </span>
              </div>
              <div className="text-xs leading-relaxed text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text)]">
                  {hit.speakerName}:
                </span>{' '}
                <HighlightedSnippet snippet={hit.snippet} />
              </div>
            </button>
          ))}

          {!loading && query.trim().length >= 2 && hits.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">
              No results for <span className="font-semibold">“{query}”</span>
            </p>
          )}

          {query.trim().length < 2 && (
            <p className="px-5 py-8 text-center text-sm text-[var(--text-faint)]">
              Type at least 2 characters to search every transcript.
            </p>
          )}
        </div>

        {hits.length > 0 && (
          <div className="flex items-center gap-3 border-t border-[var(--border)] bg-[var(--bg)] px-5 py-2 text-[11px] text-[var(--text-faint)]">
            <span>
              <Key>↑</Key> <Key>↓</Key> to navigate
            </span>
            <span>
              <Key>↵</Key> to jump
            </span>
            <span className="ml-auto tabular-nums">
              {hits.length} {hits.length === 1 ? 'result' : 'results'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--border)] bg-[var(--bg-raised)] px-1 font-sans text-[10px] text-[var(--text-muted)]">
      {children}
    </kbd>
  );
}

/** Renders «matched» text as bold. */
function HighlightedSnippet({ snippet }: { snippet: string }) {
  const parts = snippet.split(/«|»/);
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="rounded bg-[var(--warning-soft)] px-0.5 font-bold text-[var(--text)]"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
