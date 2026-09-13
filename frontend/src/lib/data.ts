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
import { computeAnalytics, formatMeetingDate } from './analytics';
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
  Participant,
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
const memorySummaries: Summary[] = [];

/** Strips Mongo's `_id` so documents match the domain types exactly. */
function clean<T>(doc: unknown): T {
  const { _id, ...rest } = (doc ?? {}) as Record<string, unknown>;
  void _id;
  return rest as T;
}

/** Throttles the unreachable-database warning; these reads run per request. */
let lastUnreachableWarning = 0;

/**
 * Runs a database read, falling back to bundled seed content when the database
 * is absent **or unreachable**.
 *
 * `hasMongo` only answers "is MONGODB_URI set?". Every read here used to branch
 * on it alone, so a configured-but-unreachable cluster threw straight out of
 * the data layer and took the whole page down with a 500 — even though the
 * seed content that makes this repo runnable without a database was sitting
 * right there. mongo.ts already promises this behaviour ("fail fast and fall
 * back rather than hang a page load while Atlas is cold or unreachable"); this
 * is what makes it true.
 *
 * Writes deliberately do not use this: silently discarding a write into seed
 * data would be worse than failing.
 */
async function readOrSeed<T>(
  fromDatabase: () => Promise<T>,
  fromSeed: () => T,
): Promise<T> {
  if (!hasMongo) return fromSeed();
  try {
    return await fromDatabase();
  } catch (err) {
    const now = Date.now();
    if (now - lastUnreachableWarning > 30_000) {
      lastUnreachableWarning = now;
      console.warn(
        `[data] database unreachable, serving seed content: ${(err as Error).message}`,
      );
    }
    return fromSeed();
  }
}

export async function listMeetings(): Promise<Meeting[]> {
  const meetings = await readOrSeed(
    async () =>
      (await (await db())
        .collection(COLLECTIONS.meetings)
        .find({})
        .sort({ startedAt: -1 })
        .toArray()).map((d) => clean<Meeting>(d)),
    () => [...SEED_MEETINGS.map((m) => m.meeting), ...memoryMeetings],
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
    () =>
      SEED_MEETINGS.find((m) => m.meeting.id === id)?.meeting ??
      memoryMeetings.find((m) => m.id === id) ??
      null,
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
    () =>
      SEED_MEETINGS.find((m) => m.meeting.id === meetingId)?.transcript ??
      memoryTranscripts.find((t) => t.meetingId === meetingId) ??
      null,
  );
}

export async function getSummaries(meetingId: string): Promise<Summary[]> {
  return readOrSeed(
    async () => {
      const docs = await (await db())
        .collection(COLLECTIONS.summaries)
        .find({ meetingId })
        .toArray();
      return docs.map((d) => clean<Summary>(d));
    },
    () =>
      SEED_MEETINGS.find((m) => m.meeting.id === meetingId)?.summaries ??
      memorySummaries.filter((s) => s.meetingId === meetingId),
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
    () => {
      const seed = SEED_MEETINGS.find((m) => m.meeting.id === meetingId);
      if (seed) return seed.analytics ?? null;
      const meeting = memoryMeetings.find((m) => m.id === meetingId);
      const transcript = memoryTranscripts.find((t) => t.meetingId === meetingId);
      if (meeting && transcript) {
        return computeAnalytics(meeting.id, meeting.durationMs, meeting.participants, transcript.turns);
      }
      return null;
    },
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

export async function getUpcoming(): Promise<UpcomingMeeting[]> {
  const items = await readOrSeed(
    async () =>
      (await (await db()).collection(COLLECTIONS.upcoming).find({}).toArray()).map(
        (d) => clean<UpcomingMeeting>(d),
      ),
    () => SEED_UPCOMING,
  );
  return [...items].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export async function getAskThreads(): Promise<AskThread[]> {
  return readOrSeed(
    async () => {
      const docs = await (await db())
        .collection(COLLECTIONS.askThreads)
        .find({})
        .toArray();
      return docs.map((d) => clean<AskThread>(d));
    },
    () => SEED_ASK_THREADS,
  );
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
const BOT_PARTICIPANT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#FECE5C', '#A78BFA', '#F472B6',
];

function initialsFor(name: string, fallbackIndex: number): string {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return initials || `S${fallbackIndex + 1}`;
}

/**
 * Save a meeting, transcript, summary and analytics from the bot in one shot.
 *
 * The bot already does all the work — it generates a stub transcript with
 * per-turn speaker names (see `backend/src/recording.ts`) and a stub summary
 * (`backend/src/transcription.ts`) before it ever calls this. This used to
 * discard almost all of it: the summary parameter went unused, real speaker
 * names were overwritten with "Speaker 1"/"Speaker 2", `templateIds` was left
 * empty so the summary panel had nothing to switch between, and analytics was
 * never computed for a bot-produced meeting at all. The net effect was that a
 * call the bot actually recorded opened to an empty Summary tab and a dead
 * talk-time ribbon — exactly the "what comes out the other side" moment the
 * product is supposed to prove out. This writes everything the bot handed us.
 */
export async function saveBotTranscript(input: {
  meetingCode: string;
  meetingUrl: string;
  botName: string;
  transcript: Transcript;
  summary?: {
    text: string;
    keyPoints?: string[];
    actionItems?: Array<{ task: string; owner?: string; dueDate?: string }>;
  };
  /** Real per-speaker names, keyed by speakerId — see `backend/src/transcription.ts`. */
  speakerNames?: Record<string, string>;
}): Promise<Meeting | null> {
  const turns = input.transcript.turns;
  const speakerIds = Array.from(new Set(turns.map((t) => t.speakerId)));

  const participants: Participant[] = speakerIds.map((id, i) => {
    const name = input.speakerNames?.[id] ?? `Speaker ${i + 1}`;
    return {
      id,
      name,
      role: null,
      org: null,
      isHost: i === 0,
      isExternal: false,
      color: BOT_PARTICIPANT_COLORS[i % BOT_PARTICIPANT_COLORS.length]!,
      initials: initialsFor(name, i),
    };
  });

  const durationMs = turns[turns.length - 1]?.endMs ?? 60_000;
  // Only one template exists for a bot-produced summary today, but the field
  // is what the summary-template switcher reads, so it must be populated for
  // the switcher (and `summaries[0]`) to have anything to show.
  const templateId = 'general';

  const meeting: Meeting = {
    id: input.meetingCode,
    title: `Bot Recording: ${input.meetingCode}`,
    startedAt: new Date().toISOString(),
    durationMs,
    platform: 'meet',
    status: 'recorded',
    participants,
    tags: ['bot-recorded', 'stubbed'],
    audioUrl: null,
    templateIds: input.summary ? [templateId] : [],
    blurb:
      input.summary?.text.split('\n').find((line) => line.trim().length > 0)?.trim() ??
      `Recorded by ${input.botName} on ${formatMeetingDate(new Date().toISOString())}`,
  };

  const idByLowerName = new Map(participants.map((p) => [p.name.toLowerCase(), p.id]));

  // Every claim in a summary is supposed to cite where in the recording it
  // came from (see the `Citation` type in lib/types.ts). The stub summariser
  // does not track which turn a key point or action item was pulled from, so
  // the honest citation here is "somewhere in this call" — the full duration
  // — rather than inventing a false timestamp for a point we can't actually
  // locate.
  const wholeCallCitation = { startMs: 0, endMs: durationMs };

  const summaries: Summary[] = input.summary
    ? [
        {
          meetingId: meeting.id,
          templateId,
          tldr: input.summary.text,
          keyPoints: (input.summary.keyPoints ?? []).map((text) => ({
            text,
            citation: wholeCallCitation,
          })),
          actionItems: (input.summary.actionItems ?? []).map((item, i) => ({
            id: `${meeting.id}-action-${i}`,
            text: item.task,
            ownerId: item.owner ? idByLowerName.get(item.owner.toLowerCase()) ?? null : null,
            dueDate: item.dueDate ?? null,
            citation: wholeCallCitation,
          })),
          topics: [],
        },
      ]
    : [];

  const analytics = computeAnalytics(meeting.id, durationMs, participants, turns);

  if (!hasMongo) {
    memoryMeetings.push(meeting);
    memoryTranscripts.push(input.transcript);
    memorySummaries.push(...summaries);
    return meeting;
  }

  try {
    const database = await db();
    await database.collection(COLLECTIONS.meetings).insertOne({ ...meeting });
    await database.collection(COLLECTIONS.transcripts).insertOne({ ...input.transcript });
    if (summaries.length > 0) {
      await database
        .collection(COLLECTIONS.summaries)
        .insertMany(summaries.map((s) => ({ ...s })));
    }
    await database.collection(COLLECTIONS.analytics).insertOne({ ...analytics });
    return meeting;
  } catch (err) {
    console.error('Error saving bot transcript:', err);
    return null;
  }
}