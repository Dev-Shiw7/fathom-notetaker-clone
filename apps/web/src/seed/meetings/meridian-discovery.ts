/**
 * Seed meeting: a sales discovery call.
 *
 * Chosen as the first seeded meeting because it exercises template switching
 * hardest — the same conversation reads completely differently as a general
 * recap, a sales-qualification record, and a bare action list. A standup would
 * not have shown that.
 */
import type { Meeting, Summary } from '@/lib/types';
import { SPEAKER_COLORS, buildTurns, citeTurns, durationFromTurns, participant } from '../helpers';

const ID = 'meridian-discovery';

export const participants = [
  participant('priya', 'Priya Raghavan', {
    role: 'Account Executive',
    org: 'Northwind Data',
    isHost: true,
    color: SPEAKER_COLORS[0],
  }),
  participant('tom', 'Tom Okafor', {
    role: 'Solutions Engineer',
    org: 'Northwind Data',
    color: SPEAKER_COLORS[2],
  }),
  participant('dana', 'Dana Whitfield', {
    role: 'VP Engineering',
    org: 'Meridian Health',
    isExternal: true,
    color: SPEAKER_COLORS[1],
  }),
  participant('marcus', 'Marcus Lee', {
    role: 'Director, Data Platform',
    org: 'Meridian Health',
    isExternal: true,
    color: SPEAKER_COLORS[3],
  }),
];

export const turns = buildTurns(ID, [
  ['priya', "Hey Dana, Marcus — thanks for making the time. I know you've both got a lot going on with the migration."],
  ['dana', "No problem. We've been meaning to have this conversation for a while, honestly."],
  ['priya', "Great. So I've got about thirty minutes on the calendar. I'd love to spend most of it just understanding where you are today, and then Tom can show you whatever's actually relevant rather than a generic demo. Does that work?"],
  ['dana', "That works. We've sat through enough generic demos this quarter."],
  ['priya', 'Fair enough. So — tell me what prompted you to take this call.'],
  ['dana', "Short version is our observability bill went from about forty thousand a year to just under three hundred thousand, and nobody can explain to me why."],
  ['marcus', "It's not that nobody can explain it. It's that the explanation is 'you onboarded forty services and nobody set retention policies', which is true but not very satisfying."],
  ['dana', 'Right. So both things are true.'],
  ['priya', 'That is a very familiar story. When you say forty services — is that forty new ones, or forty total?'],
  ['marcus', "Forty new. We were at maybe sixty before, so we're a bit over a hundred now. The migration to Kubernetes roughly doubled our footprint."],
  ['tom', 'And are those all emitting the same log volume, or is it concentrated?'],
  ['marcus', "Very concentrated. I did the analysis last month — four services account for about seventy percent of ingest. Three of them are the patient-records pipeline and one is an auth service that's logging every token refresh at info level."],
  ['tom', "That auth service is probably your cheapest win. We see that pattern constantly — someone sets info level during an incident and it never gets turned back down."],
  ['marcus', "That's exactly what happened. There was an incident in March."],
  ['dana', "The part that actually worries me isn't the bill though. It's that when we had a real outage in April, it took us forty minutes to figure out which service was failing. We're paying three hundred grand and we still couldn't answer the basic question."],
  ['priya', 'That is the more expensive problem. Do you remember what made it take forty minutes?'],
  ['dana', "We had the data. We just couldn't correlate it. Traces were in one tool, logs in another, and the dashboards people actually trusted were in a third that one engineer built and then left the company."],
  ['marcus', 'Grafana instance that only Ravi knew how to update. Ravi is at Stripe now.'],
  ['dana', 'Ravi is at Stripe now.'],
  ['priya', "So there's a cost problem and a correlation problem, and the correlation one is the one that wakes you up at night."],
  ['dana', "Yes. And a compliance angle, which is the third thing. We're HIPAA, so anything touching patient records has constraints on where it can live and how long we keep it."],
  ['tom', 'Can I ask about that specifically? Is the constraint on region, on retention, or on who can query it?'],
  ['dana', "All three, but mostly the third. Our auditors care a lot about access logs — who looked at what, when. We've had to build that ourselves and it's brittle."],
  ['marcus', "It's a cron job that scrapes audit events into S3 and a Lambda that alerts if the job fails. It's failed twice without alerting."],
  ['priya', "Okay. Tom, given what you're hearing — what's worth showing?"],
  ['tom', "Honestly, two things. The ingest controls, because that's the immediate bill problem, and the unified query layer, because that's the forty minutes. I'd skip the dashboards entirely for today."],
  ['dana', 'Agreed, skip the dashboards.'],
  ['tom', "On ingest — you'd set policies per service rather than globally. So your auth service drops to warn level and samples at ten percent, and your patient-records pipeline keeps everything at full fidelity because you need it for audit. That alone, based on the numbers Marcus just gave me, is probably a forty to fifty percent reduction."],
  ['marcus', 'What happens to the data you sample out? Is it gone, or is it cold?'],
  ['tom', "Cold. It goes to your own object storage in your account, and you can rehydrate a time window on demand. Takes about two minutes for a day's worth."],
  ['marcus', "Our own account matters. That's probably a hard requirement for the HIPAA stuff."],
  ['tom', "It's the default. We never hold the raw data for regulated customers."],
  ['dana', "What does the migration actually look like? Because the last vendor told us two weeks and it took five months."],
  ['tom', "I won't tell you two weeks. Realistically for a hundred services you're looking at a phased rollout. Start with the four noisy ones, prove the reduction, then roll the rest in batches. Six to eight weeks to full coverage if someone on your side owns it."],
  ['dana', 'Marcus, is that something you could own?'],
  ['marcus', "I could own it if it's not competing with the Kubernetes work. That finishes end of Q3."],
  ['dana', 'So realistically we start in October.'],
  ['priya', 'That actually lines up well. Can I ask about budget — is this coming out of the existing observability line, or would it need new approval?'],
  ['dana', "Existing line. If it's under what we're paying now I can sign it. Over that and it goes to Anita, our CFO, and that becomes a whole thing."],
  ['priya', "Understood. And is Anita someone we should get in front of early, or would you rather we didn't?"],
  ['dana', "Later. Let me get comfortable first. If I bring her a half-formed idea it dies."],
  ['priya', 'That makes sense. Are you looking at anyone else?'],
  ['dana', "We're talking to Datadog, obviously. And we had one conversation with Chronosphere that went fine but they felt early for us."],
  ['priya', "What's your read on Datadog so far?"],
  ['dana', "Everyone knows it works. My concern is we'd be solving the correlation problem and making the cost problem worse."],
  ['marcus', 'Their pricing model is the reason we are in this hole.'],
  ['priya', "Okay — so let me say back what I heard, and correct me where I'm wrong. Costs roughly tripled to three hundred thousand, concentrated in four services. The bigger pain is a forty-minute mean time to identify during the April outage, caused by tooling that isn't correlated and institutional knowledge that walked out the door. HIPAA means data stays in your account and access logging has to be auditable. Marcus owns implementation but not until October when Kubernetes wraps. And you can approve inside the current spend without involving Anita."],
  ['dana', "That's accurate. The only thing I'd add is that if we do this, I want the access-logging piece solved properly and not with another cron job."],
  ['priya', "Noted, and that's a fair thing to hold us to. Here's what I'd suggest for next steps. Tom puts together a sizing estimate against your actual ingest numbers — Marcus, if you can send the breakdown you did last month, that makes it real rather than hypothetical. We come back with a phased plan and a number. And we do that inside two weeks so it's not sitting there when Q3 planning starts."],
  ['marcus', "I can send that today. It's a spreadsheet, it's not pretty."],
  ['tom', 'Pretty is not required.'],
  ['dana', "Two weeks works. And Priya — I'd rather see a realistic number than a good one. If it's more expensive than Datadog, tell me and tell me why it's worth it."],
  ['priya', "I'd rather do that too. Let's get the data and I'll come back with something honest."],
  ['dana', 'Great. Thanks both.'],
]);

export const durationMs = durationFromTurns(turns);

export const meeting: Meeting = {
  id: ID,
  title: 'Meridian Health — Discovery',
  startedAt: '2026-09-09T15:00:00.000Z',
  durationMs,
  platform: 'zoom',
  status: 'recorded',
  participants,
  tags: ['sales', 'discovery', 'healthcare'],
  audioUrl: null,
  templateIds: ['general', 'sales-discovery', 'action-items'],
  blurb:
    'Observability costs tripled to $300k; the real pain is a 40-minute MTTI during the April outage.',
};

export const summaries: Summary[] = [
  {
    meetingId: ID,
    templateId: 'general',
    tldr: "Meridian's observability spend has tripled to just under $300k, but the problem Dana actually cares about is that an April outage took 40 minutes to diagnose. Northwind will size a phased rollout against Meridian's real ingest data and come back within two weeks.",
    keyPoints: [
      { text: 'Spend rose from ~$40k to just under $300k a year after onboarding 40 new services during a Kubernetes migration.', citation: citeTurns(turns, 6, 10) },
      { text: 'Ingest is highly concentrated — four services account for ~70% of volume, including an auth service left at info level after a March incident.', citation: citeTurns(turns, 12, 14) },
      { text: 'The April outage took 40 minutes to identify because traces, logs and dashboards lived in three disconnected tools.', citation: citeTurns(turns, 15, 19) },
      { text: 'HIPAA means data must stay in Meridian\'s own account, with auditable access logging — currently a cron job that has failed silently twice.', citation: citeTurns(turns, 21, 24) },
      { text: 'Implementation would start in October, after the Kubernetes work completes at the end of Q3.', citation: citeTurns(turns, 35, 37) },
    ],
    actionItems: [
      { id: `${ID}-a1`, text: 'Send the ingest breakdown spreadsheet from last month\'s analysis', ownerId: 'marcus', dueDate: '2026-09-09', citation: citeTurns(turns, 48, 49) },
      { id: `${ID}-a2`, text: 'Build a sizing estimate against Meridian\'s actual ingest numbers', ownerId: 'tom', dueDate: '2026-09-23', citation: citeTurns(turns, 47) },
      { id: `${ID}-a3`, text: 'Return with a phased plan and a realistic number within two weeks', ownerId: 'priya', dueDate: '2026-09-23', citation: citeTurns(turns, 47, 51) },
    ],
    topics: [
      { title: 'Why they took the call', summary: 'Costs tripled with no satisfying explanation.', startMs: turns[4]!.startMs, endMs: turns[8]!.endMs },
      { title: 'Where the volume comes from', summary: 'Four services, ~70% of ingest, one misconfigured since March.', startMs: turns[8]!.startMs, endMs: turns[13]!.endMs },
      { title: 'The April outage', summary: '40 minutes to identify; correlation, not data, was missing.', startMs: turns[14]!.startMs, endMs: turns[19]!.endMs },
      { title: 'Compliance constraints', summary: 'HIPAA: region, retention, and auditable access.', startMs: turns[20]!.startMs, endMs: turns[24]!.endMs },
      { title: 'Rollout and ownership', summary: 'Phased over 6-8 weeks, Marcus owns it, starts October.', startMs: turns[32]!.startMs, endMs: turns[37]!.endMs },
      { title: 'Budget and competition', summary: 'Approvable within current spend; Datadog is the incumbent threat.', startMs: turns[37]!.startMs, endMs: turns[45]!.endMs },
    ],
  },
  {
    meetingId: ID,
    templateId: 'sales-discovery',
    tldr: 'Qualified opportunity with a clear economic buyer, a compelling event, and a named implementation owner. Timeline is gated on the Kubernetes migration finishing end of Q3.',
    keyPoints: [
      { text: 'PAIN — Cost: $40k → ~$300k/yr. Dana calls the bill the lesser problem.', citation: citeTurns(turns, 6) },
      { text: 'PAIN — Operational: 40-minute MTTI during the April outage. This is the emotional driver and should anchor the proposal.', citation: citeTurns(turns, 15, 17) },
      { text: 'PAIN — Compliance: HIPAA access logging is a self-built cron job that has failed silently twice. Dana explicitly asked us to solve it properly.', citation: citeTurns(turns, 23, 46) },
      { text: 'BUDGET — Dana can approve within the existing observability line. Above current spend it escalates to Anita (CFO), which Dana wants to avoid until he is bought in.', citation: citeTurns(turns, 38, 41) },
      { text: 'TIMELINE — Start October; Kubernetes migration completes end of Q3. 6-8 weeks to full coverage once started.', citation: citeTurns(turns, 34, 37) },
      { text: 'CHAMPION — Marcus Lee owns implementation and has already done the ingest analysis unprompted. Strong technical champion.', citation: citeTurns(turns, 12, 36) },
      { text: 'COMPETITION — Datadog is the main threat but their pricing model caused the current problem, which Marcus stated outright. Chronosphere ruled out as too early.', citation: citeTurns(turns, 42, 45) },
      { text: 'RISK — Dana was burned by a previous vendor promising two weeks and taking five months. Tom pre-empted this with an honest 6-8 week estimate.', citation: citeTurns(turns, 33, 34) },
    ],
    actionItems: [
      { id: `${ID}-s1`, text: 'Get the ingest breakdown from Marcus — makes the proposal concrete rather than hypothetical', ownerId: 'marcus', dueDate: '2026-09-09', citation: citeTurns(turns, 48) },
      { id: `${ID}-s2`, text: 'Size against real numbers; lead the proposal with MTTI, not cost savings', ownerId: 'tom', dueDate: '2026-09-23', citation: citeTurns(turns, 47) },
      { id: `${ID}-s3`, text: 'Include a concrete answer on auditable access logging — Dana called this out unprompted', ownerId: 'tom', dueDate: '2026-09-23', citation: citeTurns(turns, 46) },
      { id: `${ID}-s4`, text: 'Do not approach Anita (CFO) yet — Dana explicitly asked to be comfortable first', ownerId: 'priya', dueDate: null, citation: citeTurns(turns, 40, 41) },
    ],
    topics: [
      { title: 'Pain discovery', summary: 'Cost, then the deeper operational pain.', startMs: turns[4]!.startMs, endMs: turns[19]!.endMs },
      { title: 'Technical qualification', summary: 'Concentration of ingest, HIPAA constraints.', startMs: turns[8]!.startMs, endMs: turns[31]!.endMs },
      { title: 'Decision process', summary: 'Dana approves within budget; CFO above it.', startMs: turns[37]!.startMs, endMs: turns[41]!.endMs },
      { title: 'Competitive landscape', summary: 'Datadog incumbent, Chronosphere too early.', startMs: turns[41]!.startMs, endMs: turns[45]!.endMs },
    ],
  },
  {
    meetingId: ID,
    templateId: 'action-items',
    tldr: 'Four commitments, all due within two weeks.',
    keyPoints: [],
    actionItems: [
      { id: `${ID}-c1`, text: 'Send last month\'s ingest breakdown spreadsheet', ownerId: 'marcus', dueDate: '2026-09-09', citation: citeTurns(turns, 48) },
      { id: `${ID}-c2`, text: 'Produce sizing estimate against actual ingest numbers', ownerId: 'tom', dueDate: '2026-09-23', citation: citeTurns(turns, 47) },
      { id: `${ID}-c3`, text: 'Come back with a phased plan and an honest number within two weeks', ownerId: 'priya', dueDate: '2026-09-23', citation: citeTurns(turns, 47) },
      { id: `${ID}-c4`, text: 'Address auditable access logging explicitly in the proposal', ownerId: 'tom', dueDate: '2026-09-23', citation: citeTurns(turns, 46) },
    ],
    topics: [],
  },
];
