/**
 * iCalendar (RFC 5545) parsing.
 *
 * Calendars are subscribed by their private .ics URL rather than through OAuth.
 * Google, Outlook and Apple all publish one, which means no cloud project, no
 * consent screen, and no sensitive-scope review before a stranger can connect
 * a calendar — and one parser covers all three providers.
 *
 * The trade-off, stated plainly: an .ics feed is read-only and refreshes on the
 * provider's schedule rather than instantly, and recurring events are not
 * expanded here (see `parseIcs`). OAuth would fix both, and slots in behind the
 * same `CalendarEvent` shape when it is worth the setup.
 */
import type { CalendarEvent } from './types';

/**
 * Undoes RFC 5545 line folding.
 *
 * Long properties are split across lines with a leading space or tab on each
 * continuation — which is exactly where Meet URLs end up, since they sit in a
 * long DESCRIPTION. Parsing line-by-line without unfolding first silently
 * truncates them.
 */
function unfold(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .filter((line) => line.trim().length > 0);
}

/** Splits `NAME;PARAM=value:content` into its three parts. */
function parseLine(line: string): {
  name: string;
  params: Record<string, string>;
  value: string;
} | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(';');

  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }

  return { name: (name ?? '').toUpperCase(), params, value };
}

/** Reverses RFC 5545 text escaping. */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Converts an iCalendar date-time to an ISO string.
 *
 * Handles the three forms that actually appear: UTC (`...Z`), date-only
 * (all-day events), and floating local time. Floating times are treated as UTC
 * — imprecise, but a wrong timezone is far less damaging here than a crash, and
 * meeting invites from the major providers are virtually always UTC.
 */
function toIso(value: string): string | null {
  const compact = value.trim();

  const dateOnly = compact.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00.000Z`;
  }

  const dateTime = compact.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/,
  );
  if (!dateTime) return null;

  const [, y, m, d, hh, mm, ss] = dateTime;
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}.000Z`;
}

const MEET_URL =
  /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;
const ZOOM_URL = /https:\/\/[\w.-]*zoom\.us\/j\/\d+(?:\?[^\s<>"]*)?/i;
const TEAMS_URL = /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"]+/i;

/**
 * Finds a conferencing link anywhere in an event.
 *
 * Providers are inconsistent about where it lands — Google usually writes both
 * LOCATION and a formatted DESCRIPTION block, Outlook buries it in DESCRIPTION
 * only — so all the likely fields get searched rather than assuming one.
 */
export function findMeetingUrl(fields: {
  location?: string;
  description?: string;
  xGoogleConference?: string;
}): string | null {
  const haystack = [
    fields.xGoogleConference,
    fields.location,
    fields.description,
  ]
    .filter(Boolean)
    .join('\n');

  for (const pattern of [MEET_URL, ZOOM_URL, TEAMS_URL]) {
    const match = haystack.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/**
 * Parses VEVENTs out of an .ics feed.
 *
 * Recurring events are **not** expanded: an event with an RRULE contributes
 * only its first occurrence. Correct expansion means implementing RRULE,
 * EXDATE and RECURRENCE-ID overrides, which is a library in itself — and for
 * auto-joining, a missed weekly standup is a far better failure than a bot
 * dialling into a meeting that was cancelled months ago.
 */
export function parseIcs(raw: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let current: Record<string, string> | null = null;
  let attendees: string[] = [];

  for (const line of unfold(raw)) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {};
      attendees = [];
      continue;
    }

    if (line.startsWith('END:VEVENT')) {
      if (current) {
        const event = buildEvent(current, attendees);
        if (event) events.push(event);
      }
      current = null;
      continue;
    }

    if (!current) continue;

    const parsed = parseLine(line);
    if (!parsed) continue;

    if (parsed.name === 'ATTENDEE') {
      const name =
        parsed.params.CN ?? parsed.value.replace(/^mailto:/i, '').trim();
      if (name) attendees.push(unescapeText(name).replace(/^"|"$/g, ''));
      continue;
    }

    if (parsed.name === 'ORGANIZER') {
      current.organizer =
        parsed.params.CN ?? parsed.value.replace(/^mailto:/i, '').trim();
      continue;
    }

    // Keep only what we use; ics feeds carry a lot of noise.
    const keep: Record<string, string> = {
      UID: 'uid',
      SUMMARY: 'summary',
      DESCRIPTION: 'description',
      LOCATION: 'location',
      DTSTART: 'dtstart',
      DTEND: 'dtend',
      'X-GOOGLE-CONFERENCE': 'xGoogleConference',
      STATUS: 'status',
    };
    const key = keep[parsed.name];
    if (key) current[key] = unescapeText(parsed.value);
  }

  return events;
}

function buildEvent(
  fields: Record<string, string>,
  attendees: string[],
): CalendarEvent | null {
  // A cancelled invite still sits in the feed; joining it would be worse than
  // missing it.
  if (fields.status?.toUpperCase() === 'CANCELLED') return null;

  const startsAt = fields.dtstart ? toIso(fields.dtstart) : null;
  if (!startsAt) return null;

  const endsAt =
    (fields.dtend ? toIso(fields.dtend) : null) ??
    new Date(Date.parse(startsAt) + 30 * 60_000).toISOString();

  return {
    id: fields.uid ?? `${startsAt}-${fields.summary ?? 'untitled'}`,
    title: fields.summary?.trim() || 'Untitled event',
    startsAt,
    endsAt,
    meetingUrl: findMeetingUrl({
      location: fields.location,
      description: fields.description,
      xGoogleConference: fields.xGoogleConference,
    }),
    attendeeNames: attendees,
    organizer: fields.organizer ?? null,
  };
}

/**
 * Fetches and parses a calendar feed.
 *
 * `webcal://` is rewritten because that is what every provider's "copy
 * subscription link" button produces, and `fetch` cannot resolve the scheme.
 */
export async function fetchCalendar(icsUrl: string): Promise<CalendarEvent[]> {
  const url = icsUrl.replace(/^webcal:\/\//i, 'https://');

  const response = await fetch(url, {
    headers: { accept: 'text/calendar, text/plain' },
    // Feeds change slowly and a stale read is harmless; a slow one blocks a page.
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Calendar returned HTTP ${response.status}`);
  }

  const body = await response.text();
  if (!body.includes('BEGIN:VCALENDAR')) {
    throw new Error(describeNonFeed(body));
  }

  return parseIcs(body);
}

/**
 * Explains *why* a URL was rejected.
 *
 * The old message asserted one cause ("use the Secret address in iCal format")
 * for every failure, which is misleading twice over: it names Google though any
 * provider's feed works — the check is on the response body, not the host — and
 * it says nothing about what actually came back. Pasting the calendar's web
 * address is by far the most common mistake and returns an HTML page, so say
 * that, because it points straight at the fix.
 */
function describeNonFeed(body: string): string {
  const head = body.trimStart().slice(0, 200).toLowerCase();
  const isHtml = head.startsWith('<!doctype html') || head.startsWith('<html');

  const wanted =
    'A calendar feed is a URL that serves iCalendar text beginning ' +
    '"BEGIN:VCALENDAR" — usually ending in .ics. In Google Calendar it is ' +
    'Settings → your calendar in the left sidebar → "Secret address in iCal ' +
    'format". Outlook, iCloud and Fastmail all publish an equivalent link.';

  if (isHtml) {
    return (
      'That URL returned a web page, not a calendar feed. This usually means ' +
      'the address bar URL was pasted rather than the feed address. ' +
      wanted
    );
  }

  if (!body.trim()) {
    return `That URL returned an empty response. ${wanted}`;
  }

  return `That URL did not return an iCalendar feed. ${wanted}`;
}
