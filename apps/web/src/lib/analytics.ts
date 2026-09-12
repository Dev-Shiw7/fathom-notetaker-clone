/**
 * Speaker analytics, derived from the transcript.
 *
 * These numbers are *computed*, never authored. That matters for a seeded demo:
 * hand-written stats drift from the transcript the moment either changes, and a
 * talk-time ribbon that disagrees with the transcript underneath it is worse
 * than no ribbon at all. Everything here is a pure function of the turns, so it
 * is always consistent with what the viewer can read and hear.
 */
import type {
  MeetingAnalytics,
  Participant,
  SpeakerStats,
  TranscriptTurn,
} from './types';

const WORD_PATTERN = /[A-Za-z0-9''-]+/g;

export function countWords(text: string): number {
  return text.match(WORD_PATTERN)?.length ?? 0;
}

/**
 * Merges consecutive turns by the same speaker into single stretches.
 *
 * A "monologue" is how long someone held the floor, which is rarely one turn —
 * captions and diarisation both chop continuous speech into fragments, so
 * measuring raw turns would badly understate it.
 */
function longestUnbrokenStretch(
  turns: TranscriptTurn[],
  speakerId: string,
): number {
  let longest = 0;
  let runStart: number | null = null;
  let runEnd = 0;

  for (const turn of turns) {
    if (turn.speakerId === speakerId) {
      if (runStart === null) runStart = turn.startMs;
      runEnd = Math.max(runEnd, turn.endMs);
    } else if (runStart !== null) {
      longest = Math.max(longest, runEnd - runStart);
      runStart = null;
    }
  }
  if (runStart !== null) longest = Math.max(longest, runEnd - runStart);

  return longest;
}

/**
 * Total wall-clock time covered by speech, merging overlaps.
 *
 * Summing turn durations would double-count people talking over each other and
 * can exceed the meeting length, which then produces a negative silence figure.
 */
function unionDurationMs(turns: TranscriptTurn[]): number {
  const ranges = [...turns]
    .map((t) => [t.startMs, t.endMs] as const)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let cursor = -1;

  for (const [start, end] of ranges) {
    const from = Math.max(start, cursor);
    if (end > from) {
      total += end - from;
      cursor = end;
    }
  }
  return total;
}

export function computeAnalytics(
  meetingId: string,
  durationMs: number,
  participants: Participant[],
  turns: TranscriptTurn[],
): MeetingAnalytics {
  const ordered = [...turns].sort((a, b) => a.startMs - b.startMs);

  // A turn starting before the previous speaker finished is an interruption.
  // With caption-derived transcripts this is an approximation — true overlap
  // detection needs the audio — but it tracks the felt experience well.
  const interruptionsBySpeaker = new Map<string, number>();
  for (let i = 1; i < ordered.length; i += 1) {
    const current = ordered[i]!;
    const previous = ordered[i - 1]!;
    if (
      current.speakerId !== previous.speakerId &&
      current.startMs < previous.endMs
    ) {
      interruptionsBySpeaker.set(
        current.speakerId,
        (interruptionsBySpeaker.get(current.speakerId) ?? 0) + 1,
      );
    }
  }

  const speakers: SpeakerStats[] = participants.map((participant) => {
    const own = ordered.filter((t) => t.speakerId === participant.id);
    const talkMs = own.reduce((sum, t) => sum + (t.endMs - t.startMs), 0);
    const wordCount = own.reduce((sum, t) => sum + countWords(t.text), 0);

    return {
      speakerId: participant.id,
      talkMs,
      talkShare: 0, // filled in below, once the total is known
      turnCount: own.length,
      wordCount,
      wordsPerMinute: talkMs > 0 ? Math.round(wordCount / (talkMs / 60_000)) : 0,
      longestMonologueMs: longestUnbrokenStretch(ordered, participant.id),
      questionsAsked: own.filter((t) => t.text.includes('?')).length,
      interruptions: interruptionsBySpeaker.get(participant.id) ?? 0,
    };
  });

  const totalTalkMs = speakers.reduce((sum, s) => sum + s.talkMs, 0);
  for (const speaker of speakers) {
    speaker.talkShare = totalTalkMs > 0 ? speaker.talkMs / totalTalkMs : 0;
  }

  const spokenMs = unionDurationMs(ordered);

  return {
    meetingId,
    speakers: speakers.sort((a, b) => b.talkMs - a.talkMs),
    totalTalkMs,
    silenceMs: Math.max(0, durationMs - spokenMs),
    turnsPerMinute:
      durationMs > 0
        ? Math.round((ordered.length / (durationMs / 60_000)) * 10) / 10
        : 0,
    silentParticipantIds: speakers
      .filter((s) => s.turnCount === 0)
      .map((s) => s.speakerId),
  };
}

/** `03:24` / `1:03:24` — used everywhere a timestamp is shown. */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/** `58 min` / `1h 02m` — for durations rather than positions. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
