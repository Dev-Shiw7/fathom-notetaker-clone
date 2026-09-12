/**
 * Forces a calendar refresh and queues any newly-visible meetings.
 *
 * Exists as its own endpoint so it can be driven by a cron (Render cron job,
 * GitHub Action, anything that can make an HTTP request) without that caller
 * needing to know anything about calendars or the queue.
 */
import { calendarAvailable, syncCalendars } from '@/lib/calendar';

export async function POST() {
  if (!calendarAvailable()) {
    return Response.json(
      { error: 'Calendar sync needs MONGODB_URI.' },
      { status: 503 },
    );
  }

  const result = await syncCalendars();
  return Response.json({
    syncedAt: new Date().toISOString(),
    upcoming: result.events.length,
    queued: result.queued,
    errors: result.errors,
  });
}
