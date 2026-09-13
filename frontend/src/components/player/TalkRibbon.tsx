'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Highlight, Participant, TranscriptTurn } from '@/lib/types';
import { formatTimestamp } from '@/lib/analytics';

/**
 * The talk-time ribbon.
 *
 * This is the scrubber and the analytics view at the same time. Every turn is
 * drawn as a block in its speaker's colour across the full timeline, so you can
 * see the shape of an hour-long meeting before reading a single number — who
 * dominated, where it turned into a monologue, where nobody said anything.
 *
 * Fathom shows talk-time as a bar chart in a panel. Putting it *on* the
 * timeline is the thing worth stealing time for: a percentage tells you Dana
 * spoke 41%, the ribbon tells you Dana spoke 41% and all of it was in the last
 * ten minutes.
 *
 * It also carries the interactions you'd otherwise need separate controls for:
 * click to seek, drag to cut a clip.
 */
interface Props {
  durationMs: number;
  turns: TranscriptTurn[];
  participants: Participant[];
  highlights: Highlight[];
  positionMs: number;
  onSeek: (ms: number) => void;
  onCreateClip: (startMs: number, endMs: number) => void;
}

/** Ignore micro-drags so a slightly sloppy click still reads as a click. */
const DRAG_THRESHOLD_PX = 6;

export function TalkRibbon({
  durationMs,
  turns,
  participants,
  highlights,
  positionMs,
  onSeek,
  onCreateClip,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ fromPct: number; toPct: number } | null>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);

  const colorById = useMemo(
    () => new Map(participants.map((p) => [p.id, p.color] as const)),
    [participants],
  );
  const nameById = useMemo(
    () => new Map(participants.map((p) => [p.id, p.name] as const)),
    [participants],
  );

  const pctFromEvent = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const startX = event.clientX;
    const fromPct = pctFromEvent(startX);
    setDrag({ fromPct, toPct: fromPct });
    event.currentTarget.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      setDrag({ fromPct, toPct: pctFromEvent(moveEvent.clientX) });
    };

    const up = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);

      const travelled = Math.abs(upEvent.clientX - startX);
      if (travelled < DRAG_THRESHOLD_PX) {
        onSeek(fromPct * durationMs);
        return;
      }
      const toPct = pctFromEvent(upEvent.clientX);
      const [a, b] = fromPct < toPct ? [fromPct, toPct] : [toPct, fromPct];
      onCreateClip(a * durationMs, b * durationMs);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const playheadPct = durationMs > 0 ? (positionMs / durationMs) * 100 : 0;
  const dragLeft = drag ? Math.min(drag.fromPct, drag.toPct) * 100 : 0;
  const dragWidth = drag ? Math.abs(drag.toPct - drag.fromPct) * 100 : 0;

  /** Whoever is speaking at the hovered point, for the floating readout. */
  const hoverMs = hoverPct === null ? null : hoverPct * durationMs;
  const hoverTurn =
    hoverMs === null
      ? null
      : turns.find((t) => t.startMs <= hoverMs && hoverMs <= t.endMs) ?? null;

  return (
    <div className="relative select-none">
      {/*
        Floating readout. Replaces the per-block `title` attributes, which took
        a second to appear, could not be styled, and vanished the moment the
        pointer crossed into the next turn.
      */}
      {hoverMs !== null && (
        <div
          className="pointer-events-none absolute -top-9 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--border-strong)] bg-[var(--bg-raised)] px-2 py-1 text-[11px] font-semibold shadow-[var(--shadow-md)]"
          style={{ left: `${Math.min(94, Math.max(6, (hoverPct ?? 0) * 100))}%` }}
        >
          <span className="font-mono tabular-nums text-[var(--text-muted)]">
            {formatTimestamp(hoverMs)}
          </span>
          {hoverTurn && (
            <>
              <span className="mx-1.5 text-[var(--border-strong)]">|</span>
              <span
                style={{ color: colorById.get(hoverTurn.speakerId) ?? undefined }}
              >
                {nameById.get(hoverTurn.speakerId)}
              </span>
            </>
          )}
        </div>
      )}

      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => setHoverPct(pctFromEvent(e.clientX))}
        onPointerLeave={() => setHoverPct(null)}
        role="slider"
        tabIndex={0}
        aria-label="Meeting timeline — click to seek, drag to create a clip"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(positionMs / 1000)}
        aria-valuetext={formatTimestamp(positionMs)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onSeek(positionMs + 5_000);
          if (e.key === 'ArrowLeft') onSeek(positionMs - 5_000);
          if (e.key === 'Home') onSeek(0);
          if (e.key === 'End') onSeek(durationMs);
        }}
        className="relative h-6 w-full cursor-crosshair overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-sunken)] transition-colors hover:border-[var(--border-strong)]"
      >
        {/* Speech blocks, one per turn, coloured by speaker. */}
        {turns.map((turn) => {
          const left = (turn.startMs / durationMs) * 100;
          const width = Math.max(
            0.12,
            ((turn.endMs - turn.startMs) / durationMs) * 100,
          );
          return (
            <div
              key={turn.id}
              className="absolute top-0 h-full opacity-80 transition-opacity"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                background: colorById.get(turn.speakerId) ?? 'var(--border-strong)',
              }}
            />
          );
        })}

        {/* Existing highlights, as a band along the bottom. */}
        {highlights.map((highlight) => {
          const left = (highlight.startMs / durationMs) * 100;
          const width = Math.max(
            0.3,
            ((highlight.endMs - highlight.startMs) / durationMs) * 100,
          );
          return (
            <div
              key={highlight.id}
              title={highlight.label}
              className="absolute bottom-0 h-1.5 rounded-full bg-[var(--warning)]"
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}

        {/* Live drag selection. */}
        {drag && dragWidth > 0 && (
          <div
            className="absolute top-0 h-full border-x-2 border-[var(--warning)] bg-[var(--warning)]/25"
            style={{ left: `${dragLeft}%`, width: `${dragWidth}%` }}
          />
        )}

        {/* Hover guide. */}
        {hoverPct !== null && !drag && (
          <div
            className="pointer-events-none absolute top-0 h-full w-px bg-white/35"
            style={{ left: `${hoverPct * 100}%` }}
          />
        )}

        {/* Playhead. */}
        <div
          className="pointer-events-none absolute top-0 h-full w-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.85)]"
          style={{ left: `${playheadPct}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--text-faint)]">
        <span>0:00</span>
        <span className="text-[var(--text-muted)]">
          drag across the ribbon to cut a clip
        </span>
        <span>{formatTimestamp(durationMs)}</span>
      </div>
    </div>
  );
}
