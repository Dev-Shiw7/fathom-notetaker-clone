/**
 * Calendar subscriptions and sync.
 *
 * Syncing does two things: it refreshes the upcoming list the UI shows, and it
 * queues bot jobs for events that carry a meeting link. There is deliberately
 * no separate scheduler process — a job is queued with `notBefore` set to just
 * before the meeting starts, and the queue's claim query already refuses to
 * hand out work early. One mechanism instead of two.
 */
import { randomUUID } from 'node:crypto';
import { COLLECTIONS, db, hasMongo } from './mongo';
import { fetchCalendar } from './ics';
import { QueueUnavailableError, enqueueJob } from './jobs';
import type { CalendarConnection, CalendarEvent } from './types';

/** Queue the bot this long before an event starts. */
const JOIN_LEAD_MS = 2 * 60_000;
/** How far ahead to queue. Beyond this, a later sync will catch it. */
const HORIZON_MS = 7 * 24 * 60 * 60_000;

function clean<T>(doc: unknown): T {
  const { _id, ...rest } = (doc ?? {}) as Record<string, unknown>;
  void _id;
  return rest as unknown as T;
}

export const calendarAvailable = () => hasMongo;

export async function listCalendars(): Promise<CalendarConnection[]> {
  if (!hasMongo) return [];
  const docs = await (await db())
    .collection(COLLECTIONS.calendars)
    .find({})
    .toArray();
  return docs.map((d) => clean<CalendarConnection>(d));
}

export async function connectCalendar(input: {
  icsUrl: string;
  label?: string;
  autoJoin?: boolean;
}): Promise<CalendarConnection> {
  if (!hasMongo) throw new QueueUnavailableError();

  // Validate by actually fetching before storing. A URL that 404s or returns
  // HTML should fail here, while the user is looking at the form — not later,
  // silently, in a background sync nobody is watching.
  const events = await fetchCalendar(input.icsUrl);

  const connection: CalendarConnection = {
    id: `cal-${randomUUID().slice(0, 10)}`,
    label: input.label?.trim() || inferLabel(input.icsUrl),
    icsUrl: input.icsUrl.trim(),
    connectedAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
    lastSyncError: null,
    autoJoin: input.autoJoin ?? true,
  };

  await (await db())
    .collection(COLLECTIONS.calendars)
    .insertOne({ ...connection });

  if (connection.autoJoin) await queueUpcoming(events);
  return connection;
}

export async function disconnectCalendar(id: string): Promise<boolean> {
  if (!hasMongo) return false;
  const result = await (await db())
    .collection(COLLECTIONS.calendars)
    .deleteOne({ id });
  return result.deletedCount > 0;
}

export interface SyncResult {
  events: CalendarEvent[];
  queued: number;
  errors: { calendarId: string; message: string }[];
}

/**
 * Refreshes every connected calendar.
 *
 * One broken feed must not hide the others, so failures are collected per
 * calendar and recorded on the connection rather than thrown.
 */
export async function syncCalendars(): Promise<SyncResult> {
  if (!hasMongo) return { events: [], queued: 0, errors: [] };

  const connections = await listCalendars();
  const collection = (await db()).collection(COLLECTIONS.calendars);

  const all: CalendarEvent[] = [];
  const errors: SyncResult['errors'] = [];
  let queued = 0;

  for (const connection of connections) {
    try {
      const events = await fetchCalendar(connection.icsUrl);
      all.push(...events);
      if (connection.autoJoin) queued += await queueUpcoming(events);

      await collection.updateOne(
        { id: connection.id },
        { $set: { lastSyncedAt: new Date().toISOString(), lastSyncError: null } },
      );
    } catch (err) {
      const message = (err as Error).message;
      errors.push({ calendarId: connection.id, message });
      await collection.updateOne(
        { id: connection.id },
        { $set: { lastSyncedAt: new Date().toISOString(), lastSyncError: message } },
      );
    }
  }

  return { events: sortUpcoming(all), queued, errors };
}

/** Upcoming events across all calendars, without re-fetching. */
export async function upcomingEvents(): Promise<CalendarEvent[]> {
  const { events } = await syncCalendars();
  return events;
}

/**
 * Queues the bot for future events that have a meeting link.
 *
 * Dedup is by `calendarEventId` inside `enqueueJob`, so syncing repeatedly —
 * which is the normal case — never produces duplicate jobs.
 */
async function queueUpcoming(events: CalendarEvent[]): Promise<number> {
  const now = Date.now();
  let queued = 0;

  for (const event of events) {
    if (!event.meetingUrl) continue;

    const startsAt = Date.parse(event.startsAt);
    if (Number.isNaN(startsAt)) continue;
    if (startsAt < now) continue;
    if (startsAt > now + HORIZON_MS) continue;

    try {
      const job = await enqueueJob({
        meetingUrl: event.meetingUrl,
        source: 'calendar',
        calendarEventId: event.id,
        title: event.title,
        notBefore: new Date(startsAt - JOIN_LEAD_MS).toISOString(),
      });
      if (job.status === 'queued') queued += 1;
    } catch {
      // A single unqueueable event should not abort the whole sync.
    }
  }

  return queued;
}

function sortUpcoming(events: CalendarEvent[]): CalendarEvent[] {
  const now = Date.now();
  return events
    .filter((e) => Date.parse(e.endsAt) >= now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, 25);
}

function inferLabel(icsUrl: string): string {
  try {
    const host = new URL(icsUrl.replace(/^webcal:\/\//i, 'https://')).hostname;
    if (host.includes('google')) return 'Google Calendar';
    if (host.includes('outlook') || host.includes('office')) return 'Outlook';
    if (host.includes('icloud')) return 'Apple Calendar';
    return host;
  } catch {
    return 'Calendar';
  }
}
