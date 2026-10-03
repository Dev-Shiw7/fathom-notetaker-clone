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

export interface FinalizeInput {
  sessionId: string;
  meetingCode: string;
  title: string | null;
  startedAt: string;
  durationMs: number;
  mime: string;
  samples: SpeakerSample[];
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

export async function finalizeRecording(input: FinalizeInput): Promise<{
  meeting: Meeting;
  summaries: Summary[];
  failedTemplates: string[];
}> {
  const audio = await assembleChunks(input.sessionId);
  if (!audio || audio.length < 2_000) {
    throw new PipelineError('No audio was captured from the meeting.');
  }
  if (audio.length > MAX_AUDIO_BYTES) {
    throw new PipelineError(
      `Recording is ${(audio.length / 1048576).toFixed(1)} MB, over the ${MAX_AUDIO_BYTES / 1048576} MB transcription limit.`,
      413,
    );
  }

  const ext = input.mime.includes('mp4') ? 'm4a' : 'webm';
  const segments = await transcribe(audio, `${input.meetingCode}.${ext}`, input.mime);
  const { turns, speakerNames } = buildTurns(segments, input.samples);
  if (turns.length === 0) throw new PipelineError('No speech was detected in the recording.');

  const durationMs = Math.max(input.durationMs, turns[turns.length - 1]!.endMs);
  let failedTemplates: string[] = [];

  const saved = await saveRecording({
    meetingCode: input.meetingCode,
    title: input.title,
    startedAt: input.startedAt,
    durationMs,
    turns,
    speakerNames,
    audioContentType: input.mime,
    summarize: async (meetingId, title, participants) => {
      const result = await summarizeMeeting({ meetingId, title, participants, turns });
      failedTemplates = result.failed;
      return result.summaries;
    },
  });

  await storeAudio(saved.meeting.id, audio, input.mime);
  await dropChunks(input.sessionId);
  return { meeting: saved.meeting, summaries: saved.summaries, failedTemplates };
}
