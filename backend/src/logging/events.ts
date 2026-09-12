/**
 * Structured event logging.
 *
 * Every meaningful thing the bot does becomes one JSON object on one line in
 * `events.jsonl`. That file — not a database, not the console — is the contract
 * downstream services consume. It is append-only, replayable, and readable
 * without any infrastructure.
 *
 * Writes are synchronous (`appendFileSync`) on purpose: the bot can be killed
 * mid-call, and a buffered stream would lose exactly the events explaining why.
 * Volume is low enough (tens per session) that the cost is irrelevant.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EventPayloads, EventType } from '../types.js';

/** Builds a filesystem-safe, sortable session directory name. */
export function buildSessionDirName(
  meetingCode: string | null,
  startedAt: Date,
): { sessionId: string; dirName: string } {
  const sessionId = randomUUID();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const code = meetingCode ?? 'unknown';
  return { sessionId, dirName: `${stamp}_${code}_${sessionId.slice(0, 8)}` };
}

export class SessionLogger {
  readonly sessionId: string;
  readonly sessionDir: string;
  readonly eventsPath: string;

  private seq = 0;

  constructor(sessionId: string, sessionDir: string) {
    this.sessionId = sessionId;
    this.sessionDir = sessionDir;
    this.eventsPath = join(sessionDir, 'events.jsonl');
    mkdirSync(sessionDir, { recursive: true });
  }

  emit<K extends EventType>(type: K, payload: EventPayloads[K]): void {
    this.seq += 1;
    const event = {
      v: 1 as const,
      seq: this.seq,
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      type,
      ...payload,
    };
    appendFileSync(this.eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
    process.stdout.write(`${formatForHuman(type, payload)}\n`);
  }

  /** Writes the final outcome summary alongside the event stream. */
  writeMeta(meta: Record<string, unknown>): void {
    appendFileSync(
      join(this.sessionDir, 'meta.json'),
      `${JSON.stringify(meta, null, 2)}\n`,
      'utf8',
    );
  }
}

const HUMAN_HINTS: Partial<Record<EventType, string>> = {
  'session.started': '▶',
  'browser.launched': '◆',
  'navigation.completed': '→',
  'state.changed': '·',
  'admission.granted': '✓',
  'admission.denied': '✗',
  'admission.timeout': '⏱',
  'consent.disclosed': '💬',
  'leave.completed': '←',
  'session.ended': '■',
  'selector.miss': '⚠',
  error: '✗',
  warn: '⚠',
};

/**
 * Renders an event as a single readable console line. The JSONL file stays the
 * machine-readable artifact; this exists so a human watching a live run can see
 * what is happening without `jq`.
 */
function formatForHuman(type: EventType, payload: object): string {
  const time = new Date().toISOString().slice(11, 19);
  const icon = HUMAN_HINTS[type] ?? ' ';
  const detail = Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => {
      const rendered =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `${key}=${rendered.length > 120 ? `${rendered.slice(0, 117)}...` : rendered}`;
    })
    .join(' ');
  return `${time} ${icon} ${type.padEnd(22)} ${detail}`.trimEnd();
}
