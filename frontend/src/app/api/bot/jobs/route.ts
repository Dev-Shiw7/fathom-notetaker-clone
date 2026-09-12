/**
 * The queue's public face: the app enqueues here, and the UI reads status.
 *
 * Claiming work lives at /next and is token-protected; this route is
 * deliberately open because the demo is public and queuing a job is harmless.
 */
import { QueueUnavailableError, enqueueJob, listJobs, queueAvailable } from '@/lib/jobs';

export async function GET() {
  return Response.json({
    available: queueAvailable(),
    jobs: await listJobs(),
  });
}

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
      botName: body.botName,
      title: body.title ?? null,
      source: 'manual',
    });

    return Response.json({ job }, { status: 201 });
  } catch (err) {
    if (err instanceof QueueUnavailableError) {
      // Explain the actual constraint rather than a generic 500 — this one is
      // a configuration gap, and the message is the fix.
      return Response.json({ error: err.message, needsDatabase: true }, { status: 503 });
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
