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
  AskThread,
  Highlight,
  Meeting,
  MeetingAnalytics,
  Summary,
  Transcript,
  UpcomingMeeting,
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

export const SEED_UPCOMING: UpcomingMeeting[] = [
  {
    id: 'up-1',
    title: 'Meridian Health — Technical deep dive',
    startsAt: '2026-09-23T15:00:00.000Z',
    durationMs: 45 * 60_000,
    platform: 'zoom',
    attendeeNames: ['Priya Raghavan', 'Tom Okafor', 'Dana Whitfield', 'Marcus Lee'],
    botWillJoin: true,
  },
  {
    id: 'up-2',
    title: 'Weekly pipeline review',
    startsAt: '2026-09-15T09:30:00.000Z',
    durationMs: 30 * 60_000,
    platform: 'meet',
    attendeeNames: ['Priya Raghavan', 'Sofia Marchetti', 'Dev Anand'],
    botWillJoin: true,
  },
  {
    id: 'up-3',
    title: '1:1 — Priya / Sofia',
    startsAt: '2026-09-16T13:00:00.000Z',
    durationMs: 30 * 60_000,
    platform: 'meet',
    attendeeNames: ['Priya Raghavan', 'Sofia Marchetti'],
    botWillJoin: false,
  },
];

export const SEED_ASK_THREADS: AskThread[] = [
  {
    id: 'ask-1',
    question: 'What is blocking the Meridian deal?',
    answer:
      "Timing rather than conviction. Marcus Lee owns implementation but cannot start until the Kubernetes migration finishes at the end of Q3, which puts a realistic start in October. Commercially it is unblocked — Dana Whitfield can approve within the existing observability line without involving the CFO.",
    sources: [
      {
        meetingId: 'meridian-discovery',
        citation: {
          startMs: meridian.turns[35]!.startMs,
          endMs: meridian.turns[37]!.endMs,
        },
        quote: 'I could own it if it\'s not competing with the Kubernetes work. That finishes end of Q3.',
      },
      {
        meetingId: 'meridian-discovery',
        citation: {
          startMs: meridian.turns[38]!.startMs,
          endMs: meridian.turns[39]!.endMs,
        },
        quote: "Existing line. If it's under what we're paying now I can sign it.",
      },
    ],
  },
  {
    id: 'ask-2',
    question: 'Where are we losing to Datadog?',
    answer:
      "We are not, on this deal. Dana's concern is the opposite — that Datadog would solve the correlation problem while making the cost problem worse. Marcus was blunter, attributing the current overspend directly to Datadog's pricing model. The competitive risk is incumbency and familiarity, not capability.",
    sources: [
      {
        meetingId: 'meridian-discovery',
        citation: {
          startMs: meridian.turns[43]!.startMs,
          endMs: meridian.turns[44]!.endMs,
        },
        quote: 'Their pricing model is the reason we are in this hole.',
      },
    ],
  },
  {
    id: 'ask-3',
    question: 'What did we promise customers this week?',
    answer:
      'One commitment set, all from the Meridian discovery call: a sizing estimate built against their real ingest numbers, a phased rollout plan with an honest price, and an explicit answer on auditable HIPAA access logging. All due by 23 September.',
    sources: [
      {
        meetingId: 'meridian-discovery',
        citation: {
          startMs: meridian.turns[46]!.startMs,
          endMs: meridian.turns[46]!.endMs,
        },
        quote: 'We come back with a phased plan and a number. And we do that inside two weeks.',
      },
    ],
  },
];
