/**
 * Clip shares.
 *
 * The data layer has had `createShare`/`getShare` since the beginning, but
 * nothing ever called them: dragging the ribbon raised a toast and threw the
 * selection away, and there was no route to open a share with. This is the
 * missing half — the ribbon posts a range here and gets back a token that
 * `/share/[token]` can render.
 */
import { createShare, getMeeting } from '@/lib/data';
import { formatTimestamp } from '@/lib/analytics';

/** Shorter than this and the clip is almost certainly a mis-drag. */
const MIN_CLIP_MS = 1_000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const meetingId = String(body.meetingId ?? '').trim();
    const startMs = Number(body.startMs);
    const endMs = Number(body.endMs);

    if (!meetingId) {
      return Response.json({ error: 'meetingId is required.' }, { status: 400 });
    }
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return Response.json(
        { error: 'startMs and endMs must be numbers.' },
        { status: 400 },
      );
    }

    // Accept a backwards drag rather than rejecting it — dragging right-to-left
    // is a perfectly normal way to select a range.
    const from = Math.max(0, Math.min(startMs, endMs));
    const to = Math.max(startMs, endMs);

    if (to - from < MIN_CLIP_MS) {
      return Response.json(
        { error: 'That clip is too short to share.' },
        { status: 400 },
      );
    }

    const meeting = await getMeeting(meetingId);
    if (!meeting) {
      return Response.json({ error: 'No such meeting.' }, { status: 404 });
    }

    // Clamp to the recording: a share that points past the end would open on a
    // player that can never reach it.
    const end = Math.min(to, meeting.durationMs);

    const share = await createShare({
      meetingId,
      startMs: from,
      endMs: end,
      label:
        String(body.label ?? '').trim() ||
        `${meeting.title} · ${formatTimestamp(from)}–${formatTimestamp(end)}`,
    });

    return Response.json({ share }, { status: 201 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
