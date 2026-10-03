import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getAnalytics,
  getAskThreads,
  getMeeting,
  getSummaries,
  getTranscript,
  listMeetings,
} from '@/lib/data';
import { CallView } from '@/components/call/CallView';

/**
 * One call: recording, transcript, summaries and the people in it.
 *
 * Server-rendered rather than fetched from `/api/meeting/[id]` on the client.
 * The library used to be a single page that swapped its right-hand pane, which
 * meant every call opened on an empty player and filled in a round-trip later.
 * A call now has its own URL, which is also what makes a search hit, a
 * citation and a "related call" into ordinary links.
 */
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const meeting = await getMeeting(id);
  return {
    title: meeting ? `${meeting.title} — Recap` : 'Call not found — Recap',
  };
}

export default async function CallPage({ params, searchParams }: Props) {
  const { id } = await params;
  const meeting = await getMeeting(id);
  if (!meeting) notFound();

  const [transcript, analytics, summaries, threads, everyMeeting, query] =
    await Promise.all([
      getTranscript(id),
      getAnalytics(id),
      getSummaries(id),
      getAskThreads(),
      listMeetings(),
      searchParams,
    ]);

  // `?t=` carries a search hit or a citation from another page.
  const parsed = Number(query.t);
  const initialSeekMs = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;

  return (
    <CallView
      meeting={meeting}
      transcript={transcript}
      analytics={analytics}
      summaries={summaries}
      threads={threads}
      related={everyMeeting
        .filter((other) => other.id !== meeting.id)
        .slice(0, 4)
        .map((other) => ({
          id: other.id,
          title: other.title,
          startedAt: other.startedAt,
        }))}
      meetingTitles={Object.fromEntries(
        everyMeeting.map((other) => [other.id, other.title]),
      )}
      initialSeekMs={initialSeekMs}
    />
  );
}
