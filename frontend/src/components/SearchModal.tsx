'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { SearchHit } from '@/lib/types';
import { formatTimestamp } from '@/lib/analytics';

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (meetingId: string, startMs: number) => void;
}

export default function SearchModal({ open, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setHits([]);
    }
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-[var(--bg-raised,#fff)] shadow-2xl border border-[var(--border,#e0e0e0)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border,#e0e0e0)]">
          <span className="text-[var(--text-muted,#888)] text-lg">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Search across all meetings…"
            className="flex-1 bg-transparent text-[var(--text,#111)] text-base outline-none placeholder:text-[var(--text-faint,#aaa)]"
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          />
          <kbd className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-hover,#f0f0f0)] text-[var(--text-muted,#888)] border border-[var(--border,#e0e0e0)]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <div className="px-5 py-4 text-sm text-[var(--text-muted,#888)]">Searching…</div>
          )}

          {!loading && query.length >= 2 && hits.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-[var(--text-muted,#888)]">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {hits.map((hit, i) => (
            <button
              key={`${hit.meetingId}-${hit.turnId}-${i}`}
              className="w-full text-left px-5 py-3 hover:bg-[var(--bg-hover,#f8f8f8)] border-b border-[var(--border,#e8e8e8)] transition-colors"
              onClick={() => {
                onNavigate(hit.meetingId, hit.startMs);
                onClose();
              }}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-sm font-medium text-[var(--text,#111)] truncate">
                  {hit.meetingTitle}
                </span>
                <span className="text-xs text-[var(--text-faint,#aaa)] shrink-0">
                  {new Date(hit.startedAt).toLocaleDateString()} · {formatTimestamp(hit.startMs)}
                </span>
              </div>
              <div className="text-xs text-[var(--text-muted,#666)]">
                <span className="font-medium">{hit.speakerName}:</span>{' '}
                <HighlightedSnippet snippet={hit.snippet} />
              </div>
            </button>
          ))}
        </div>

        {!loading && query.length < 2 && (
          <div className="px-5 py-6 text-center text-sm text-[var(--text-faint,#aaa)]">
            Type at least 2 characters to search
          </div>
        )}
      </div>
    </div>
  );
}

/** Renders «matched» text as bold. */
function HighlightedSnippet({ snippet }: { snippet: string }) {
  const parts = snippet.split(/«|»/);
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-yellow-200/60 text-[var(--text,#111)] font-semibold rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
