/**
 * Calendar connections.
 *
 * GET returns connections plus a freshly-synced upcoming list, because a stale
 * "next meeting" is worse than a slightly slower page.
 */
import {
  calendarAvailable,
  connectCalendar,
  disconnectCalendar,
  listCalendars,
  syncCalendars,
} from '@/lib/calendar';
import { QueueUnavailableError } from '@/lib/jobs';

export async function GET() {
  if (!calendarAvailable()) {
    return Response.json({
      available: false,
      connections: [],
      events: [],
      reason:
        'Calendar sync needs MONGODB_URI — subscriptions and queued jobs are ' +
        'shared with a bot running on another machine, so they need a real database.',
    });
  }

  const [connections, sync] = await Promise.all([listCalendars(), syncCalendars()]);
  return Response.json({
    available: true,
    connections,
    events: sync.events,
    queued: sync.queued,
    errors: sync.errors,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const icsUrl = String(body.icsUrl ?? '').trim();

    if (!icsUrl) {
      return Response.json({ error: 'An iCal URL is required.' }, { status: 400 });
    }

    const connection = await connectCalendar({
      icsUrl,
      label: body.label,
      autoJoin: body.autoJoin ?? true,
    });

    return Response.json({ connection }, { status: 201 });
  } catch (err) {
    if (err instanceof QueueUnavailableError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    // Validation failures from fetching the feed are the user's to fix, so the
    // message goes straight through rather than becoming a generic 500.
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });

  const removed = await disconnectCalendar(id);
  return removed
    ? Response.json({ ok: true })
    : Response.json({ error: 'No such calendar.' }, { status: 404 });
}
