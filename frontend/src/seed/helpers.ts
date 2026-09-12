/**
 * Seed-authoring helpers.
 *
 * Timings are *derived* from the dialogue rather than hand-written. Authoring
 * hundreds of start/end pairs by hand guarantees drift the first time a line is
 * edited, and the whole product — click-to-seek, citations, the talk-time
 * ribbon — is only as trustworthy as those numbers.
 *
 * Everything here is deterministic. No `Math.random`, or the seed data would
 * change on every build and diffs would be meaningless.
 */
import { countWords } from '@/lib/analytics';
import type { Participant, TranscriptTurn } from '@/lib/types';

/** Average conversational speaking rate. */
const WORDS_PER_MINUTE = 150;
const MIN_TURN_MS = 900;

/** Deterministic 0..1 from an integer — a stand-in for jitter we can reproduce. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** One line of dialogue: who said it, and what. */
export type ScriptLine = [speakerId: string, text: string];

export interface BuildTurnsOptions {
  /** Silence before the first word. */
  leadInMs?: number;
  /**
   * Fraction of turns that begin before the previous one ends, producing the
   * overlaps the analytics layer reads as interruptions. Real meetings are
   * full of these; a transcript with none reads as synthetic.
   */
  interruptionRate?: number;
}

/**
 * Turns a script into timed transcript turns.
 *
 * Each turn's length comes from its word count at a natural speaking rate, with
 * a small deterministic gap between speakers. A fraction of turns are pulled
 * back to start before the previous speaker finished.
 */
export function buildTurns(
  meetingId: string,
  script: ScriptLine[],
  options: BuildTurnsOptions = {},
): TranscriptTurn[] {
  const { leadInMs = 1_200, interruptionRate = 0.08 } = options;

  const turns: TranscriptTurn[] = [];
  let cursor = leadInMs;

  script.forEach(([speakerId, text], index) => {
    const spokenMs = Math.max(
      MIN_TURN_MS,
      Math.round((countWords(text) / WORDS_PER_MINUTE) * 60_000),
    );

    let startMs = cursor;
    const previous = turns[turns.length - 1];

    if (
      previous &&
      previous.speakerId !== speakerId &&
      pseudoRandom(index + 7) < interruptionRate
    ) {
      // Cut in slightly early, but never before the previous turn is mostly out.
      const overlap = Math.min(700, Math.round((previous.endMs - previous.startMs) * 0.2));
      startMs = Math.max(previous.startMs + 1, previous.endMs - overlap);
    }

    const endMs = startMs + spokenMs;
    turns.push({
      id: `${meetingId}-t${String(index + 1).padStart(4, '0')}`,
      speakerId,
      startMs,
      endMs,
      text,
      audioUrl: null,
    });

    // Natural beat between speakers; same speaker continues more tightly.
    const gap =
      180 + Math.round(pseudoRandom(index + 31) * (previous?.speakerId === speakerId ? 220 : 520));
    cursor = endMs + gap;
  });

  return turns;
}

/** Total meeting length implied by a script, plus a short tail. */
export function durationFromTurns(turns: TranscriptTurn[], tailMs = 2_500): number {
  const last = turns[turns.length - 1];
  return last ? last.endMs + tailMs : 0;
}

/** Builds a participant, filling in initials and the palette colour. */
export function participant(
  id: string,
  name: string,
  options: {
    role?: string;
    org?: string;
    isHost?: boolean;
    isExternal?: boolean;
    color: string;
  },
): Participant {
  return {
    id,
    name,
    role: options.role ?? null,
    org: options.org ?? null,
    isHost: options.isHost ?? false,
    isExternal: options.isExternal ?? false,
    color: options.color,
    initials: name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  };
}

/**
 * Speaker palette. Distinct in hue *and* lightness so the talk-time ribbon
 * stays readable for viewers with colour-vision deficiency, and legible against
 * both themes.
 */
export const SPEAKER_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#0ea5e9',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
] as const;

/** Finds the turn covering a position, for citation lookups. */
export function turnAt(turns: TranscriptTurn[], ms: number): TranscriptTurn | null {
  return turns.find((t) => ms >= t.startMs && ms < t.endMs) ?? null;
}

/** Builds a citation spanning a range of turn indices (1-based, inclusive). */
export function citeTurns(
  turns: TranscriptTurn[],
  fromIndex: number,
  toIndex = fromIndex,
): { startMs: number; endMs: number } {
  const first = turns[fromIndex - 1];
  const last = turns[toIndex - 1] ?? first;
  if (!first || !last) return { startMs: 0, endMs: 0 };
  return { startMs: first.startMs, endMs: last.endMs };
}
