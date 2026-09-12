/**
 * The query layer. Every page reads through this module.
 *
 * It serves from MongoDB when `MONGODB_URI` is set and from the bundled seed
 * data otherwise. That fallback is not a testing shim — it means the repo runs
 * for anyone who clones it with no database to provision, and it let the whole
 * UI be built and verified before an Atlas cluster existed.
 *
 * Search runs in memory on both paths. At ten meetings that is far simpler than
 * a text index and behaves identically in dev and production; the moment this
 * outgrows memory it becomes an Atlas Search index behind the same function
 * signature.
 */
import { randomUUID } from 'node:crypto';
import { COLLECTIONS, db, hasMongo } from './mongo';
import { computeAnalytics } from './analytics';
import {
  SEED_ASK_THREADS,
  SEED_HIGHLIGHTS,
  SEED_MEETINGS,
  SEED_UPCOMING,
} from '@/seed';
import { TEMPLATES } from '@/seed/templates';
import type {
  AskThread,
  Highlight,
  Meeting,
  MeetingAnalytics,
  SearchHit,
  Share,
  Summary,
  SummaryTemplate,
  Transcript,
  UpcomingMeeting,
} from './types';

/**
 * Writes made by visitors while running without Mongo. Process-local and lost
 * on restart, which is the honest behaviour — better than silently pretending
 * something persisted.
 */
const memoryHighlights: Highlight[] = [];
const memoryShares: Share[] = [];
const memoryMeetings: Meeting[] = [];
const memoryTranscripts: Transcript[] = [];

/** Strips Mongo's `_id` so documents match the domain types exactly. */
function clean<T>(doc: unknown): T {
  const { _id, ...rest } = (doc ?? {}) as Record<string, unknown>;
  void _id;
  return rest as T;
}

export async function listMeetings(): Promise<Meeting[]> {
  const meetings = hasMongo
    ? (await (await db())
        .collection(COLLECTIONS.meetings)
        .find({})
        .sort({ startedAt: -1 })
        .toArray()).map((d) => clean<Meeting>(d))
    : [...SEED_MEETINGS.map((m) => m.meeting), ...memoryMeetings];

  return [...meetings].sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  );
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  if (!hasMongo) {
    return (
      SEED_MEETINGS.find((m) => m.meeting.id === id)?.meeting ??
      memoryMeetings.find((m) => m.id === id) ??
      null
    );
  }
  const doc = await (await db()).collection(COLLECTIONS.meetings).findOne({ id });
  return doc ? clean<Meeting>(doc) : null;
}

export async function getTranscript(meetingId: string): Promise<Transcript | null> {
  if (!hasMongo) {
    return (
      SEED_MEETINGS.find((m) => m.meeting.id === meetingId)?.transcript ??
      memoryTranscripts.find((t) => t.meetingId === meetingId) ??
      null
    );
  }
  const doc = await (await db())
    .collection(COLLECTIONS.transcripts)
    .findOne({ meetingId });
  return doc ? clean<Transcript>(doc) : null;
}

export async function getSummaries(meetingId: string): Promise<Summary[]> {
  if (!hasMongo) {
    return SEED_MEETINGS.find((m) => m.meeting.id === meetingId)?.summaries ?? [];
  }
  const docs = await (await db())
    .collection(COLLECTIONS.summaries)
    .find({ meetingId })
    .toArray();
  return docs.map((d) => clean<Summary>(d));
}

export async function getAnalytics(
  meetingId: string,
): Promise<MeetingAnalytics | null> {
  if (!hasMongo) {
    const seed = SEED_MEETINGS.find((m) => m.meeting.id === meetingId);
    if (seed) return seed.analytics ?? null;
    const meeting = memoryMeetings.find((m) => m.id === meetingId);
    const transcript = memoryTranscripts.find((t) => t.meetingId === meetingId);
    if (meeting && transcript) {
      return computeAnalytics(meeting.id, meeting.durationMs, meeting.participants, transcript.turns);
    }
    return null;
  }
  const doc = await (await db())
    .collection(COLLECTIONS.analytics)
    .findOne({ meetingId });
  return doc ? clean<MeetingAnalytics>(doc) : null;
}

export async function getTemplates(): Promise<SummaryTemplate[]> {
  return TEMPLATES;
}

export async function getHighlights(meetingId: string): Promise<Highlight[]> {
  const stored = hasMongo
    ? (await (await db())
        .collection(COLLECTIONS.highlights)
        .find({ meetingId })
        .toArray()).map((d) => clean<Highlight>(d))
    : [
        ...SEED_HIGHLIGHTS.filter((h) => h.meetingId === meetingId),
        ...memoryHighlights.filter((h) => h.meetingId === meetingId),
      ];

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

export async function getUpcoming(): Promise<UpcomingMeeting[]> {
  const items = hasMongo
    ? (await (await db()).collection(COLLECTIONS.upcoming).find({}).toArray()).map(
        (d) => clean<UpcomingMeeting>(d),
      )
    : SEED_UPCOMING;
  return [...items].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export async function getAskThreads(): Promise<AskThread[]> {
  if (!hasMongo) return SEED_ASK_THREADS;
  const docs = await (await db()).collection(COLLECTIONS.askThreads).find({}).toArray();
  return docs.map((d) => clean<AskThread>(d));
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

/** Create a meeting and optional transcript when running without Mongo. */
export async function createMeeting(input: {
  meeting: Meeting;
  transcript?: Transcript;
  summaries?: Summary[];
}): Promise<Meeting> {
  if (hasMongo) {
    await (await db()).collection(COLLECTIONS.meetings).insertOne({ ...input.meeting });
    if (input.transcript) await (await db()).collection(COLLECTIONS.transcripts).insertOne({ ...input.transcript });
    if (input.summaries && input.summaries.length > 0) {
      await (await db()).collection(COLLECTIONS.summaries).insertMany(input.summaries.map((s) => ({ ...s })));
    }
  } else {
    memoryMeetings.push(input.meeting);
    if (input.transcript) memoryTranscripts.push(input.transcript);
  }
  return input.meeting;
}

export async function createTranscript(transcript: Transcript): Promise<Transcript> {
  if (hasMongo) {
    await (await db()).collection(COLLECTIONS.transcripts).insertOne({ ...transcript });
  } else {
    memoryTranscripts.push(transcript);
  }
  return transcript;
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
