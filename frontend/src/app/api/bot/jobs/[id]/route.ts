/**
 * Progress reporting for a claimed job.
 *
 * The bot PATCHes this as it moves through joining → recording → done|failed,
 * which is what lets the UI show a live status for a process running on a
 * completely different machine.
 */
import { QueueUnavailableError, getJob, isAuthorisedRunner, updateJob } from '@/lib/jobs';
import type { BotJobStatus } from '@/lib/types';

const ALLOWED: BotJobStatus[] = [
  'joining',
  'recording',
  'done',
  'failed',
  'cancelled',
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  return job
    ? Response.json({ job })
    : Response.json({ error: 'No such job.' }, { status: 404 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorisedRunner(request)) {
    return Response.json({ error: 'Unauthorised runner.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const status = body.status as BotJobStatus | undefined;

    if (status && !ALLOWED.includes(status)) {
      return Response.json(
        { error: `Status must be one of: ${ALLOWED.join(', ')}` },
        { status: 400 },
      );
    }

    const job = await updateJob(id, {
      ...(status ? { status } : {}),
      ...(body.lastMessage !== undefined ? { lastMessage: body.lastMessage } : {}),
      ...(body.resultMeetingId !== undefined
        ? { resultMeetingId: body.resultMeetingId }
        : {}),
    });

    return job
      ? Response.json({ job })
      : Response.json({ error: 'No such job.' }, { status: 404 });
  } catch (err) {
    if (err instanceof QueueUnavailableError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
