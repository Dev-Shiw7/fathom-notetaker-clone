/**
 * Real summaries from a real transcript.
 *
 * Two stages, because a long meeting does not fit one prompt on a free-tier
 * rate limit:
 *
 *   1. Notes — the transcript is cut into blocks and each is reduced to
 *      cited facts, actions, decisions, questions and topics. Template-agnostic.
 *   2. Templates — each summary template is written from the merged notes only.
 *
 * Every claim the model returns names the numbered turns it came from, and we
 * turn those into `{ startMs, endMs }` citations. A claim whose references do
 * not resolve to real turns is dropped rather than shown uncited: the product's
 * rule (see types.ts) is that every AI statement can be traced into the
 * recording, and a model's invented reference must not pass for provenance.
 */
import { chatJson } from './groq';
import { formatTimestamp } from './analytics';
import { TEMPLATES } from '@/seed/templates';
import type { Participant, Summary, TranscriptTurn } from './types';

/** ~3.5k tokens of transcript per block, leaving room for the reply. */
const BLOCK_CHARS = 14_000;

interface RawItem {
  text?: string;
  owner?: string | null;
  due?: string | null;
  turns?: number[];
}
interface RawNotes {
  points?: RawItem[];
  actions?: RawItem[];
  decisions?: RawItem[];
  questions?: RawItem[];
  topics?: Array<{ title?: string; summary?: string; from?: number; to?: number }>;
}
interface RawSummary {
  tldr?: string;
  keyPoints?: RawItem[];
  actionItems?: RawItem[];
  topics?: Array<{ title?: string; summary?: string; from?: number; to?: number }>;
}

function renderTurn(index: number, turn: TranscriptTurn, name: string): string {
  return `[${index}] ${formatTimestamp(turn.startMs)} ${name}: ${turn.text}`;
}

function blocks(lines: string[]): string[] {
  const out: string[] = [];
  let current = '';
  for (const line of lines) {
    if (current && current.length + line.length > BLOCK_CHARS) {
      out.push(current);
      current = '';
    }
    current += `${line}\n`;
  }
  if (current) out.push(current);
  return out;
}

const NOTES_SYSTEM = `You extract structured notes from part of a meeting transcript.
Each line is "[n] mm:ss Speaker: text". Reply with a JSON object:
{"points":[{"text":string,"turns":[n]}],"actions":[{"text":string,"owner":string|null,"due":string|null,"turns":[n]}],"decisions":[{"text":string,"turns":[n]}],"questions":[{"text":string,"turns":[n]}],"topics":[{"title":string,"summary":string,"from":n,"to":n}]}
Rules: only record what the transcript actually says; never invent owners, dates or facts.
"turns" lists the [n] numbers that support the item. "owner" is a speaker name only if someone was clearly assigned or volunteered. Use empty arrays when there is nothing to record.`;

function templateSystem(focus: string): string {
  return `You write a meeting summary from structured notes. Focus: ${focus}
Reply with a JSON object:
{"tldr":string,"keyPoints":[{"text":string,"turns":[n]}],"actionItems":[{"text":string,"owner":string|null,"due":string|null,"turns":[n]}],"topics":[{"title":string,"summary":string,"from":n,"to":n}]}
Rules: use only facts present in the notes; keep every "turns" reference from the notes that supports an item; the tldr is two or three plain sentences; at most 8 keyPoints and 10 actionItems; do not invent owners or due dates.`;
}

function cite(turns: number[] | undefined, all: TranscriptTurn[]) {
  const valid = (turns ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n < all.length);
  if (valid.length === 0) return null;
  return {
    startMs: Math.min(...valid.map((n) => all[n]!.startMs)),
    endMs: Math.max(...valid.map((n) => all[n]!.endMs)),
  };
}

function ownerId(name: string | null | undefined, people: Participant[]): string | null {
  if (!name) return null;
  const wanted = name.trim().toLowerCase();
  const hit = people.find((p) => {
    const full = p.name.toLowerCase();
    return full === wanted || full.split(/\s+/)[0] === wanted.split(/\s+/)[0];
  });
  return hit?.id ?? null;
}

async function gatherNotes(lines: string[]): Promise<RawNotes> {
  const merged: Required<Pick<RawNotes, 'points' | 'actions' | 'decisions' | 'questions' | 'topics'>> = {
    points: [],
    actions: [],
    decisions: [],
    questions: [],
    topics: [],
  };
  for (const block of blocks(lines)) {
    const notes = await chatJson<RawNotes>(NOTES_SYSTEM, block, 1800);
    merged.points.push(...(notes.points ?? []));
    merged.actions.push(...(notes.actions ?? []));
    merged.decisions.push(...(notes.decisions ?? []));
    merged.questions.push(...(notes.questions ?? []));
    merged.topics.push(...(notes.topics ?? []));
  }
  return merged;
}

export interface SummaryResult {
  summaries: Summary[];
  /** Template ids that failed, so the caller can say so rather than hide it. */
  failed: string[];
}

export async function summarizeMeeting(input: {
  meetingId: string;
  title: string;
  participants: Participant[];
  turns: TranscriptTurn[];
}): Promise<SummaryResult> {
  const { turns, participants } = input;
  if (turns.length === 0) return { summaries: [], failed: [] };

  const nameOf = new Map(participants.map((p) => [p.id, p.name]));
  const lines = turns.map((turn, i) => renderTurn(i, turn, nameOf.get(turn.speakerId) ?? 'Speaker'));
  const notes = await gatherNotes(lines);
  const notesJson = JSON.stringify(notes);
  const header = `Meeting: ${input.title}\nParticipants: ${participants.map((p) => p.name).join(', ')}\nNotes:\n${notesJson}`;

  const summaries: Summary[] = [];
  const failed: string[] = [];

  // Sequential on purpose: these share one rate limit, and the 429 backoff in
  // the client is what keeps them all landing on the free tier.
  for (const template of TEMPLATES) {
    try {
      const raw = await chatJson<RawSummary>(templateSystem(template.description), header, 1800);

      const keyPoints = (raw.keyPoints ?? []).flatMap((item) => {
        const citation = cite(item.turns, turns);
        return item.text && citation ? [{ text: item.text, citation }] : [];
      });
      const actionItems = (raw.actionItems ?? []).flatMap((item, i) => {
        const citation = cite(item.turns, turns);
        return item.text && citation
          ? [
              {
                id: `${input.meetingId}-${template.id}-action-${i}`,
                text: item.text,
                ownerId: ownerId(item.owner, participants),
                dueDate: item.due ?? null,
                citation,
              },
            ]
          : [];
      });
      const topics = (raw.topics ?? []).flatMap((topic) => {
        const citation = cite([topic.from ?? -1, topic.to ?? -1], turns);
        return topic.title && citation
          ? [{ title: topic.title, summary: topic.summary ?? '', startMs: citation.startMs, endMs: citation.endMs }]
          : [];
      });

      if (!raw.tldr) throw new Error('empty summary');
      summaries.push({
        meetingId: input.meetingId,
        templateId: template.id,
        tldr: raw.tldr,
        keyPoints,
        actionItems,
        topics,
      });
    } catch (err) {
      console.error(`[summarize] ${template.id} failed:`, (err as Error).message);
      failed.push(template.id);
    }
  }
  return { summaries, failed };
}
