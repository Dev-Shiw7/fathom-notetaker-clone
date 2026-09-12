/**
 * Where a bot runner asks for work.
 *
 * This is the inversion that makes the whole thing deployable: the app never
 * reaches out to a bot, the bot polls in. Outbound HTTPS only, so the runner
 * can sit on a laptop behind NAT with nothing forwarded.
 */
import { QueueUnavailableError, claimNextJob, isAuthorisedRunner } from '@/lib/jobs';

export async function GET(request: Request) {
  if (!isAuthorisedRunner(request)) {
    // Without this, anyone who finds the public URL could drain the queue and
    // the real runner would silently never receive work.
    return Response.json({ error: 'Unauthorised runner.' }, { status: 401 });
  }

  try {
    const runner =
      new URL(request.url).searchParams.get('runner') ?? 'unknown-runner';
    const job = await claimNextJob(runner);

    // 200 with a null job, not 404 — "nothing to do" is the normal case on a
    // 10-second poll, and logging it as an error would bury real failures.
    return Response.json({ job });
  } catch (err) {
    if (err instanceof QueueUnavailableError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
