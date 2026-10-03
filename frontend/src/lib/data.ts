/**
 * The query layer. Every page reads through this module.
 *
 * With `MONGODB_URI` set, MongoDB is the only source of truth: a read that
 * fails throws, so an outage shows up as an error instead of quietly serving
 * canned content. Without it the app runs in an explicit local mode on the
 * bundled seed meetings, so the repo still starts for someone who has no
 * database; nothing the bot produces is stored in that mode.
 *
 * Search runs in memory over the stored transcripts. At this scale that is
 * simpler than a text index and behaves identically in dev and production; it
 * becomes an Atlas Search index behind the same signature when it has to.
 */
import { randomUUID } from 'node:crypto';
import { COLLECTIONS, db, hasMongo } from './mongo';
import { computeAnalytics, formatMeetingDate } from './analytics';
import { SEED_HIGHLIGHTS, SEED_MEETINGS } from '@/seed';
import { participant, SPEAKER_COLORS } from '@/seed/helpers';
import { TEMPLATES } from '@/seed/templates';
import type {
  Highlight,
  Meeting,
  MeetingAnalytics,
  Participant,
  SearchHit,
  Share,
  Summary,
  SummaryTemplate,
  Transcript,
  TranscriptTurn,
} from './types';

const globalForData = globalThis as unknown as {
  memoryHighlights?: Highlight[];
  memoryShares?: Share[];
};

// Local mode only (no MONGODB_URI): visitor-created highlights and shares.
const memoryHighlights: Highlight[] = (globalForData.memoryHighlights ??= []);
const memoryShares: Share[] = (globalForData.memoryShares ??= []);

/** Strips Mongo's `_id` so documents match the domain types exactly. */
function clean<T>(doc: unknown): T {
  const { _id, ...rest } = (doc ?? {}) as Record<string, unknown>;
  void _id;
  return rest as T;
}

/** Reads from the database, or from seed content in explicit local mode. */
async function readOrSeed<T>(
  fromDatabase: () => Promise<T>,
  fromSeed: () => T,
): Promise<T> {
  return hasMongo ? fromDatabase() : fromSeed();
}

export async function listMeetings(): Promise<Meeting[]> {
  const meetings = await readOrSeed(
    async () => {
      return (
        await (await db())
          .collection(COLLECTIONS.meetings)
          .find({})
          .sort({ startedAt: -1 })
          .toArray()
      ).map((d) => clean<Meeting>(d));
    },
    () => SEED_MEETINGS.map((m) => m.meeting),
  );

  return [...meetings].sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  );
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  return readOrSeed(
    async () => {
      const doc = await (await db()).collection(COLLECTIONS.meetings).findOne({ id });
      return doc ? clean<Meeting>(doc) : null;
    },
    () => SEED_MEETINGS.find((m) => m.meeting.id === id)?.meeting ?? null,
  );
}

export async function getTranscript(meetingId: string): Promise<Transcript | null> {
  return readOrSeed(
    async () => {
      const doc = await (await db())
        .collection(COLLECTIONS.transcripts)
        .findOne({ meetingId });
      return doc ? clean<Transcript>(doc) : null;
    },
    () => SEED_MEETINGS.find((m) => m.meeting.id === meetingId)?.transcript ?? null,
  );
}

export async function getSummaries(meetingId: string): Promise<Summary[]> {
  return readOrSeed(
    async () =>
      (
        await (await db())
          .collection(COLLECTIONS.summaries)
          .find({ meetingId })
          .toArray()
      ).map((d) => clean<Summary>(d)),
    () => SEED_MEETINGS.find((m) => m.meeting.id === meetingId)?.summaries ?? [],
  );
}

export async function getAnalytics(
  meetingId: string,
): Promise<MeetingAnalytics | null> {
  return readOrSeed(
    async () => {
      const doc = await (await db())
        .collection(COLLECTIONS.analytics)
        .findOne({ meetingId });
      return doc ? clean<MeetingAnalytics>(doc) : null;
    },
    () => SEED_MEETINGS.find((m) => m.meeting.id === meetingId)?.analytics ?? null,
  );
}

export async function getTemplates(): Promise<SummaryTemplate[]> {
  return TEMPLATES;
}

export async function getHighlights(meetingId: string): Promise<Highlight[]> {
  const stored = await readOrSeed(
    async () =>
      (await (await db())
        .collection(COLLECTIONS.highlights)
        .find({ meetingId })
        .toArray()).map((d) => clean<Highlight>(d)),
    () => [
      ...SEED_HIGHLIGHTS.filter((h) => h.meetingId === meetingId),
      ...memoryHighlights.filter((h) => h.meetingId === meetingId),
    ],
  );

  return [...stored].sort((a, b) => a.startMs - b.startMs);
}

export async function createHighlight(input: {
  meetingId: string;
  startMs: number;
  endMs: number;
  label: string;
}): Promise<Highlight> {
  const highlight: Highlight = {
    id: `hl-${randomUUID().slice(0, 8)}`,
    ...input,
    createdAt: new Date().toISOString(),
    seeded: false,
  };

  if (hasMongo) {
    await (await db()).collection(COLLECTIONS.highlights).insertOne({ ...highlight });
  } else {
    memoryHighlights.push(highlight);
  }
  return highlight;
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

/**
 * Share tokens are opaque and unguessable rather than sequential — a clip may
 * be sent to someone outside the company, so the link itself is the only
 * credential and must not be enumerable.
 */
export async function createShare(input: {
  meetingId: string;
  startMs: number;
  endMs: number;
  label: string;
}): Promise<Share> {
  const share: Share = {
    token: randomUUID().replace(/-/g, '').slice(0, 22),
    ...input,
    createdAt: new Date().toISOString(),
  };

  if (hasMongo) {
    await (await db()).collection(COLLECTIONS.shares).insertOne({ ...share });
  } else {
    memoryShares.push(share);
  }
  return share;
}

export async function getShare(token: string): Promise<Share | null> {
  if (!hasMongo) return memoryShares.find((s) => s.token === token) ?? null;
  const doc = await (await db()).collection(COLLECTIONS.shares).findOne({ token });
  return doc ? clean<Share>(doc) : null;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const SNIPPET_RADIUS = 90;

/**
 * Searches transcript text across every meeting.
 *
 * Searching turns rather than titles is the whole point — people look for
 * something that was *said*, and a title search would miss all of it.
 */
export async function search(query: string, limit = 40): Promise<SearchHit[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const meetings = await listMeetings();
  const hits: SearchHit[] = [];

  for (const meeting of meetings) {
    const transcript = await getTranscript(meeting.id);
    if (!transcript) continue;

    const speakerNames = new Map(
      meeting.participants.map((p) => [p.id, p.name] as const),
    );

    for (const turn of transcript.turns) {
      const index = turn.text.toLowerCase().indexOf(needle);
      if (index === -1) continue;

      hits.push({
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        startedAt: meeting.startedAt,
        turnId: turn.id,
        startMs: turn.startMs,
        speakerName: speakerNames.get(turn.speakerId) ?? 'Unknown',
        snippet: buildSnippet(turn.text, index, needle.length),
      });

      if (hits.length >= limit) return hits;
    }
  }

  return hits;
}

/** Text around a match, with the match wrapped in «» for the UI to style. */
function buildSnippet(text: string, index: number, length: number): string {
  const from = Math.max(0, index - SNIPPET_RADIUS);
  const to = Math.min(text.length, index + length + SNIPPET_RADIUS);
  const body =
    text.slice(from, index) +
    '«' +
    text.slice(index, index + length) +
    '»' +
    text.slice(index + length, to);
  return `${from > 0 ? '…' : ''}${body}${to < text.length ? '…' : ''}`;
}
/**
 * Files a finished recording: meeting, transcript, summaries and analytics.
 *
 * Needs the database — a recording that only lives in one server process's
 * memory would vanish on the next deploy and be invisible to every other
 * instance, which is exactly the "mock" behaviour this replaces.
 */
export async function saveRecording(input: {
  meetingCode: string;
  title?: string | null;
  startedAt: string;
  durationMs: number;
  turns: TranscriptTurn[];
  speakerNames: Map<string, string>;
  audioContentType: string;
  summarize: (
    meetingId: string,
    title: string,
    participants: Participant[],
  ) => Promise<Summary[]>;
}): Promise<{ meeting: Meeting; summaries: Summary[]; analytics: MeetingAnalytics }> {
  if (!hasMongo) throw new Error('Saving a recording needs MONGODB_URI.');
  const database = await db();

  // A Meet code is reused (recurring meetings, retries), so it cannot be the id
  // on its own. First recording keeps the bare code, later ones get -2, -3.
  const taken = new Set(
    (await database.collection(COLLECTIONS.meetings).find({}, { projection: { id: 1 } }).toArray()).map(
      (d) => d.id as string,
    ),
  );
  let meetingId = input.meetingCode;
  for (let n = 2; taken.has(meetingId); n += 1) meetingId = `${input.meetingCode}-${n}`;

  const speakerIds = Array.from(new Set(input.turns.map((t) => t.speakerId)));
  const participants: Participant[] = speakerIds.map((id, i) =>
    participant(id, input.speakerNames.get(id) ?? `Speaker ${i + 1}`, {
      isHost: i === 0,
      color: SPEAKER_COLORS[i % SPEAKER_COLORS.length]!,
    }),
  );

  const title = input.title?.trim() || `Meet ${input.meetingCode}`;
  const summaries = await input.summarize(meetingId, title, participants);

  const meeting: Meeting = {
    id: meetingId,
    title,
    startedAt: input.startedAt,
    durationMs: input.durationMs,
    platform: 'meet',
    status: 'recorded',
    participants,
    tags: ['bot-recorded'],
    audioUrl: `/api/audio/${encodeURIComponent(meetingId)}`,
    templateIds: summaries.map((s) => s.templateId),
    blurb:
      summaries.find((s) => s.templateId === 'general')?.tldr ??
      summaries[0]?.tldr ??
      `Recorded on ${formatMeetingDate(input.startedAt)}`,
  };
  const transcript: Transcript = { meetingId, turns: input.turns, language: 'en' };
  const analytics = computeAnalytics(meetingId, input.durationMs, participants, input.turns);

  await database.collection(COLLECTIONS.meetings).insertOne({ ...meeting });
  await database.collection(COLLECTIONS.transcripts).insertOne({ ...transcript });
  if (summaries.length > 0) {
    await database.collection(COLLECTIONS.summaries).insertMany(summaries.map((s) => ({ ...s })));
  }
  await database.collection(COLLECTIONS.analytics).insertOne({ ...analytics });

  return { meeting, summaries, analytics };
}
