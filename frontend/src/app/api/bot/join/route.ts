/**
 * "Send the notetaker to this meeting."
 *
 * This used to spawn `npx tsx` against a sibling ../backend directory, which
 * worked only on the machine the developer happened to be sitting at. The
 * deployed app has no browser and no route to one, so it now *enqueues* and
 * lets a bot runner claim the work on its next poll.
 *
 * Kept at this path so the existing UI keeps working; the queue proper lives
 * at /api/bot/jobs.
 */
import { QueueUnavailableError, enqueueJob, listJobs } from '@/lib/jobs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const meetingUrl = String(body.meetingUrl ?? '').trim();

    if (!/meet\.google\.com/i.test(meetingUrl)) {
      return Response.json(
        { error: 'A Google Meet URL is required.' },
        { status: 400 },
      );
    }

    const job = await enqueueJob({
      meetingUrl,
      botName: body.botName ?? 'Notetaker',
      title: body.title ?? null,
      source: 'manual',
    });

    return Response.json({
      success: true,
      job,
      message:
        'Queued. A notetaker runner will pick this up on its next poll and join the call.',
    });
  } catch (err) {
    if (err instanceof QueueUnavailableError) {
      return Response.json(
        {
          error: 'The bot queue is not configured in this deployment.',
          detail:
            'Queuing needs MONGODB_URI: the queue is shared state between this app ' +
            'and a bot process running elsewhere with a real browser, so in-memory ' +
            'state cannot work. The bot itself is real and lives in /backend — run ' +
            'it locally with: npm run backend -- join --url <meet-url>',
          stubbed: true,
        },
        { status: 503 },
      );
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ jobs: await listJobs() });
}
