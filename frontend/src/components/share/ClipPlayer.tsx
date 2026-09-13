'use client';

import { useEffect, useRef, useState } from 'react';
import { formatTimestamp } from '@/lib/analytics';
import { InfoIcon, PauseIcon, PlayIcon } from '@/components/ui/Icon';

interface ClipTurn {
  id: string;
  startMs: number;
  text: string;
  speakerName: string;
  speakerColor: string;
  speakerInitials: string;
}

interface Props {
  startMs: number;
  endMs: number;
  audioUrl: string | null;
  turns: ClipTurn[];
}

/**
 * Plays one range of a recording and nothing else.
 *
 * Bounded at both ends: with audio it seeks to `startMs` and pauses itself at
 * `endMs`; without audio it advances the same synthetic clock the main player
 * uses, so the transcript still highlights in time. The difference between
 * those two is stated on screen rather than left for the viewer to work out
 * from the silence.
 */
export function ClipPlayer({ startMs, endMs, audioUrl, turns }: Props) {
  const clipMs = Math.max(0, endMs - startMs);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTick = useRef(0);

  const hasAudio = Boolean(audioUrl);
  const absoluteMs = startMs + elapsed;

  // Synthetic clock, used only when there is no audio to drive position.
  useEffect(() => {
    if (hasAudio || !playing) return;
    lastTick.current = performance.now();

    const tick = (now: number) => {
      const delta = now - lastTick.current;
      lastTick.current = now;
      setElapsed((current) => {
        const next = current + delta;
        if (next >= clipMs) {
          setPlaying(false);
          return clipMs;
        }
        return next;
      });
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [playing, clipMs, hasAudio]);

  // Real audio drives position, and stops itself at the end of the clip.
  useEffect(() => {
    const element = audioRef.current;
    if (!element || !hasAudio) return;

    const onTime = () => {
      const position = element.currentTime * 1000 - startMs;
      if (position >= clipMs) {
        element.pause();
        setPlaying(false);
        setElapsed(clipMs);
        return;
      }
      setElapsed(Math.max(0, position));
    };
    const onEnded = () => setPlaying(false);

    element.addEventListener('timeupdate', onTime);
    element.addEventListener('ended', onEnded);
    return () => {
      element.removeEventListener('timeupdate', onTime);
      element.removeEventListener('ended', onEnded);
    };
  }, [hasAudio, startMs, clipMs]);

  function toggle() {
    const element = audioRef.current;
    if (playing) {
      element?.pause();
      setPlaying(false);
      return;
    }
    // Restart from the top once the clip has run out.
    const from = elapsed >= clipMs ? 0 : elapsed;
    setElapsed(from);
    if (element) {
      element.currentTime = (startMs + from) / 1000;
      void element.play().catch(() => {
        // Autoplay blocked or the file is missing — the clock still runs, so
        // the transcript keeps working rather than the page looking frozen.
      });
    }
    setPlaying(true);
  }

  function scrubTo(fraction: number) {
    const next = Math.max(0, Math.min(clipMs, fraction * clipMs));
    setElapsed(next);
    if (audioRef.current) {
      audioRef.current.currentTime = (startMs + next) / 1000;
    }
    lastTick.current = performance.now();
  }

  const progress = clipMs > 0 ? (elapsed / clipMs) * 100 : 0;
  const activeId = [...turns].reverse().find((t) => t.startMs <= absoluteMs)?.id;

  return (
    <div>
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} preload="metadata" className="hidden" />
      )}

      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-raised)] p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? 'Pause clip' : 'Play clip'}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] transition duration-150 hover:scale-105 hover:bg-[var(--accent-hover)] active:scale-95"
          >
            {playing ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
          </button>

          <div className="min-w-0 flex-1">
            <div
              role="slider"
              tabIndex={0}
              aria-label="Clip position"
              aria-valuemin={0}
              aria-valuemax={Math.round(clipMs / 1000)}
              aria-valuenow={Math.round(elapsed / 1000)}
              aria-valuetext={formatTimestamp(elapsed)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') scrubTo((elapsed + 2000) / clipMs);
                if (e.key === 'ArrowLeft') scrubTo((elapsed - 2000) / clipMs);
              }}
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                scrubTo((e.clientX - rect.left) / rect.width);
              }}
              className="group relative h-2.5 w-full cursor-pointer rounded-full bg-[var(--bg-sunken)]"
            >
              <div
                className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text)]">
                {formatTimestamp(elapsed)}
              </span>
              <span>{formatTimestamp(clipMs)}</span>
            </div>
          </div>
        </div>

        {/*
          Say it plainly. A player that looks like it is playing but makes no
          sound reads as a broken page; naming the reason is the difference
          between a limitation and a bug.
        */}
        {!hasAudio && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
            <span className="mt-px shrink-0">
              <InfoIcon size={13} />
            </span>
            <span>
              <strong className="font-semibold text-[var(--text)]">
                Simulated playback — no audio track.
              </strong>{' '}
              This recording has no stitched audio, so the playhead advances on
              a timer and the transcript follows it. Everything below is real
              transcript data.
            </span>
          </p>
        )}
      </div>

      {turns.length > 0 && (
        <ol className="mt-5 space-y-1">
          {turns.map((turn) => {
            const active = turn.id === activeId;
            return (
              <li key={turn.id}>
                <button
                  type="button"
                  onClick={() => scrubTo((turn.startMs - startMs) / clipMs)}
                  className={`grid w-full grid-cols-[auto_1fr] gap-3 rounded-lg px-2.5 py-2 text-left transition duration-150 ${
                    active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <span
                    aria-hidden
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: turn.speakerColor }}
                  >
                    {turn.speakerInitials}
                  </span>
                  <span className="min-w-0">
                    <span className="mb-0.5 flex items-baseline gap-2">
                      <span className="text-[13px] font-bold">
                        {turn.speakerName}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-[var(--text-faint)]">
                        {formatTimestamp(turn.startMs)}
                      </span>
                    </span>
                    <span
                      className={`block text-[14px] leading-relaxed ${
                        active ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
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
      )}
    </div>
  );
}
