/**
 * "Ask" over the real transcripts.
 *
 * Retrieval first, generation second. The question is scored against every
 * stored transcript turn (BM25), the best turns plus their neighbours become
 * the model's only context, and the answer must cite them. If retrieval finds
 * nothing relevant the model is never called, which is what keeps this from
 * answering confidently from nowhere.
 */
import { chatJson } from './groq';
import { formatTimestamp } from './analytics';
import { getTranscript, listMeetings } from './data';
import type { Citation, Meeting, TranscriptTurn } from './types';

const STOP = new Set(
  'the a an and or but of to in on at for with about what who when where why how did does do is are was were be been this that these those it its we you they i our your their from by as can could should would will just have has had any all not there than then so if'.split(
    ' ',
  ),
);

const tokens = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

interface Doc {
  meeting: Meeting;
  turns: TranscriptTurn[];
  index: number;
  terms: string[];
}

export interface AskSource {
  meetingId: string;
  citation: Citation;
  quote: string;
}
export interface AskAnswer {
  answer: string;
  sources: AskSource[];
}

const MAX_TURNS = 8;

export async function askQuestion(question: string, meetingId?: string): Promise<AskAnswer> {
  const meetings = (await listMeetings()).filter((m) => !meetingId || m.id === meetingId);

  const docs: Doc[] = [];
  const nameFor = new Map<string, string>();
  for (const meeting of meetings) {
    const transcript = await getTranscript(meeting.id);
    if (!transcript) continue;
    for (const p of meeting.participants) nameFor.set(`${meeting.id}:${p.id}`, p.name);
    transcript.turns.forEach((turn, index) =>
      docs.push({ meeting, turns: transcript.turns, index, terms: tokens(turn.text) }),
    );
  }

  const query = Array.from(new Set(tokens(question)));
  if (docs.length === 0 || query.length === 0) {
    return { answer: 'There is nothing recorded to answer that from yet.', sources: [] };
  }

  // BM25 over turns.
  const N = docs.length;
  const avg = docs.reduce((sum, d) => sum + d.terms.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const term of query) df.set(term, docs.filter((d) => d.terms.includes(term)).length);

  const scored = docs
    .map((doc) => {
      let score = 0;
      for (const term of query) {
        const n = df.get(term) ?? 0;
        if (n === 0) continue;
        const tf = doc.terms.filter((t) => t === term).length;
        if (tf === 0) continue;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += (idf * (tf * 2.2)) / (tf + 1.2 * (0.25 + (0.75 * doc.terms.length) / avg));
      }
      return { doc, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_TURNS);

  if (scored.length === 0) {
    return { answer: "I couldn't find anything in your recordings that speaks to that.", sources: [] };
  }

  // Context: each hit with its neighbours, deduplicated and in call order.
  const wanted = new Map<string, Doc>();
  for (const { doc } of scored) {
    for (const i of [doc.index - 1, doc.index, doc.index + 1]) {
      if (i < 0 || i >= doc.turns.length) continue;
      wanted.set(`${doc.meeting.id}#${i}`, { ...doc, index: i });
    }
  }
  const context = [...wanted.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  const lines = context.map(([ref, doc]) => {
    const turn = doc.turns[doc.index]!;
    const who = nameFor.get(`${doc.meeting.id}:${turn.speakerId}`) ?? 'Speaker';
    return `(${ref}) [${doc.meeting.title} ${formatTimestamp(turn.startMs)}] ${who}: ${turn.text}`;
  });

  const result = await chatJson<{ answer?: string; sources?: Array<{ ref?: string; quote?: string }> }>(
    `You answer questions about recorded meetings using ONLY the transcript excerpts provided.
Each excerpt starts with a reference like (meeting-id#3). Reply with JSON:
{"answer":string,"sources":[{"ref":string,"quote":string}]}
Rules: answer in one to four sentences; if the excerpts do not answer the question, say so plainly and return no sources; each source "ref" must be copied exactly from an excerpt and "quote" must be a short verbatim phrase from it. Do not use outside knowledge.`,
    `Question: ${question}\n\nExcerpts:\n${lines.join('\n')}`,
    700,
  );

  const byRef = new Map(context);
  const sources: AskSource[] = [];
  for (const source of result.sources ?? []) {
    const doc = source.ref ? byRef.get(source.ref) : undefined;
    if (!doc) continue; // a reference the model made up is not a citation
    const turn = doc.turns[doc.index]!;
    sources.push({
      meetingId: doc.meeting.id,
      citation: { startMs: turn.startMs, endMs: turn.endMs },
      quote: source.quote?.trim() || turn.text.slice(0, 140),
    });
  }

  return {
    answer: result.answer?.trim() || "I couldn't form an answer from what was recorded.",
    sources: sources.slice(0, 4),
  };
}
