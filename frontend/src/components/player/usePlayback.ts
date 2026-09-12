'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Playback clock for a meeting.
 *
 * Deliberately indifferent to whether audio exists. With an `audioUrl` it
 * drives a real `<audio>` element; without one it advances a synthetic clock at
 * the same rate. Everything downstream — transcript sync, the ribbon playhead,
 * click-to-seek — reads one `positionMs` and cannot tell the difference.
 *
 * That is what lets the product be built and demonstrated before any audio has
 * been generated, and what will let stitched audio drop in later without
 * touching a single consumer.
 */
export interface Playback {
  positionMs: number;
  playing: boolean;
  rate: number;
  hasAudio: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (ms: number) => void;
  nudge: (deltaMs: number) => void;
  setRate: (rate: number) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export function usePlayback(durationMs: number, audioUrl: string | null): Playback {
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasAudio = Boolean(audioUrl);

  // Synthetic clock, used only when there is no audio element to trust.
  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    if (hasAudio || !playing) return;

    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const delta = (now - lastTickRef.current) * rate;
      lastTickRef.current = now;

      setPositionMs((current) => {
        const next = current + delta;
        if (next >= durationMs) {
          setPlaying(false);
          return durationMs;
        }
        return next;
      });
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [playing, rate, durationMs, hasAudio]);

  // Real audio drives position from timeupdate instead.
  useEffect(() => {
    const element = audioRef.current;
    if (!element || !hasAudio) return;

    const onTime = () => setPositionMs(element.currentTime * 1000);
    const onEnded = () => setPlaying(false);

    element.addEventListener('timeupdate', onTime);
    element.addEventListener('ended', onEnded);
    return () => {
      element.removeEventListener('timeupdate', onTime);
      element.removeEventListener('ended', onEnded);
    };
  }, [hasAudio]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, [rate]);

  const play = useCallback(() => {
    setPlaying(true);
    void audioRef.current?.play().catch(() => {
      // Autoplay policy or a missing file — the synthetic clock still runs, so
      // the transcript keeps working rather than the page appearing frozen.
    });
  }, []);

  const pause = useCallback(() => {
    setPlaying(false);
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    setPlaying((current) => {
      if (current) {
        audioRef.current?.pause();
        return false;
      }
      void audioRef.current?.play().catch(() => {});
      return true;
    });
  }, []);

  const seek = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(durationMs, ms));
      setPositionMs(clamped);
      if (audioRef.current) audioRef.current.currentTime = clamped / 1000;
      lastTickRef.current = performance.now();
    },
    [durationMs],
  );

  const nudge = useCallback(
    (deltaMs: number) => seek(positionMs + deltaMs),
    [positionMs, seek],
  );

  const setRate = useCallback((next: number) => setRateState(next), []);

  return {
    positionMs,
    playing,
    rate,
    hasAudio,
    play,
    pause,
    toggle,
    seek,
    nudge,
    setRate,
    audioRef,
  };
}
