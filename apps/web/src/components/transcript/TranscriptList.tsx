'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Participant, TranscriptTurn } from '@/lib/types';
import { formatTimestamp } from '@/lib/analytics';

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
        <ol className="space-y-1 py-2">
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
                  className={`group grid w-full grid-cols-[auto_1fr] gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    isActive
                      ? 'bg-[var(--accent-soft)]'
                      : 'hover:bg-[var(--bg-hover)]'
                  } ${startsNewBlock ? 'mt-3' : ''}`}
                >
                  <span className="w-7 shrink-0 pt-0.5">
                    {startsNewBlock && speaker && (
                      <span
                        aria-hidden
                        className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold text-white"
                        style={{ background: speaker.color }}
                      >
                        {speaker.initials}
                      </span>
                    )}
                  </span>

                  <span className="min-w-0">
                    {startsNewBlock && speaker && (
                      <span className="mb-0.5 flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold">
                          {speaker.name}
                        </span>
                        {speaker.isExternal && (
                          <span className="rounded border border-[var(--border)] px-1 text-[10px] text-[var(--text-faint)]">
                            external
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-[var(--text-faint)] opacity-0 transition-opacity group-hover:opacity-100">
                          {formatTimestamp(turn.startMs)}
                        </span>
                      </span>
                    )}
                    <span
                      className={`block text-[14px] leading-relaxed ${
                        isActive ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {turn.text}
                    </span>
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
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-raised)] px-3 py-1.5 text-xs font-medium shadow-lg transition-colors hover:bg-[var(--bg-hover)]"
        >
          ↓ Jump to live position
        </button>
      )}
    </div>
  );
}
