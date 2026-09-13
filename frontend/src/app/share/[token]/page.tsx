import Link from 'next/link';
import type { Metadata } from 'next';
import { getShare, getMeeting, getTranscript } from '@/lib/data';
import { formatTimestamp, formatDuration, formatMeetingDate } from '@/lib/analytics';
import { ClipPlayer } from '@/components/share/ClipPlayer';

/**
 * A shared clip.
 *
 * Deliberately its own page rather than a deep link into the app: the token is
 * the only credential, and whoever holds it sees exactly the range that was
 * shared — not the full recording and not the meeting list.
 *
 * It does still render inside the root layout, so the app's header and nav are
 * visible to a recipient. That is survivable only because this demo has no
 * auth and nothing behind those links is private. Once real accounts exist,
 * this route needs its own root layout (a route group) so a clip recipient is
 * not handed the workspace navigation.
 */

// The token is looked up per request; a share created a second ago must work.
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const share = await getShare(token);
  return {
    title: share ? `${share.label} — Recap` : 'Clip not found — Recap',
    // A clip may be sent outside the company; keep it out of search results.
    robots: { index: false, follow: false },
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const share = await getShare(token);

  if (!share) {
    return (
      <div className="mx-auto grid min-h-[60vh] w-full max-w-[560px] place-items-center px-4 text-center">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">
            This clip is no longer available
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            The link may be mistyped, or the clip may have been removed. Share
            links are unguessable, so there is nothing to browse here.
          </p>
          <Link
            href="/"
            className="tap mt-5 inline-block text-sm font-bold text-[var(--accent)]"
          >
            Go to Recap →
          </Link>
        </div>
      </div>
    );
  }

  const [meeting, transcript] = await Promise.all([
    getMeeting(share.meetingId),
    getTranscript(share.meetingId),
  ]);

  // Turns that overlap the clip window, not merely those starting inside it —
  // a turn spanning the clip's start is part of what was shared.
  const turns = (transcript?.turns ?? []).filter(
    (turn) => turn.endMs > share.startMs && turn.startMs < share.endMs,
  );

  const participantsById = new Map(
    (meeting?.participants ?? []).map((p) => [p.id, p] as const),
  );

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 py-8 pb-16 sm:px-6">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-faint)]">
        Shared clip
      </p>
      <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight">
        {meeting?.title ?? 'Meeting'}
      </h1>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--text-muted)]">
        {meeting && <span>{formatMeetingDate(meeting.startedAt)}</span>}
        <span aria-hidden>·</span>
        <span className="font-mono tabular-nums">
          {formatTimestamp(share.startMs)} – {formatTimestamp(share.endMs)}
        </span>
        <span aria-hidden>·</span>
        <span>{formatDuration(share.endMs - share.startMs)} clip</span>
      </div>

      <div className="mt-6">
        <ClipPlayer
          startMs={share.startMs}
          endMs={share.endMs}
          audioUrl={meeting?.audioUrl ?? null}
          turns={turns.map((turn) => {
            const speaker = participantsById.get(turn.speakerId);
            return {
              id: turn.id,
              startMs: turn.startMs,
              text: turn.text,
              speakerName: speaker?.name ?? 'Speaker',
              speakerColor: speaker?.color ?? 'var(--border-strong)',
              speakerInitials: speaker?.initials ?? '??',
            };
          })}
        />
      </div>

      {turns.length === 0 && (
        <p className="mt-6 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          No transcript was captured for this stretch of the meeting.
        </p>
      )}

      <p className="mt-8 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]">
        Shared from{' '}
        <Link href="/" className="tap font-bold text-[var(--accent)]">
          Recap
        </Link>
        . Anyone with this link can view the clip.
      </p>
    </div>
  );
}
