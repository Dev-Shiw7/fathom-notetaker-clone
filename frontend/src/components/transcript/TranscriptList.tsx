'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Participant, TranscriptTurn } from '@/lib/types';
import { formatTimestamp } from '@/lib/analytics';
import { ArrowDownIcon } from '@/components/ui/Icon';

interface Props {
  turns: TranscriptTurn[];
  participants: Participant[];
  positionMs: number;
  onSeek: (ms: number) => void;
  /** Set when the user is reading rather than following playback. */
  following: boolean;
  onFollowingChange: (following: boolean) => void;
}

export function TranscriptList({
  turns,
  participants,
  positionMs,
  onSeek,
  following,
  onFollowingChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const byId = useMemo(
    () => new Map(participants.map((p) => [p.id, p] as const)),
    [participants],
  );

  /**
   * The turn covering the playhead, or the most recent one during a gap —
   * without the fallback the highlight flickers off in every pause between
   * speakers, which reads as a bug.
   */
  const activeIndex = useMemo(() => {
    let candidate = -1;
    for (let i = 0; i < turns.length; i += 1) {
      const turn = turns[i]!;
      if (turn.startMs <= positionMs) candidate = i;
      else break;
    }
    return candidate;
  }, [turns, positionMs]);

  // Keep the active turn in view, but only while following — yanking the
  // viewport while someone is reading further down is infuriating.
  useEffect(() => {
    if (!following) return;
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, following]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        onWheel={() => following && onFollowingChange(false)}
        className="min-h-0 flex-1 overflow-y-auto pr-1"
      >
        <ol className="space-y-0.5 py-2">
          {turns.map((turn, index) => {
            const speaker = byId.get(turn.speakerId);
            const isActive = index === activeIndex;
            const previous = turns[index - 1];
            const startsNewBlock = previous?.speakerId !== turn.speakerId;

            return (
              <li key={turn.id}>
                <button
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  onClick={() => onSeek(turn.startMs)}
                  title={`Jump to ${formatTimestamp(turn.startMs)}`}
                  aria-current={isActive ? 'true' : undefined}
                  className={`group relative grid w-full grid-cols-[auto_1fr] gap-3 rounded-lg px-2.5 py-1.5 text-left transition duration-150 ${
                    isActive
                      ? 'bg-[var(--accent-soft)]'
                      : 'hover:bg-[var(--bg-hover)]'
                  } ${startsNewBlock ? 'mt-3' : ''}`}
                >
                  {/* Spine on the turn currently being spoken. */}
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-[var(--accent)]"
                    />
                  )}

                  <span className="w-7 shrink-0 pt-0.5">
                    {startsNewBlock && speaker && (
                      <span
                        aria-hidden
                        className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white shadow-[var(--shadow-sm)] transition-transform duration-200 group-hover:scale-110"
                        style={{ background: speaker.color }}
                      >
                        {speaker.initials}
                      </span>
                    )}
                  </span>

                  <span className="min-w-0">
                    {startsNewBlock && speaker && (
                      <span className="mb-0.5 flex items-baseline gap-2">
                        <span className="text-[13px] font-bold">
                          {speaker.name}
                        </span>
                        {speaker.isExternal && (
                          <span className="rounded border border-[var(--border-strong)] px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                            external
                          </span>
                        )}
                      </span>
                    )}

                    <span
                      className={`block text-[14px] leading-relaxed transition-colors ${
                        isActive
                          ? 'font-medium text-[var(--text)]'
                          : 'text-[var(--text-muted)] group-hover:text-[var(--text)]'
                      }`}
                    >
                      {turn.text}
                    </span>
                  </span>

                  {/*
                    Every turn is clickable, so every turn shows its timestamp
                    on hover — it used to appear only on the first turn of a
                    speaker block, which made the rest look inert.
                  */}
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute right-2.5 top-1.5 font-mono text-[11px] font-semibold tabular-nums transition-opacity duration-150 ${
                      isActive
                        ? 'text-[var(--accent)] opacity-100'
                        : 'text-[var(--text-faint)] opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {formatTimestamp(turn.startMs)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {!following && (
        <button
          type="button"
          onClick={() => onFollowingChange(true)}
          className="toast-enter absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-raised)] px-3.5 py-2 text-xs font-bold shadow-[var(--shadow-lg)] transition duration-150 hover:scale-105 hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-95"
        >
          <ArrowDownIcon size={13} />
          Jump to live position
        </button>
      )}
    </div>
  );
}
