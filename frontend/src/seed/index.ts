/**
 * Assembled seed dataset.
 *
 * Analytics are computed here rather than authored, so the talk-time ribbon can
 * never disagree with the transcript beneath it. Highlights and upcoming
 * meetings are authored, since they represent things a human did or a calendar
 * says rather than anything derivable.
 */
import { computeAnalytics } from '@/lib/analytics';
import type {
  Highlight,
  Meeting,
  MeetingAnalytics,
  Summary,
  Transcript,
} from '@/lib/types';
import * as meridian from './meetings/meridian-discovery';
import * as q4Planning from './meetings/q4-planning';

interface SeedMeeting {
  meeting: Meeting;
  transcript: Transcript;
  summaries: Summary[];
  analytics: MeetingAnalytics;
}

function assemble(source: {
  meeting: Meeting;
  turns: Transcript['turns'];
  summaries: Summary[];
}): SeedMeeting {
  return {
    meeting: source.meeting,
    transcript: {
      meetingId: source.meeting.id,
      turns: source.turns,
      language: 'en-US',
    },
    summaries: source.summaries,
    analytics: computeAnalytics(
      source.meeting.id,
      source.meeting.durationMs,
      source.meeting.participants,
      source.turns,
    ),
  };
}

export const SEED_MEETINGS: SeedMeeting[] = [
  assemble(q4Planning),
  assemble(meridian),
];

export const SEED_HIGHLIGHTS: Highlight[] = [
  {
    id: 'hl-meridian-1',
    meetingId: 'meridian-discovery',
    startMs: meridian.turns[14]!.startMs,
    endMs: meridian.turns[16]!.endMs,
    label: 'The 40-minute outage — the real pain',
    createdAt: '2026-09-09T15:22:00.000Z',
    seeded: true,
  },
  {
    id: 'hl-meridian-2',
    meetingId: 'meridian-discovery',
    startMs: meridian.turns[37]!.startMs,
    endMs: meridian.turns[40]!.endMs,
    label: 'Budget authority — Dana can sign within existing spend',
    createdAt: '2026-09-09T15:26:00.000Z',
    seeded: true,
  },
  {
    id: 'hl-meridian-3',
    meetingId: 'meridian-discovery',
    startMs: meridian.turns[43]!.startMs,
    endMs: meridian.turns[44]!.endMs,
    label: '"Their pricing model is the reason we are in this hole"',
    createdAt: '2026-09-09T15:28:00.000Z',
    seeded: true,
  },
];
