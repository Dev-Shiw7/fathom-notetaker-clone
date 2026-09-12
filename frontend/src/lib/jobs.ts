/**
 * The bot work queue.
 *
 * The deployed app has no browser and no route to a machine that has one, so it
 * never starts a bot. It enqueues here, and a bot process running wherever
 * Chrome lives claims work on its next poll. Everything flows outbound from the
 * bot, which is what lets it sit on a laptop behind NAT with no inbound
 * connectivity, port forwarding, or tunnel.
 *
 * Unlike the rest of the data layer there is **no seed fallback**. The queue is
 * shared state between two separate machines; process memory on Render is
 * invisible to a bot elsewhere, so a real database is the whole point.
 */
import { randomUUID } from 'node:crypto';
import { COLLECTIONS, db, hasMongo } from './mongo';
import type { BotJob, BotJobStatus } from './types';

/** Thrown when the queue is used without a database configured. */
export class QueueUnavailableError extends Error {
  constructor() {
    super(
      'The bot queue needs MONGODB_URI. It is shared state between the web app ' +
        'and a bot process on another machine, so the in-memory fallback used ' +
        'for seed content cannot work here.',
    );
    this.name = 'QueueUnavailableError';
  }
}

export const queueAvailable = () => hasMongo;

function assertAvailable(): void {
  if (!hasMongo) throw new QueueUnavailableError();
}

function clean(doc: unknown): BotJob {
  const { _id, ...rest } = (doc ?? {}) as Record<string, unknown>;
  void _id;
  return rest as unknown as BotJob;
}

const MEET_CODE = /([a-z]{3}-[a-z]{4}-[a-z]{3})/i;

export function extractMeetingCode(url: string): string | null {
  return url.match(MEET_CODE)?.[1]?.toLowerCase() ?? null;
}

export async function enqueueJob(input: {
  meetingUrl: string;
  botName?: string;
  source?: BotJob['source'];
  calendarEventId?: string | null;
  title?: string | null;
  notBefore?: string;
}): Promise<BotJob> {
  assertAvailable();
  const collection = (await db()).collection(COLLECTIONS.botJobs);

  // Calendar syncs run repeatedly over the same events, so a job that already
  // exists for an event must not be queued again. Only terminal jobs are
  // allowed to be superseded — a re-sync should not duplicate pending work.
  if (input.calendarEventId) {
    const existing = await collection.findOne({
      calendarEventId: input.calendarEventId,
      status: { $in: ['queued', 'claimed', 'joining', 'recording', 'done'] },
    });
    if (existing) return clean(existing);
  }

  const job: BotJob = {
    id: `job-${randomUUID().slice(0, 12)}`,
    meetingUrl: input.meetingUrl,
    meetingCode: extractMeetingCode(input.meetingUrl),
    botName: input.botName ?? 'Notetaker',
    status: 'queued',
    source: input.source ?? 'manual',
    calendarEventId: input.calendarEventId ?? null,
    title: input.title ?? null,
    notBefore: input.notBefore ?? new Date().toISOString(),
    createdAt: new Date().toISOString(),
    claimedAt: null,
    finishedAt: null,
    claimedBy: null,
    lastMessage: null,
    resultMeetingId: null,
  };

  await collection.insertOne({ ...job });
  return job;
}

/**
 * Hands the oldest eligible job to one bot, exactly once.
 *
 * The read and the status change are a single `findOneAndUpdate` on purpose. A
 * find-then-update would let two runners poll simultaneously, both see the same
 * `queued` row, and both join the meeting — two bots in the call, two
 * transcripts, and a very confused host.
 */
export async function claimNextJob(claimedBy: string): Promise<BotJob | null> {
  assertAvailable();
  const collection = (await db()).collection(COLLECTIONS.botJobs);

  const claimed = await collection.findOneAndUpdate(
    { status: 'queued', notBefore: { $lte: new Date().toISOString() } },
    {
      $set: {
        status: 'claimed' as BotJobStatus,
        claimedAt: new Date().toISOString(),
        claimedBy,
      },
    },
    { sort: { notBefore: 1, createdAt: 1 }, returnDocument: 'after' },
  );

  return claimed ? clean(claimed) : null;
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<BotJob, 'status' | 'lastMessage' | 'resultMeetingId'>>,
): Promise<BotJob | null> {
  assertAvailable();
  const collection = (await db()).collection(COLLECTIONS.botJobs);

  const terminal =
    patch.status === 'done' ||
    patch.status === 'failed' ||
    patch.status === 'cancelled';

  const updated = await collection.findOneAndUpdate(
    { id },
    {
      $set: {
        ...patch,
        ...(terminal ? { finishedAt: new Date().toISOString() } : {}),
      },
    },
    { returnDocument: 'after' },
  );

  return updated ? clean(updated) : null;
}

export async function listJobs(limit = 25): Promise<BotJob[]> {
  if (!hasMongo) return [];
  const docs = await (await db())
    .collection(COLLECTIONS.botJobs)
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(clean);
}

export async function getJob(id: string): Promise<BotJob | null> {
  if (!hasMongo) return null;
  const doc = await (await db()).collection(COLLECTIONS.botJobs).findOne({ id });
  return doc ? clean(doc) : null;
}

/**
 * Shared secret between the app and any bot runner.
 *
 * Without it, anyone who finds the public URL could claim jobs — learning which
 * meetings are scheduled and, worse, taking work so the real bot never runs.
 */
export function isAuthorisedRunner(request: Request): boolean {
  const expected = process.env.BOT_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}
