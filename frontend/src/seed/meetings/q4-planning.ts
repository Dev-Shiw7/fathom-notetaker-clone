/**
 * Seed meeting: eight people, just under an hour.
 *
 * The brief singles this shape out as "the case that actually matters", and it
 * is the one that stresses everything: the talk-time ribbon has to stay legible
 * across ~50 minutes, the transcript has to scroll without jank, and speaker
 * attribution has to survive eight voices rather than three.
 *
 * It deliberately shares people and subject matter with the Meridian discovery
 * call, so cross-meeting search and Ask have genuine threads to follow rather
 * than two unrelated islands.
 */
import type { Meeting, Summary } from '@/lib/types';
import { SPEAKER_COLORS, buildTurns, citeTurns, durationFromTurns, participant } from '../helpers';

const ID = 'q4-planning';

export const participants = [
  participant('alina', 'Alina Kovač', { role: 'VP Engineering', org: 'Northwind Data', isHost: true, color: SPEAKER_COLORS[0] }),
  participant('ben', 'Ben Mercer', { role: 'Staff Engineer, Platform', org: 'Northwind Data', color: SPEAKER_COLORS[1] }),
  participant('dev', 'Dev Anand', { role: 'Engineering Manager, Ingest', org: 'Northwind Data', color: SPEAKER_COLORS[2] }),
  participant('nadia', 'Nadia Haddad', { role: 'Product Manager', org: 'Northwind Data', color: SPEAKER_COLORS[3] }),
  participant('raj', 'Raj Patel', { role: 'SRE Lead', org: 'Northwind Data', color: SPEAKER_COLORS[4] }),
  participant('sofia', 'Sofia Marchetti', { role: 'Head of Sales', org: 'Northwind Data', color: SPEAKER_COLORS[5] }),
  participant('priya', 'Priya Raghavan', { role: 'Account Executive', org: 'Northwind Data', color: SPEAKER_COLORS[6] }),
  participant('tom', 'Tom Okafor', { role: 'Solutions Engineer', org: 'Northwind Data', color: SPEAKER_COLORS[7] }),
];

export const turns = buildTurns(ID, [
  ['alina', "Okay, we're all here. This is the Q4 planning session — I want to leave with a ranked list and named owners, not a wish list. Nadia's going to walk the proposal, then we argue, then we cut. Raj has a hard stop at the hour so reliability goes first."],
  ['raj', 'Appreciate that.'],
  ['alina', "Raj, go ahead. What's the state of things?"],
  ['raj', "We had four Sev-2s last quarter. Three of them were the same root cause — the ingest workers fall behind, the queue backs up, and then the retry storm takes down the API for everyone rather than just the tenant that caused it. We've been papering over it with capacity."],
  ['ben', "It's not just capacity. There's no per-tenant isolation in the worker pool. One customer's bad afternoon is everyone's bad afternoon."],
  ['raj', 'Right, and that is the actual fix. Bulkheads per tenant. It is not small.'],
  ['alina', 'How not small?'],
  ['ben', "Six weeks with two people, and it touches the hot path, so it needs a real migration plan. I don't want to hand-wave that."],
  ['dev', "I'd push back slightly on the sequencing, not the work. If we're also doing per-service ingest policies for Meridian, those two things overlap heavily. Both are about scoping resources to a boundary."],
  ['alina', 'Say more.'],
  ['dev', "The policy engine needs to know 'this stream belongs to this tenant, this service, at this priority'. The bulkhead work needs exactly the same routing metadata. If we build them separately we build that twice and they'll disagree within a quarter."],
  ['ben', "That's a fair point and I hadn't connected them."],
  ['nadia', "Can I put the commercial context in, because it changes the weighting? Priya, do you want to do the Meridian piece?"],
  ['priya', "Sure. Meridian is a three hundred thousand dollar a year account that we do not have yet. Their observability spend tripled and the thing that actually hurt them was a forty minute mean time to identify during an outage in April. Dana Whitfield can sign inside his existing budget line, which means no CFO cycle."],
  ['sofia', 'Which is the unusual part. Most deals that size take a quarter just to find the budget.'],
  ['priya', "The blocker is timing on their side, not ours. Marcus Lee owns the implementation and he's tied up until their Kubernetes migration finishes end of Q3. So realistically they start in October."],
  ['alina', 'And what do we have to have built by October?'],
  ['tom', "Per-service ingest policies, and data staying in their account. Those are hard requirements, not nice-to-haves — they're HIPAA. I told them six to eight weeks for a phased rollout and I'd like that to remain true."],
  ['dev', 'Per-service policies are the piece my team would own. That is roughly four weeks if it is not competing with anything else.'],
  ['alina', 'And if it is competing?'],
  ['dev', 'Then it is eight and I will be unhappy about it.'],
  ['nadia', "So let me lay out what I brought, and then we can re-rank it in light of that. Four candidates for the quarter. One, per-tenant bulkheads — Raj and Ben's reliability work. Two, per-service ingest policies — the Meridian requirement. Three, the self-serve onboarding flow, which is the thing that moves our funnel numbers. Four, the audit-log product, which came up in three separate customer calls this month."],
  ['sofia', 'Four came up in five of mine.'],
  ['nadia', 'Then four is under-weighted in my list, noted.'],
  ['alina', 'Tell me about the audit log. Why is it suddenly everywhere?'],
  ['sofia', "Because every regulated buyer asks who looked at what, and we say 'you can query the logs' and they say 'no, we need a report we can hand an auditor'. It is the same conversation every time."],
  ['tom', "Meridian's version of that is a cron job that scrapes audit events into S3, and it has failed silently twice. Dana raised it unprompted and specifically asked us not to solve it with another cron job."],
  ['priya', "He said that almost word for word. It's the one thing he asked to be held to."],
  ['alina', 'So the audit log is not a nice-to-have for that account either.'],
  ['nadia', 'It is not, and I had it fourth. That is my mistake.'],
  ['ben', 'How big is the audit log, honestly? Because it sounds like a lot of scope hiding behind a small name.'],
  ['dev', "It depends entirely on whether we're building a report or building a product. A tenant-scoped, exportable access log with retention rules is maybe three weeks. A full compliance product with attestations and evidence packs is a quarter on its own."],
  ['sofia', 'Three weeks of that gets me through almost every conversation I am currently losing.'],
  ['alina', "Okay. Let's talk about self-serve, because it's the one I expect us to cut and I want to be honest about why rather than just quietly dropping it."],
  ['nadia', "I'll defend it. Our activation rate from signup to first ingested event is thirty-one percent. Everyone else in the category is north of sixty. That gap is the top of our funnel leaking."],
  ['sofia', "I don't disagree with the number. I disagree with the timing. Self-serve compounds over a year. Meridian is a decision in October."],
  ['nadia', 'That is the honest tension, yes.'],
  ['alina', 'Raj, does self-serve make reliability worse?'],
  ['raj', 'Materially, yes. More tenants, more small noisy ones, and the noisy-neighbour problem gets worse before the bulkheads land. I would not ship self-serve before isolation.'],
  ['ben', 'That is a sequencing constraint we should write down. Self-serve after bulkheads, not alongside.'],
  ['alina', 'Good, that is one decision made. What else is load-bearing?'],
  ['dev', "The overlap I raised. If bulkheads and ingest policies share routing metadata, I want them built by one team in one sequence, not two teams negotiating an interface across a quarter boundary."],
  ['alina', 'Who owns that combined piece?'],
  ['dev', 'I would take it if Ben is on it with me for the first three weeks.'],
  ['ben', "I can do that. I'd want to design the metadata model before either of us writes anything, because getting that wrong is the expensive failure."],
  ['raj', "I'll take the reliability instrumentation alongside so we can actually see whether isolation is working. That is not free but it is small."],
  ['alina', "So the shape I'm hearing is: one workstream that is routing metadata, then ingest policies, then bulkheads, owned by Dev and Ben. A second, smaller one that is the audit log. And self-serve moves to Q1."],
  ['nadia', 'That is what I am hearing too, and I think it is right even though it costs me my top item.'],
  ['alina', 'Does the combined workstream hit October for Meridian?'],
  ['dev', "Ingest policies, yes, if we start now. Bulkheads land after, more like end of November. But Meridian doesn't need bulkheads, they need policies and data residency."],
  ['tom', 'Correct. Policies and residency are the commitment. Bulkheads are our own problem.'],
  ['alina', 'Raj, are you okay carrying four more months of the current failure mode?'],
  ['raj', "Not happily. But if instrumentation lands early I'll at least see it coming instead of finding out from the status page. That I can live with."],
  ['alina', 'Write down what "early" means so it does not drift.'],
  ['raj', 'Two weeks. It is dashboards and alerting on queue depth per tenant, it is not research.'],
  ['sofia', 'Can I ask about the audit log owner? Because it is the one with no name attached.'],
  ['nadia', "I'll own the spec. I need an engineer."],
  ['alina', 'Tom, how much of your time is Meridian actually going to take?'],
  ['tom', "Meaningful through October, then it drops off. I could take the audit log after the Meridian rollout stabilises, but not before — I'd be doing both badly."],
  ['alina', "Then the audit log starts late October with Tom, spec from Nadia before that so he isn't waiting. Sofia, does that timing lose you deals between now and then?"],
  ['sofia', "It might lose one. But a promised date I can quote is worth more than a shipped feature I didn't know was coming, so give me the date and I'll work with it."],
  ['alina', "That's fair. Anything we are collectively pretending is smaller than it is?"],
  ['ben', "The metadata model. I said three weeks for design and build and I want to flag that if it turns out we need to change the on-disk format, that is a migration and the number doubles. I'll know within a week."],
  ['alina', 'Then come back in a week and tell us. That is a real checkpoint, not a formality.'],
  ['dev', 'Agreed.'],
  ['nadia', "One more thing I want on the record. We are deprioritising the only item on this list that improves the business without a salesperson in the room. I think that's the right call this quarter, and I think it is the wrong call twice in a row."],
  ['alina', "Noted, and I agree with both halves of that. Q1 self-serve is the commitment, and I'd rather be held to it than have it quietly slip again."],
  ['sofia', 'I will hold you to it.'],
  ['alina', "Let me read back what we decided. Dev and Ben own one combined workstream: metadata model first, then per-service ingest policies for October, then per-tenant bulkheads landing end of November. Ben reports back in a week on whether the metadata work requires a format migration. Raj ships per-tenant queue instrumentation inside two weeks so we can see the failure mode before it bites. Nadia specs the audit log, Tom builds it starting late October once Meridian has stabilised. Self-serve moves to Q1 and we are explicit that it is a deferral, not a cancellation. Anything wrong?"],
  ['dev', 'That matches what I agreed to.'],
  ['raj', 'Two weeks for instrumentation, yes.'],
  ['nadia', 'Spec before end of October so Tom is not blocked. I will put a date on it.'],
  ['tom', 'Works.'],
  ['alina', "Good. Priya, Sofia — anything you need from engineering for Meridian specifically that isn't on this list?"],
  ['priya', 'A sizing estimate against their real ingest numbers, which Tom is already doing. And I need it inside two weeks because that is what I promised on the call.'],
  ['tom', 'Marcus is sending the breakdown. I will have the estimate back well inside two weeks.'],
  ['alina', "Then we're done. Thanks everyone — this was a better argument than last quarter's."],
]);

export const durationMs = durationFromTurns(turns);

export const meeting: Meeting = {
  id: ID,
  title: 'Q4 Engineering Planning',
  startedAt: '2026-09-11T09:00:00.000Z',
  durationMs,
  platform: 'meet',
  status: 'recorded',
  participants,
  tags: ['planning', 'engineering', 'q4'],
  audioUrl: null,
  templateIds: ['general', 'engineering', 'action-items'],
  blurb:
    'Eight people, four competing priorities. Self-serve deferred to Q1; Meridian gates the ingest work.',
};

export const summaries: Summary[] = [
  {
    meetingId: ID,
    templateId: 'general',
    tldr:
      'Q4 ranked around the Meridian deal. Dev and Ben take one combined workstream — routing metadata, then per-service ingest policies for October, then per-tenant bulkheads by end of November. Audit log moves up from fourth to funded. Self-serve is explicitly deferred to Q1.',
    keyPoints: [
      { text: 'Three of last quarter\'s four Sev-2s share one root cause: no per-tenant isolation in the ingest worker pool, so one customer\'s overload becomes everyone\'s outage.', citation: citeTurns(turns, 4, 6) },
      { text: 'Bulkheads and per-service ingest policies need the same routing metadata — building them separately would duplicate it and let the two versions diverge.', citation: citeTurns(turns, 9, 12) },
      { text: 'Meridian is a ~$300k account, approvable without a CFO cycle, but gated on their Kubernetes migration finishing end of Q3.', citation: citeTurns(turns, 14, 16) },
      { text: 'The audit log was ranked fourth but surfaced in five of Sofia\'s customer calls; Nadia accepted the ranking was wrong.', citation: citeTurns(turns, 23, 30) },
      { text: 'Self-serve must not ship before tenant isolation — more small tenants makes the noisy-neighbour failure worse.', citation: citeTurns(turns, 39, 41) },
      { text: 'Activation from signup to first ingested event is 31% against a category benchmark above 60%. Deferring self-serve is a known, accepted cost.', citation: citeTurns(turns, 35, 37) },
    ],
    actionItems: [
      { id: `${ID}-a1`, text: 'Report back on whether the metadata model requires an on-disk format migration — doubles the estimate if so', ownerId: 'ben', dueDate: '2026-09-18', citation: citeTurns(turns, 66, 67) },
      { id: `${ID}-a2`, text: 'Ship per-tenant queue-depth instrumentation and alerting', ownerId: 'raj', dueDate: '2026-09-25', citation: citeTurns(turns, 56, 57) },
      { id: `${ID}-a3`, text: 'Spec the audit log so Tom is not blocked when he picks it up', ownerId: 'nadia', dueDate: '2026-10-31', citation: citeTurns(turns, 59, 73) },
      { id: `${ID}-a4`, text: 'Build the audit log, starting once the Meridian rollout has stabilised', ownerId: 'tom', dueDate: null, citation: citeTurns(turns, 61, 62) },
      { id: `${ID}-a5`, text: 'Deliver the Meridian sizing estimate against their real ingest numbers', ownerId: 'tom', dueDate: '2026-09-23', citation: citeTurns(turns, 76, 77) },
    ],
    topics: [
      { title: 'Reliability: the repeated Sev-2', summary: 'One root cause behind three of four incidents.', startMs: turns[2]!.startMs, endMs: turns[7]!.endMs },
      { title: 'The overlap nobody had spotted', summary: 'Bulkheads and ingest policies share routing metadata.', startMs: turns[8]!.startMs, endMs: turns[11]!.endMs },
      { title: 'Meridian as the forcing function', summary: '$300k, October start, HIPAA constraints.', startMs: turns[12]!.startMs, endMs: turns[20]!.endMs },
      { title: 'Ranking the four candidates', summary: 'Audit log under-weighted; self-serve contested.', startMs: turns[21]!.startMs, endMs: turns[32]!.endMs },
      { title: 'Cutting self-serve', summary: 'Deferred to Q1 on a reliability sequencing constraint.', startMs: turns[33]!.startMs, endMs: turns[41]!.endMs },
      { title: 'Ownership and dates', summary: 'Combined workstream, named owners, real checkpoints.', startMs: turns[42]!.startMs, endMs: turns[68]!.endMs },
      { title: 'Read-back and commitments', summary: 'Alina restates every decision for confirmation.', startMs: turns[71]!.startMs, endMs: turns[76]!.endMs },
    ],
  },
  {
    meetingId: ID,
    templateId: 'engineering',
    tldr:
      'One combined workstream replaces two planned ones after Dev identified that per-tenant bulkheads and per-service ingest policies depend on the same routing metadata. Sequencing is metadata → policies (October) → bulkheads (end November), with a one-week checkpoint on migration risk.',
    keyPoints: [
      { text: 'DECISION — Bulkheads and ingest policies merge into one workstream owned by Dev, with Ben for the first three weeks. Rationale: shared routing metadata, and two independent implementations would diverge within a quarter.', citation: citeTurns(turns, 9, 46) },
      { text: 'DECISION — Metadata model is designed before any implementation. Ben called getting it wrong "the expensive failure".', citation: citeTurns(turns, 46) },
      { text: 'RISK — If the metadata model requires an on-disk format change, that is a migration and the estimate doubles. Checkpoint in one week, explicitly not a formality.', citation: citeTurns(turns, 66, 67) },
      { text: 'CONSTRAINT — Self-serve must not ship before tenant isolation exists; more small tenants worsens the noisy-neighbour failure mode.', citation: citeTurns(turns, 39, 41) },
      { text: 'TRADE-OFF — Meridian needs policies and data residency, not bulkheads, so the customer commitment is decoupled from the internal reliability fix.', citation: citeTurns(turns, 52, 54) },
      { text: 'MITIGATION — Four more months of the current failure mode is accepted on the condition that per-tenant queue instrumentation lands within two weeks.', citation: citeTurns(turns, 55, 57) },
      { text: 'SCOPE — Audit log is three weeks as a tenant-scoped exportable access log, versus a full quarter as a compliance product. The narrower scope was chosen.', citation: citeTurns(turns, 31, 33) },
    ],
    actionItems: [
      { id: `${ID}-e1`, text: 'Design the routing metadata model before implementation begins', ownerId: 'ben', dueDate: '2026-09-18', citation: citeTurns(turns, 46) },
      { id: `${ID}-e2`, text: 'Confirm or rule out an on-disk format migration', ownerId: 'ben', dueDate: '2026-09-18', citation: citeTurns(turns, 66) },
      { id: `${ID}-e3`, text: 'Per-tenant queue-depth dashboards and alerting', ownerId: 'raj', dueDate: '2026-09-25', citation: citeTurns(turns, 57) },
      { id: `${ID}-e4`, text: 'Per-service ingest policies delivered for a Meridian October start', ownerId: 'dev', dueDate: '2026-10-31', citation: citeTurns(turns, 52) },
    ],
    topics: [
      { title: 'Root cause of the repeated Sev-2', summary: 'No per-tenant isolation in the worker pool.', startMs: turns[3]!.startMs, endMs: turns[7]!.endMs },
      { title: 'Metadata overlap', summary: 'The insight that merged two workstreams.', startMs: turns[8]!.startMs, endMs: turns[11]!.endMs },
      { title: 'Sequencing and risk', summary: 'Design first; migration risk checkpointed at one week.', startMs: turns[42]!.startMs, endMs: turns[67]!.endMs },
    ],
  },
  {
    meetingId: ID,
    templateId: 'action-items',
    tldr: 'Five commitments with named owners; one hard checkpoint in a week.',
    keyPoints: [],
    actionItems: [
      { id: `${ID}-c1`, text: 'Metadata format migration: confirm or rule out', ownerId: 'ben', dueDate: '2026-09-18', citation: citeTurns(turns, 66) },
      { id: `${ID}-c2`, text: 'Per-tenant queue instrumentation live', ownerId: 'raj', dueDate: '2026-09-25', citation: citeTurns(turns, 57) },
      { id: `${ID}-c3`, text: 'Meridian sizing estimate delivered', ownerId: 'tom', dueDate: '2026-09-23', citation: citeTurns(turns, 77) },
      { id: `${ID}-c4`, text: 'Audit log spec complete', ownerId: 'nadia', dueDate: '2026-10-31', citation: citeTurns(turns, 73) },
      { id: `${ID}-c5`, text: 'Per-service ingest policies ready for October', ownerId: 'dev', dueDate: '2026-10-31', citation: citeTurns(turns, 52) },
    ],
    topics: [],
  },
];
