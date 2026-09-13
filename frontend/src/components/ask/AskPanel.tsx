'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { AskThread } from '@/lib/types';
import { formatTimestamp } from '@/lib/analytics';
import { SendIcon, SparkleIcon } from '@/components/ui/Icon';

interface Props {
  threads: AskThread[];
  /** Titles by meeting id, so a citation can name the call it came from. */
  meetingTitles: Record<string, string>;
  /**
   * Set on a call page. Citations into *this* call move the playhead; the rest
   * stay links, because seeking a recording that is not open is meaningless.
   */
  currentMeetingId?: string;
  onSeek?: (ms: number) => void;
  /** "ASK RECAP" in the library rail; the call page renders its own tab. */
  heading?: string;
  /** Drops the dividing edge and gutters, for use inside a call's tab strip. */
  bare?: boolean;
}

interface Exchange {
  id: number;
  question: string;
  thread: AskThread | null;
}

/**
 * Cross-meeting Q&A.
 *
 * The answers are pre-seeded rather than generated: the runtime makes no LLM
 * calls, and every answer carries citations back into a recording, which is
 * the property that makes the feature worth having at all. A question with no
 * seeded answer says so instead of inventing one — a notetaker that
 * confabulates is worse than one that admits the gap.
 */
export function AskPanel({
  threads,
  meetingTitles,
  currentMeetingId,
  onSeek,
  heading = 'Ask Recap',
  bare = false,
}: Props) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState('');
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const nextId = useRef(1);

  /** Suggestions still worth offering — asked questions drop off the list. */
  const suggestions = useMemo(() => {
    const asked = new Set(exchanges.map((e) => e.thread?.id).filter(Boolean));
    return threads.filter((thread) => !asked.has(thread.id));
  }, [threads, exchanges]);

  useEffect(() => {
    // Keep the newest exchange in view as the thread grows.
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [exchanges.length]);

  const ask = useCallback((question: string, thread: AskThread | null) => {
    setExchanges((current) => [
      ...current,
      { id: nextId.current++, question, thread },
    ]);
  }, []);

  /**
   * Matches a typed question to a seeded thread on shared significant words.
   * Deliberately crude: it is a lookup over three canned answers, not a
   * retrieval system, and pretending otherwise would be the dishonest part.
   */
  const match = useCallback(
    (question: string): AskThread | null => {
      const words = question
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 3);
      if (words.length === 0) return null;

      let best: { thread: AskThread; score: number } | null = null;
      for (const thread of threads) {
        const haystack = `${thread.question} ${thread.answer}`.toLowerCase();
        const score = words.filter((word) => haystack.includes(word)).length;
        if (score > 0 && (!best || score > best.score)) best = { thread, score };
      }
      // One incidental word in common is a coincidence, not a match.
      return best && best.score >= 2 ? best.thread : null;
    },
    [threads],
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question) return;
    ask(question, match(question));
    setDraft('');
  };

  return (
    <aside className={`ask-panel ${bare ? 'ask-panel--bare' : ''}`}>
      <h2 className="ask-head">
        <SparkleIcon size={15} className="text-[var(--brand-to)]" />
        {heading}
      </h2>

      <div ref={bodyRef} className="ask-body">
        {exchanges.map((exchange) => (
          // A Fragment, not a wrapper: the question and the answer have to be
          // direct children of .ask-body for its bottom-alignment and gap to
          // apply to them. (`display: contents` would not do — the rule that
          // pushes the log to the bottom sets a margin, and a contents box has
          // no box to put one on.)
          <Fragment key={exchange.id}>
            <p className="ask-question">{exchange.question}</p>

            {exchange.thread ? (
              <div className="ask-answer">
                <p className="m-0">{exchange.thread.answer}</p>

                <ul className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                  {exchange.thread.sources.map((source, index) => (
                    <li key={index} className="text-[12px] leading-relaxed">
                      <span className="block italic text-[var(--text-faint)]">
                        “{source.quote}”
                      </span>
                      <Citation
                        meetingId={source.meetingId}
                        title={meetingTitles[source.meetingId] ?? 'this call'}
                        startMs={source.citation.startMs}
                        currentMeetingId={currentMeetingId}
                        onSeek={onSeek}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="ask-answer">
                Ask is pre-seeded in this build, and nothing here covers that
                question — so rather than invent an answer: try{' '}
                <span className="font-semibold text-[var(--text)]">⌘K</span> to
                search what was actually said across every transcript.
              </p>
            )}
          </Fragment>
        ))}

        {suggestions.map((thread) => (
          <button
            key={thread.id}
            type="button"
            className="ask-suggest"
            onClick={() => ask(thread.question, thread)}
          >
            {thread.question}
          </button>
        ))}

        {suggestions.length === 0 && exchanges.length === 0 && (
          <p className="text-center text-[12.5px] leading-relaxed text-[var(--text-faint)]">
            No seeded questions for this workspace yet.
          </p>
        )}
      </div>

      <form className="ask-foot" onSubmit={submit}>
        <div className="ask-input">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask anything…"
            aria-label="Ask a question about your calls"
          />
          <button
            type="submit"
            className="ask-send"
            disabled={draft.trim().length === 0}
            aria-label="Ask"
          >
            <SendIcon size={15} />
          </button>
        </div>
      </form>
    </aside>
  );
}

function Citation({
  meetingId,
  title,
  startMs,
  currentMeetingId,
  onSeek,
}: {
  meetingId: string;
  title: string;
  startMs: number;
  currentMeetingId?: string;
  onSeek?: (ms: number) => void;
}) {
  const stamp = formatTimestamp(startMs);

  if (meetingId === currentMeetingId && onSeek) {
    return (
      <button
        type="button"
        onClick={() => onSeek(startMs)}
        title="Jump to this moment"
        className="tap mt-1 font-mono text-[11px] font-bold text-[var(--accent)]"
      >
        {stamp}
      </button>
    );
  }

  return (
    <Link
      href={`/calls/${meetingId}?t=${Math.round(startMs)}`}
      title={`Open ${title} at ${stamp}`}
      className="tap mt-1 text-[11px] font-bold text-[var(--accent)]"
    >
      {title} · <span className="font-mono">{stamp}</span>
    </Link>
  );
}
