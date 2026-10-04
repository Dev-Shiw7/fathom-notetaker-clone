/**
 * Turns a finished recording into a meeting: audio → transcript → summaries.
 *
 * Whisper gives text with timestamps but no speakers. The bot supplies the
 * missing half by sampling who Meet shows as speaking while it records; each
 * segment takes the name that dominated its time window. A segment with no
 * usable sample stays "Speaker" — an honest gap beats a guessed name.
 */
import { assembleChunks, dropChunks, storeAudio } from './audio';
import { saveRecording } from './data';
import { transcribe, type SttSegment } from './groq';
import { summarizeMeeting } from './summarize';
import type { Meeting, Summary, TranscriptTurn } from './types';

/** Groq's per-file upload ceiling on the free tier. */
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}

export interface SpeakerSample {
  /** Milliseconds from the start of the recording. */
  t: number;
  name: string | null;
}

/** One stretch of speech as the meeting platform's own captions showed it. */
export interface CaptionLine {
  t: number;
  name: string;
  text: string;
}

export interface FinalizeInput {
  sessionId: string;
  meetingCode: string;
  title: string | null;
  startedAt: string;
  durationMs: number;
  mime: string;
  samples: SpeakerSample[];
  /** What Meet's captions said; the fallback when the audio gives no transcript. */
  captions?: CaptionLine[];
  /** The bot measured the recorded mix and found it silent. */
  audioSilent?: boolean;
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';

function dominantSpeaker(samples: SpeakerSample[], fromMs: number, toMs: number): string | null {
  const counts = new Map<string, number>();
  for (const sample of samples) {
    // Captions trail the speech they transcribe by a second or two, so a
    // segment's speaker shows up in samples slightly *after* it ends.
    if (!sample.name || sample.t < fromMs - 300 || sample.t > toMs + 1500) continue;
    counts.set(sample.name, (counts.get(sample.name) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

export function buildTurns(segments: SttSegment[], samples: SpeakerSample[]) {
  const speakerNames = new Map<string, string>();
  const turns: TranscriptTurn[] = [];

  for (const seg of segments) {
    // Whisper invents "Thank you." over silence; its own confidence says so.
    if (seg.text.length < 2 || seg.noSpeechProb > 0.6 || seg.avgLogprob < -1.5) continue;

    const startMs = Math.round(seg.start * 1000);
    const endMs = Math.round(seg.end * 1000);
    const name = dominantSpeaker(samples, startMs, endMs);
    const speakerId = name ? `spk-${slug(name)}` : 'spk-unknown';
    speakerNames.set(speakerId, name ?? 'Speaker');

    const previous = turns[turns.length - 1];
    if (
      previous &&
      previous.speakerId === speakerId &&
      startMs - previous.endMs < 2000 &&
      endMs - previous.startMs < 60_000
    ) {
      previous.text = `${previous.text} ${seg.text}`;
      previous.endMs = endMs;
      continue;
    }
    turns.push({
      id: `turn-${turns.length + 1}`,
      speakerId,
      startMs,
      endMs,
      text: seg.text,
      audioUrl: null,
    });
  }
  return { turns, speakerNames };
}

/**
 * A transcript built from Meet's captions. Used when the audio could not be
 * captured or transcribed: Meet heard the call even if the bot's recording
 * did not, and the captions carry real speaker names. Each line runs until the
 * next one starts, capped so a long silence is not credited to one speaker.
 */
export function buildTurnsFromCaptions(captions: CaptionLine[]) {
  const speakerNames = new Map<string, string>();
  const turns: TranscriptTurn[] = [];
  const sorted = [...captions].sort((a, b) => a.t - b.t);
  sorted.forEach((line, i) => {
    const speakerId = `spk-${slug(line.name)}`;
    speakerNames.set(speakerId, line.name);
    const next = sorted[i + 1];
    const words = line.text.split(/\s+/).length;
    const spoken = Math.max(1500, Math.round((words / 2.5) * 1000));
    const endMs = Math.max(line.t + 500, Math.min(next ? next.t : Infinity, line.t + spoken));
    turns.push({ id: `turn-${turns.length + 1}`, speakerId, startMs: line.t, endMs, text: line.text, audioUrl: null });
  });
  return { turns, speakerNames };
}

export async function finalizeRecording(input: FinalizeInput): Promise<{
  meeting: Meeting;
  summaries: Summary[];
  failedTemplates: string[];
}> {
  const captions = input.captions ?? [];
  const audio = await assembleChunks(input.sessionId);
  const hasAudio = Boolean(audio && audio.length >= 2_000);

  let turns: TranscriptTurn[] = [];
  let speakerNames = new Map<string, string>();
  let audioProblem: string | null = hasAudio ? null : 'No audio was captured from the meeting.';

  // A silent mix is not sent to Whisper: it would only invent "Thank you."
  if (hasAudio && input.audioSilent) {
    audioProblem = 'The recorded audio was silent.';
  } else if (hasAudio) {
    try {
      if (audio!.length > MAX_AUDIO_BYTES) {
        throw new PipelineError(
          `Recording is ${(audio!.length / 1048576).toFixed(1)} MB, over the ${MAX_AUDIO_BYTES / 1048576} MB transcription limit.`,
          413,
        );
      }
      const ext = input.mime.includes('mp4') ? 'm4a' : 'webm';
      const segments = await transcribe(audio!, `${input.meetingCode}.${ext}`, input.mime);
      ({ turns, speakerNames } = buildTurns(segments, input.samples));
      if (turns.length === 0) audioProblem = 'No speech was detected in the recording.';
    } catch (err) {
      // With captions in hand a failed transcription is not fatal.
      if (captions.length === 0) throw err;
      audioProblem = (err as Error).message;
    }
  }

  if (turns.length === 0 && captions.length > 0) {
    ({ turns, speakerNames } = buildTurnsFromCaptions(captions));
  }
  if (turns.length === 0) throw new PipelineError(audioProblem ?? 'No speech was detected in the recording.');

  const durationMs = Math.max(input.durationMs, turns[turns.length - 1]!.endMs);
  let failedTemplates: string[] = [];

  const saved = await saveRecording({
    meetingCode: input.meetingCode,
    title: input.title,
    startedAt: input.startedAt,
    durationMs,
    turns,
    speakerNames,
    audioContentType: hasAudio ? input.mime : null,
    summarize: async (meetingId, title, participants) => {
      const result = await summarizeMeeting({ meetingId, title, participants, turns });
      failedTemplates = result.failed;
      return result.summaries;
    },
  });

  if (hasAudio) await storeAudio(saved.meeting.id, audio!, input.mime);
  await dropChunks(input.sessionId);
  return { meeting: saved.meeting, summaries: saved.summaries, failedTemplates };
}
