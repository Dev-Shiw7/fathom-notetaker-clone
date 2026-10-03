'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { AskAnswer } from '@/lib/ask';
import { formatTimestamp } from '@/lib/analytics';
import { SendIcon, SparkleIcon, SpinnerIcon } from '@/components/ui/Icon';

interface Props {
  /** Titles by meeting id, so a citation can name the call it came from. */
  meetingTitles: Record<string, string>;
  /**
   * Set on a call page. Questions are then answered from *this* call only, and
   * citations into it move the playhead; the rest stay links, because seeking
   * a recording that is not open is meaningless.
   */
  currentMeetingId?: string;
  onSeek?: (ms: number) => void;
  /** "ASK RECALL" in the library rail; the call page renders its own tab. */
  heading?: string;
  /** Drops the dividing edge and gutters, for use inside a call's tab strip. */
  bare?: boolean;
}

interface Exchange {
  id: number;
  question: string;
  answer: AskAnswer | null;
  error: string | null;
}

const SUGGESTIONS = [
  'What were the action items?',
  'What decisions were made?',
  'What was left unresolved?',
];

/**
 * Q&A over the stored transcripts.
 *
 * Each question is sent to /api/ask, which retrieves the transcript turns that
 * match and has the model answer from only those, citing them. Citations are
 * validated server-side against the turns it supplied, so a link here always
 * points at something that was actually said. With nothing relevant found the
 * answer says so instead of improvising.
 */
export function AskPanel({
  meetingTitles,
  currentMeetingId,
  onSeek,
  heading = 'Ask Recall',
  bare = false,
}: Props) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    // Keep the newest exchange in view as the thread grows.
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [exchanges, pending]);

  const ask = useCallback(
    async (question: string) => {
      const id = nextId.current++;
      setPending(true);
      setExchanges((current) => [...current, { id, question, answer: null, error: null }]);

      let patch: Pick<Exchange, 'answer' | 'error'>;
      try {
        const response = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question, meetingId: currentMeetingId }),
        });
        const body = await response.json();
        patch = response.ok
          ? { answer: body as AskAnswer, error: null }
          : { answer: null, error: body.error ?? 'Something went wrong.' };
      } catch {
        patch = { answer: null, error: 'Could not reach the server.' };
      }

      setExchanges((current) => current.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      setPending(false);
    },
    [currentMeetingId],
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question || pending) return;
    setDraft('');
    void ask(question);
  };

  const asked = new Set(exchanges.map((e) => e.question));
  const suggestions = SUGGESTIONS.filter((q) => !asked.has(q));

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
          // apply to them.
          <Fragment key={exchange.id}>
            <p className="ask-question">{exchange.question}</p>

            {exchange.answer ? (
              <div className="ask-answer">
                <p className="m-0">{exchange.answer.answer}</p>

                {exchange.answer.sources.length > 0 && (
                  <ul className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                    {exchange.answer.sources.map((source, index) => (
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
                )}
              </div>
            ) : exchange.error ? (
              <p className="ask-answer text-[var(--danger)]">{exchange.error}</p>
            ) : (
              <p className="ask-answer flex items-center gap-2 text-[var(--text-muted)]">
                <SpinnerIcon size={14} /> Reading the transcripts…
              </p>
            )}
          </Fragment>
        ))}

        {suggestions.map((question) => (
          <button
            key={question}
            type="button"
            className="ask-suggest"
            disabled={pending}
            onClick={() => void ask(question)}
          >
            {question}
          </button>
        ))}
      </div>

      <form className="ask-foot" onSubmit={submit}>
        <div className="ask-input">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={currentMeetingId ? 'Ask about this call…' : 'Ask anything…'}
            aria-label="Ask a question about your calls"
          />
          <button
            type="submit"
            className="ask-send"
            disabled={draft.trim().length === 0 || pending}
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
